use std::collections::{BTreeSet, HashMap};
use std::time::Instant;

use smithay::backend::allocator::Fourcc;
use smithay::backend::allocator::format::FormatSet;
use smithay::backend::allocator::gbm::{GbmAllocator, GbmBufferFlags, GbmDevice};
use smithay::backend::drm::compositor::{DrmCompositor, FrameFlags, PrimaryPlaneElement};
use smithay::backend::drm::exporter::gbm::GbmFramebufferExporter;

use smithay::backend::drm::{DrmDevice, DrmDeviceFd, DrmDeviceNotifier, DrmEvent, DrmNode};
use smithay::backend::egl::{EGLContext, EGLDisplay};
use smithay::backend::input::{
    AbsolutePositionEvent, Axis, ButtonState, Event, InputEvent, KeyState, KeyboardKeyEvent,
    PointerAxisEvent, PointerButtonEvent, PointerMotionEvent, TouchEvent,
};
use smithay::backend::libinput::{LibinputInputBackend, LibinputSessionInterface};
use smithay::backend::renderer::element::Kind as ElementKind;
use smithay::backend::renderer::element::memory::{
    MemoryRenderBuffer, MemoryRenderBufferRenderElement,
};
use smithay::backend::renderer::gles::GlesRenderer;
use smithay::backend::session::libseat::LibSeatSession;
use smithay::backend::session::{Event as SessionEvent, Session};
use smithay::backend::udev::{self, UdevBackend, UdevEvent};
use smithay::input::keyboard::{FilterResult, Keysym};
use smithay::output::OutputModeSource;
use smithay::reexports::calloop::LoopHandle;
use smithay::reexports::calloop::timer::{TimeoutAction, Timer};
use smithay::reexports::drm::control::property::ValueType;
use smithay::reexports::drm::control::{Device as _, Mode, ModeTypeFlags, connector, crtc};
use smithay::reexports::input::Libinput;
use smithay::reexports::rustix::fs::OFlags;
use smithay::utils::{DeviceFd, Point, SERIAL_COUNTER, Scale, Size, Transform};
use tiny_skia::{Color, FillRule, Paint, PathBuilder, Pixmap, Stroke};

use crate::render::LiviElement;
use crate::state::LiviState;

type Surface =
    DrmCompositor<GbmAllocator<DrmDeviceFd>, GbmFramebufferExporter<DrmDeviceFd>, (), DrmDeviceFd>;

pub struct DrmState {
    session: LibSeatSession,
    libinput: Libinput,
    device: DrmDevice,
    gbm: GbmDevice<DrmDeviceFd>,
    formats: FormatSet,
    import_node: Option<DrmNode>,
    loop_handle: LoopHandle<'static, LiviState>,
    connectors: Vec<Connector>,
    outputs: Vec<Output>,
    wanted: BTreeSet<usize>,
    mode_settings: HashMap<usize, Option<String>>,
    touch_outputs: HashMap<String, String>,
    active: bool,
    mouse_active: bool,
    cursor: MemoryRenderBuffer,
}

struct Connector {
    handle: connector::Handle,
    name: String,
    panel: String,
    connected: bool,
    modes: Vec<Mode>,
    panel_mm: Option<(i32, i32)>,
    transform: Transform,
    crtcs: Vec<crtc::Handle>,
}

struct Output {
    screen_idx: usize,
    connector: String,
    crtc: crtc::Handle,
    mode: Mode,
    transform: Transform,
    surface: Surface,
    frame_pending: bool,
    direct: usize,
    needs_redraw: bool,
}

impl Output {
    fn physical(&self) -> (i32, i32) {
        let (w, h) = self.mode.size();
        (i32::from(w), i32::from(h))
    }

    fn logical(&self) -> (i32, i32) {
        let size = self
            .transform
            .transform_size(Size::<i32, smithay::utils::Physical>::from(self.physical()));
        (size.w, size.h)
    }
}

enum KeyAction {
    SwitchVt(i32),
    Quit,
}

pub fn wanted() -> bool {
    match std::env::var("LIVI_COMPOSITOR_BACKEND").as_deref() {
        Ok("drm") => true,
        Ok("wayland") => false,
        _ => std::env::var_os("WAYLAND_DISPLAY").is_none_or(|v| v.is_empty()),
    }
}

pub fn init(state: &mut LiviState, handle: &LoopHandle<'static, LiviState>) {
    match start(state, handle) {
        Ok(drm) => {
            state.drm = Some(drm);
            arrange(state);
        }
        Err(e) => {
            log::error!("cannot drive the display directly: {e}");
            state.running = false;
        }
    }
}

fn start(
    state: &mut LiviState,
    handle: &LoopHandle<'static, LiviState>,
) -> Result<DrmState, Box<dyn std::error::Error>> {
    let (mut session, session_events) = LibSeatSession::new()?;
    handle
        .insert_source(session_events, |event, _, state: &mut LiviState| {
            session_event(state, event)
        })
        .map_err(|e| e.error)?;
    let seat = session.seat();
    let (device, notifier, fd) = open_device(&mut session, &seat)?;

    let gbm = GbmDevice::new(fd.clone())?;
    let egl_display = unsafe { EGLDisplay::new(gbm.clone())? };
    let renderer = unsafe { GlesRenderer::new(EGLContext::new(&egl_display)?)? };
    let formats = renderer.egl_context().dmabuf_render_formats().clone();
    let scanout = fd.dev_id().ok().map(|dev| (dev, plane_formats(&device)));
    crate::host::serve_dmabuf(state, &egl_display, &renderer, scanout);
    let import_node = state
        .render_node
        .as_deref()
        .and_then(|node| DrmNode::from_path(node).ok());
    state.renderer = Some(renderer);

    handle
        .insert_source(notifier, |event, _, state: &mut LiviState| match event {
            DrmEvent::VBlank(crtc) => vblank(state, crtc),
            DrmEvent::Error(e) => log::error!("display: {e}"),
        })
        .map_err(|e| e.error)?;

    let udev = UdevBackend::new(&seat)?;
    handle
        .insert_source(udev, |event, _, state: &mut LiviState| {
            if let UdevEvent::Changed { .. } = event {
                rescan(state);
            }
        })
        .map_err(|e| e.error)?;

    let mut libinput = Libinput::new_with_udev(LibinputSessionInterface::from(session.clone()));
    libinput
        .udev_assign_seat(&seat)
        .map_err(|()| format!("libinput cannot take seat {seat}"))?;
    handle
        .insert_source(
            LibinputInputBackend::new(libinput.clone()),
            |event, _, state: &mut LiviState| input(state, event),
        )
        .map_err(|e| e.error)?;

    state.seat.add_keyboard(Default::default(), 600, 25)?;
    state.seat.add_pointer();
    state.seat.add_touch();

    let connectors = connectors(&device, false);
    log::info!("driving the displays directly on seat {seat}");
    Ok(DrmState {
        session,
        libinput,
        device,
        gbm,
        formats,
        import_node,
        loop_handle: handle.clone(),
        connectors,
        outputs: Vec::new(),
        wanted: BTreeSet::from([0]),
        mode_settings: HashMap::new(),
        touch_outputs: HashMap::new(),
        active: true,
        mouse_active: false,
        cursor: cursor_image(),
    })
}

fn open_device(
    session: &mut LibSeatSession,
    seat: &str,
) -> Result<(DrmDevice, DrmDeviceNotifier, DrmDeviceFd), Box<dyn std::error::Error>> {
    for path in udev::all_gpus(seat)? {
        let flags = OFlags::RDWR | OFlags::CLOEXEC | OFlags::NOCTTY | OFlags::NONBLOCK;
        let fd = match session.open(&path, flags) {
            Ok(fd) => DrmDeviceFd::new(DeviceFd::from(fd)),
            Err(e) => {
                log::warn!("cannot open {}: {e}", path.display());
                continue;
            }
        };
        let (device, notifier) = match DrmDevice::new(fd.clone(), true) {
            Ok(opened) => opened,
            Err(e) => {
                log::info!("{} drives no display: {e}", path.display());
                continue;
            }
        };
        if connectors(&device, false).iter().any(|c| c.connected) {
            log::info!("displays on {}", path.display());
            return Ok((device, notifier, fd));
        }
    }
    Err("no connected display".into())
}

fn plane_formats(device: &DrmDevice) -> FormatSet {
    let Ok(resources) = device.resource_handles() else {
        return FormatSet::default();
    };
    resources
        .crtcs()
        .iter()
        .filter_map(|crtc| device.planes(crtc).ok())
        .flat_map(|planes| planes.overlay.into_iter().chain(planes.primary))
        .flat_map(|plane| plane.formats.into_iter())
        .collect()
}

fn connectors(device: &DrmDevice, probe: bool) -> Vec<Connector> {
    let Ok(resources) = device.resource_handles() else {
        return Vec::new();
    };
    resources
        .connectors()
        .iter()
        .filter_map(|&handle| {
            let info = device.get_connector(handle, probe).ok()?;
            let crtcs = info
                .encoders()
                .iter()
                .filter_map(|&e| device.get_encoder(e).ok())
                .flat_map(|e| resources.filter_crtcs(e.possible_crtcs()))
                .collect();
            let name = format!("{}-{}", info.interface().as_str(), info.interface_id());
            let edid = property(device, handle, "EDID")
                .and_then(|(_, blob)| device.get_property_blob(blob).ok());
            Some(Connector {
                handle,
                panel: edid.as_deref().and_then(panel_name).unwrap_or_default(),
                connected: info.state() == connector::State::Connected,
                modes: info.modes().to_vec(),
                panel_mm: info
                    .size()
                    .filter(|&(w, h)| w > 0 && h > 0)
                    .map(|(w, h)| (w as i32, h as i32)),
                transform: orientation(device, handle),
                crtcs,
                name,
            })
        })
        .collect()
}

fn property(
    device: &DrmDevice,
    handle: connector::Handle,
    wanted: &str,
) -> Option<(smithay::reexports::drm::control::property::Info, u64)> {
    let props = device.get_properties(handle).ok()?;
    let (ids, values) = props.as_props_and_values();
    ids.iter().zip(values).find_map(|(&id, &value)| {
        let info = device.get_property(id).ok()?;
        (info.name().to_str() == Ok(wanted)).then_some((info, value))
    })
}

fn orientation(device: &DrmDevice, handle: connector::Handle) -> Transform {
    let Some((info, raw)) = property(device, handle, "panel orientation") else {
        return Transform::Normal;
    };
    let ValueType::Enum(values) = info.value_type() else {
        return Transform::Normal;
    };
    let Some(value) = values.get_value_from_raw_value(raw) else {
        return Transform::Normal;
    };
    match value.name().to_str() {
        Ok("Upside Down") => Transform::_180,
        Ok("Left Side Up") => Transform::_90,
        Ok("Right Side Up") => Transform::_270,
        _ => Transform::Normal,
    }
}

fn panel_name(edid: &[u8]) -> Option<String> {
    edid.get(54..126)?.chunks(18).find_map(|block| {
        if block[..3] != [0, 0, 0] || block[3] != 0xFC {
            return None;
        }
        let text: String = block[5..]
            .iter()
            .take_while(|&&b| b != 0x0A && b != 0)
            .map(|&b| b as char)
            .collect();
        let text = text.trim().to_string();
        (!text.is_empty()).then_some(text)
    })
}

fn role_env(state: &LiviState, screen_idx: usize, what: &str) -> Option<String> {
    let role = state.screens.get(screen_idx)?.role.to_uppercase();
    let key = if what == "DISPLAY_MODE" && role == "MAIN" {
        "LIVI_DISPLAY_MODE".to_string()
    } else {
        format!("LIVI_{role}_{what}")
    };
    std::env::var(key).ok().filter(|v| !v.is_empty())
}

fn mode_setting(state: &LiviState, screen_idx: usize) -> Option<String> {
    state
        .drm
        .as_ref()
        .and_then(|d| d.mode_settings.get(&screen_idx).cloned())
        .unwrap_or_else(|| role_env(state, screen_idx, "DISPLAY_MODE"))
}

pub fn set_mode(state: &mut LiviState, screen_idx: usize, setting: Option<String>) {
    let Some(drm) = state.drm.as_mut() else {
        return;
    };
    let picked = drm
        .outputs
        .iter()
        .position(|o| o.screen_idx == screen_idx)
        .and_then(|pos| {
            let output = &drm.outputs[pos];
            let connector = drm.connectors.iter().find(|c| c.name == output.connector)?;
            let mode = pick_mode(&connector.modes, setting.as_deref())?;
            (mode != output.mode).then_some(pos)
        });
    drm.mode_settings.insert(screen_idx, setting);
    if let Some(pos) = picked {
        drm.outputs.remove(pos);
        arrange(state);
    }
}

fn assign(wanted: &[(usize, Option<String>)], connected: &[String]) -> Vec<(usize, String)> {
    let is_free = |taken: &[(usize, String)], name: &str| !taken.iter().any(|(_, t)| t == name);
    let mut taken: Vec<(usize, String)> = Vec::new();
    let claimed: Vec<&String> = wanted
        .iter()
        .filter(|(s, _)| *s != 0)
        .filter_map(|(_, c)| c.as_ref())
        .collect();
    if let Some((_, configured)) = wanted.iter().find(|(s, _)| *s == 0) {
        let main = configured
            .as_ref()
            .filter(|n| connected.contains(n))
            .or_else(|| connected.iter().find(|n| !claimed.contains(n)))
            .or(connected.first());
        if let Some(name) = main {
            taken.push((0, name.clone()));
        }
    }
    for (screen, configured) in wanted.iter().filter(|(s, _)| *s != 0) {
        if let Some(name) = configured
            && connected.contains(name)
            && is_free(&taken, name)
        {
            taken.push((*screen, name.clone()));
        }
    }
    for (screen, _) in wanted.iter().filter(|(s, c)| *s != 0 && c.is_none()) {
        if let Some(name) = connected.iter().find(|n| is_free(&taken, n)) {
            taken.push((*screen, name.clone()));
        }
    }
    taken.sort();
    taken
}

pub fn open_screen(state: &mut LiviState, screen_idx: usize) {
    if let Some(drm) = state.drm.as_mut()
        && drm.wanted.insert(screen_idx)
    {
        arrange(state);
    }
}

pub fn close_screen(state: &mut LiviState, screen_idx: usize) {
    if screen_idx != 0
        && let Some(drm) = state.drm.as_mut()
        && drm.wanted.remove(&screen_idx)
    {
        arrange(state);
    }
}

fn rescan(state: &mut LiviState) {
    let Some(drm) = state.drm.as_mut() else {
        return;
    };
    drm.connectors = connectors(&drm.device, true);
    arrange(state);
}

fn arrange(state: &mut LiviState) {
    let Some(wanted) = state.drm.as_ref().map(|d| d.wanted.clone()) else {
        return;
    };
    let wanted: Vec<(usize, Option<String>)> = wanted
        .iter()
        .map(|&idx| (idx, role_env(state, idx, "CONNECTOR")))
        .collect();
    let Some(drm) = state.drm.as_mut() else {
        return;
    };
    let connected: Vec<String> = drm
        .connectors
        .iter()
        .filter(|c| c.connected)
        .map(|c| c.name.clone())
        .collect();
    let plan = assign(&wanted, &connected);
    let before = drm.outputs.len();
    drm.outputs
        .retain(|o| plan.contains(&(o.screen_idx, o.connector.clone())));
    let mut changed = drm.outputs.len() != before;
    for (screen_idx, name) in plan {
        let present = state
            .drm
            .as_ref()
            .is_some_and(|d| d.outputs.iter().any(|o| o.screen_idx == screen_idx));
        if present {
            continue;
        }
        let mode_setting = mode_setting(state, screen_idx);
        match light(state, screen_idx, &name, mode_setting.as_deref()) {
            Ok(()) => changed = true,
            Err(e) => log::error!("{name} for screen {screen_idx} did not light up: {e}"),
        }
    }
    if changed {
        crate::ctrl::send_displays(state);
        crate::ctrl::send_panels(state);
    }
    apply_calibration(state);
}

pub fn apply_calibration(state: &mut LiviState) {
    let Some(drm) = state.drm.as_ref() else {
        state.cal.in_lut = false;
        return;
    };
    let mut all = !drm.outputs.is_empty();
    for output in &drm.outputs {
        let size = drm
            .device
            .get_crtc(output.crtc)
            .map(|info| info.gamma_length() as usize)
            .unwrap_or(0);
        if size < 2 {
            log::info!(
                "{} has no gamma table, calibration runs in the shader",
                output.connector
            );
            all = false;
            continue;
        }
        let [r, g, b] = crate::cal::curves(&state.cal, size);
        if let Err(e) = drm.device.set_gamma(output.crtc, &r, &g, &b) {
            log::error!("{} refused the gamma table: {e}", output.connector);
            all = false;
        }
    }
    state.cal.in_lut = all;
}

fn light(
    state: &mut LiviState,
    screen_idx: usize,
    name: &str,
    mode_setting: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
    let drm = state.drm.as_mut().ok_or("no display device")?;
    let connector = drm
        .connectors
        .iter()
        .find(|c| c.name == name)
        .ok_or("connector gone")?;
    let mode = pick_mode(&connector.modes, mode_setting).ok_or("no mode")?;
    let busy: Vec<crtc::Handle> = drm.outputs.iter().map(|o| o.crtc).collect();
    let crtc = *connector
        .crtcs
        .iter()
        .find(|c| !busy.contains(c))
        .ok_or("no free crtc")?;
    let (handle, transform) = (connector.handle, connector.transform);
    let surface = drm.device.create_surface(crtc, mode, &[handle])?;
    let allocator = GbmAllocator::new(
        drm.gbm.clone(),
        GbmBufferFlags::RENDERING | GbmBufferFlags::SCANOUT,
    );
    let (w, h) = mode.size();
    let source = OutputModeSource::Static {
        size: Size::from((i32::from(w), i32::from(h))),
        scale: Scale::from(1.0),
        transform,
    };
    let surface = DrmCompositor::new(
        source,
        surface,
        None,
        allocator,
        GbmFramebufferExporter::new(drm.gbm.clone(), drm.import_node),
        [Fourcc::Argb8888, Fourcc::Xrgb8888],
        drm.formats.clone(),
        drm.device.cursor_size(),
        Some(drm.gbm.clone()),
    )
    .map_err(|e| e.to_string())?;
    let output = Output {
        screen_idx,
        connector: name.to_string(),
        crtc,
        mode,
        transform,
        surface,
        frame_pending: false,
        direct: 0,
        needs_redraw: true,
    };
    let (lw, lh) = output.logical();
    drm.outputs.push(output);
    let screen = &mut state.screens[screen_idx];
    screen.width = lw;
    screen.height = lh;
    screen.fullscreen = true;
    screen.resize_pending = Some(Instant::now());
    crate::host::ensure_server_output(state, screen_idx);
    crate::layout::apply_ui_layout(state, screen_idx);
    log::info!(
        "screen '{}' on {name}: {w}x{h}@{} {transform:?}",
        state.screens[screen_idx].role,
        mode.vrefresh()
    );
    Ok(())
}

#[derive(Clone, Copy)]
struct Offered {
    size: (u16, u16),
    refresh: u32,
    preferred: bool,
}

impl Offered {
    fn area(&self) -> u32 {
        u32::from(self.size.0) * u32::from(self.size.1)
    }

    fn fits_hd(&self) -> bool {
        self.area() <= 1280 * 720
    }
}

fn pick_mode(modes: &[Mode], setting: Option<&str>) -> Option<Mode> {
    let offered: Vec<Offered> = modes
        .iter()
        .map(|m| Offered {
            size: m.size(),
            refresh: m.vrefresh(),
            preferred: m.mode_type().contains(ModeTypeFlags::PREFERRED),
        })
        .collect();
    choose(&offered, setting.and_then(size_of)).map(|i| modes[i])
}

fn size_of(mode: &str) -> Option<(u16, u16)> {
    let (w, h) = mode.split_once('x')?;
    Some((w.parse().ok()?, h.parse().ok()?))
}

fn choose(modes: &[Offered], configured: Option<(u16, u16)>) -> Option<usize> {
    let largest = |fits: &dyn Fn(&Offered) -> bool| {
        modes
            .iter()
            .enumerate()
            .filter(|(_, m)| fits(m))
            .max_by_key(|(_, m)| (m.area(), m.refresh))
            .map(|(i, _)| i)
    };
    if let Some(size) = configured
        && let Some(i) = largest(&|m| m.size == size)
    {
        return Some(i);
    }
    if let Some(i) = modes.iter().position(|m| m.preferred && m.fits_hd()) {
        return Some(i);
    }
    largest(&Offered::fits_hd).or_else(|| {
        modes
            .iter()
            .enumerate()
            .min_by_key(|(_, m)| m.area())
            .map(|(i, _)| i)
    })
}

fn sizes(modes: &[Mode]) -> Vec<String> {
    let mut sizes: Vec<(u16, u16)> = Vec::new();
    for mode in modes {
        if !sizes.contains(&mode.size()) {
            sizes.push(mode.size());
        }
    }
    sizes.sort_by_key(|&(w, h)| std::cmp::Reverse(u32::from(w) * u32::from(h)));
    sizes.iter().map(|(w, h)| format!("{w}x{h}")).collect()
}

pub fn displays_lines(state: &LiviState) -> Option<String> {
    let drm = state.drm.as_ref()?;
    let shown: Vec<&Connector> = drm.connectors.iter().filter(|c| c.connected).collect();
    let mut out = format!("displays {}\n", shown.len());
    for c in shown {
        let output = drm.outputs.iter().find(|o| o.connector == c.name);
        let role = output
            .and_then(|o| state.screens.get(o.screen_idx))
            .map_or("-", |s| s.role.as_str());
        let current = output.map_or("-".to_string(), |o| {
            let (w, h) = o.mode.size();
            format!("{w}x{h}@{}", o.mode.vrefresh())
        });
        let modes = sizes(&c.modes);
        let modes = if modes.is_empty() {
            "-".to_string()
        } else {
            modes.join(",")
        };
        out.push_str(&format!(
            "display {} {role} {current} {modes} {}\n",
            c.name, c.panel
        ));
    }
    Some(out)
}

pub fn panel_mm(state: &LiviState, screen_idx: usize) -> Option<(i32, i32)> {
    let drm = state.drm.as_ref()?;
    let output = drm.outputs.iter().find(|o| o.screen_idx == screen_idx)?;
    let (w, h) = drm
        .connectors
        .iter()
        .find(|c| c.name == output.connector)?
        .panel_mm?;
    let turned = output
        .transform
        .transform_size(Size::<i32, smithay::utils::Physical>::from((w, h)));
    Some((turned.w, turned.h))
}

fn cursor_image() -> MemoryRenderBuffer {
    let mut pixmap = Pixmap::new(14, 22).expect("cursor pixmap");
    let mut path = PathBuilder::new();
    for (i, (x, y)) in [
        (1.0, 1.0),
        (1.0, 17.0),
        (5.0, 13.5),
        (8.0, 20.5),
        (10.5, 19.5),
        (7.5, 12.5),
        (12.5, 12.5),
    ]
    .into_iter()
    .enumerate()
    {
        if i == 0 {
            path.move_to(x, y);
        } else {
            path.line_to(x, y);
        }
    }
    path.close();
    let path = path.finish().expect("cursor path");
    let mut paint = Paint::default();
    paint.set_color(Color::WHITE);
    paint.anti_alias = true;
    pixmap.fill_path(
        &path,
        &paint,
        FillRule::Winding,
        tiny_skia::Transform::identity(),
        None,
    );
    paint.set_color(Color::BLACK);
    let stroke = Stroke {
        width: 1.2,
        ..Default::default()
    };
    pixmap.stroke_path(
        &path,
        &paint,
        &stroke,
        tiny_skia::Transform::identity(),
        None,
    );
    crate::deco::to_buffer(&pixmap)
}

fn session_event(state: &mut LiviState, event: SessionEvent) {
    let Some(drm) = state.drm.as_mut() else {
        return;
    };
    match event {
        SessionEvent::PauseSession => {
            log::info!("session paused");
            drm.libinput.suspend();
            drm.device.pause();
            drm.active = false;
        }
        SessionEvent::ActivateSession => {
            log::info!("session active");
            if drm.libinput.resume().is_err() {
                log::error!("libinput did not resume");
            }
            if let Err(e) = drm.device.activate(false) {
                log::error!("display did not resume: {e}");
            }
            drm.active = true;
            for output in &mut drm.outputs {
                if let Err(e) = output.surface.reset_state() {
                    log::error!("{} did not reset: {e}", output.connector);
                }
                output.frame_pending = false;
                output.needs_redraw = true;
            }
            rescan(state);
            pump(state);
        }
    }
}

fn vblank(state: &mut LiviState, crtc: crtc::Handle) {
    let Some(drm) = state.drm.as_mut() else {
        return;
    };
    let Some(output) = drm.outputs.iter_mut().find(|o| o.crtc == crtc) else {
        return;
    };
    if let Err(e) = output.surface.frame_submitted() {
        log::error!("frame not submitted: {e}");
    }
    output.frame_pending = false;
    if output.needs_redraw {
        let idx = output.screen_idx;
        render(state, idx);
    }
}

pub fn damage(state: &mut LiviState) {
    if let Some(drm) = state.drm.as_mut() {
        for output in &mut drm.outputs {
            output.needs_redraw = true;
        }
    }
}

pub fn pump(state: &mut LiviState) {
    let Some(drm) = state.drm.as_ref() else {
        return;
    };
    let due: Vec<usize> = drm
        .outputs
        .iter()
        .filter(|o| o.needs_redraw && !o.frame_pending)
        .map(|o| o.screen_idx)
        .collect();
    for idx in due {
        render(state, idx);
    }
}

pub fn render(state: &mut LiviState, screen_idx: usize) {
    let ready = state.drm.as_ref().is_some_and(|d| {
        d.active
            && d.outputs
                .iter()
                .any(|o| o.screen_idx == screen_idx && !o.frame_pending && o.needs_redraw)
    });
    if !ready || state.renderer.is_none() {
        return;
    }
    let mut parts = crate::render::frame_parts(state, screen_idx);
    let screen_x = state.screens[screen_idx].x as f64;
    let (Some(drm), Some(renderer)) = (state.drm.as_mut(), state.renderer.as_mut()) else {
        return;
    };
    let cursor_shown =
        screen_idx == 0 && drm.mouse_active && crate::host::shown_cursor(&state.host).is_some();
    if cursor_shown {
        let (x, y) = state.host.pointer_pos;
        let at = Point::<f64, smithay::utils::Physical>::from((x - screen_x, y));
        if let Ok(element) = MemoryRenderBufferRenderElement::from_buffer(
            renderer,
            at,
            &drm.cursor,
            None,
            None,
            None,
            ElementKind::Cursor,
        ) {
            parts.elements.insert(0, LiviElement::Deco(element));
        }
    }
    let Some(output) = drm.outputs.iter_mut().find(|o| o.screen_idx == screen_idx) else {
        return;
    };
    output.needs_redraw = false;
    let clear = parts.clear;
    let elements = match crate::render::calibrated(renderer, parts, output.logical()) {
        Ok(elements) => elements,
        Err(e) => {
            log::error!("calibration failed: {e}");
            return;
        }
    };
    let flipped = match output
        .surface
        .render_frame(renderer, &elements, clear, FrameFlags::DEFAULT)
    {
        Ok(frame) if frame.is_empty => false,
        Ok(frame) => {
            let direct = frame.overlay_elements.len()
                + usize::from(matches!(
                    frame.primary_element,
                    PrimaryPlaneElement::Element(_)
                ));
            if direct != output.direct {
                log::info!(
                    "screen '{}' on {}: {direct} of {} surfaces shown directly by the display",
                    state.screens[screen_idx].role,
                    output.connector,
                    elements.len()
                );
                output.direct = direct;
            }
            match output.surface.queue_frame(()) {
                Ok(()) => true,
                Err(e) => {
                    log::error!("display flip: {e}");
                    return;
                }
            }
        }
        Err(e) => {
            log::error!("render failed: {e}");
            return;
        }
    };
    if flipped {
        output.frame_pending = true;
        crate::host::send_frame_callbacks(state);
        return;
    }
    let refresh = output.mode.vrefresh().max(1);
    let _ = drm.loop_handle.insert_source(
        Timer::from_duration(std::time::Duration::from_millis(u64::from(1000 / refresh))),
        |_, _, state: &mut LiviState| {
            crate::host::send_frame_callbacks(state);
            TimeoutAction::Drop
        },
    );
}

fn touch_target(
    state: &LiviState,
    device: &smithay::reexports::input::Device,
) -> (usize, Size<i32, smithay::utils::Logical>, Transform) {
    let drm = state.drm.as_ref();
    let named = drm.and_then(|d| d.touch_outputs.get(device.sysname()));
    let output = drm.and_then(|d| match named {
        Some(name) => d.outputs.iter().find(|o| &o.connector == name),
        None => d.outputs.iter().find(|o| o.screen_idx == 0),
    });
    match output {
        Some(o) => (o.screen_idx, Size::from(o.physical()), o.transform),
        None => (0, screen_size(state, 0), Transform::Normal),
    }
}

fn touch_point(
    state: &LiviState,
    device: &smithay::reexports::input::Device,
    at: impl Fn(Size<i32, smithay::utils::Logical>) -> Point<f64, smithay::utils::Logical>,
) -> (usize, f64, f64) {
    let (idx, physical, transform) = touch_target(state, device);
    let native = at(physical);
    let area =
        Size::<f64, smithay::utils::Logical>::from((f64::from(physical.w), f64::from(physical.h)));
    let local = transform.transform_point_in(native, &area);
    (idx, state.screens[idx].x as f64 + local.x, local.y)
}

fn screen_size(state: &LiviState, idx: usize) -> Size<i32, smithay::utils::Logical> {
    let s = &state.screens[idx];
    (s.width.max(1), s.height.max(1)).into()
}

fn pointer_moved(state: &mut LiviState, x: f64, y: f64, time: u32) {
    let s = &state.screens[0];
    let x = x.clamp(0.0, (s.width - 1).max(0) as f64);
    let y = y.clamp(0.0, (s.height - 1).max(0) as f64);
    state.host.pointer_pos = (s.x as f64 + x, y);
    if let Some(drm) = state.drm.as_mut() {
        drm.mouse_active = true;
    }
    damage(state);
    crate::input::pointer_motion(state, time);
}

fn touched(state: &mut LiviState) {
    if let Some(drm) = state.drm.as_mut()
        && drm.mouse_active
    {
        drm.mouse_active = false;
        damage(state);
    }
}

fn wl_output_of(sysname: &str) -> Option<String> {
    let dev = std::fs::read_to_string(format!("/sys/class/input/{sysname}/dev")).ok()?;
    let data = std::fs::read_to_string(format!("/run/udev/data/c{}", dev.trim())).ok()?;
    wl_output_in(&data)
}

fn wl_output_in(udev_data: &str) -> Option<String> {
    udev_data
        .lines()
        .find_map(|l| l.strip_prefix("E:WL_OUTPUT="))
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn device_added(state: &mut LiviState, device: &smithay::reexports::input::Device) {
    log::info!("input device: {}", device.name());
    if let (Some(output), Some(drm)) = (wl_output_of(device.sysname()), state.drm.as_mut()) {
        log::info!("{} touches {output}", device.name());
        drm.touch_outputs
            .insert(device.sysname().to_string(), output);
    }
}

fn input(state: &mut LiviState, event: InputEvent<LibinputInputBackend>) {
    match event {
        InputEvent::Keyboard { event } => key(state, event),
        InputEvent::PointerMotion { event } => {
            let (x, y) = state.host.pointer_pos;
            let x = x - state.screens[0].x as f64 + event.delta_x();
            let y = y + event.delta_y();
            pointer_moved(state, x, y, event.time_msec());
        }
        InputEvent::PointerMotionAbsolute { event } => {
            let at = event.position_transformed(screen_size(state, 0));
            pointer_moved(state, at.x, at.y, event.time_msec());
        }
        InputEvent::PointerButton { event } => {
            if let Some(drm) = state.drm.as_mut() {
                drm.mouse_active = true;
            }
            damage(state);
            let pressed = event.state() == ButtonState::Pressed;
            crate::input::pointer_button(state, event.time_msec(), event.button_code(), pressed);
        }
        InputEvent::PointerAxis { event } => {
            let amount = |axis| {
                event
                    .amount(axis)
                    .or_else(|| event.amount_v120(axis).map(|v| v * 15.0 / 120.0))
                    .unwrap_or(0.0)
            };
            let (horizontal, vertical) = (amount(Axis::Horizontal), amount(Axis::Vertical));
            crate::input::pointer_axis(state, event.time_msec(), horizontal, vertical);
        }
        InputEvent::TouchDown { event } => {
            touched(state);
            let (idx, x, y) = touch_point(state, &event.device(), |size| {
                event.position_transformed(size)
            });
            let id = touch_id(event.slot());
            crate::input::touch_down(state, event.time_msec(), id, x, y, idx);
        }
        InputEvent::TouchMotion { event } => {
            let (idx, x, y) = touch_point(state, &event.device(), |size| {
                event.position_transformed(size)
            });
            let local_x = x - state.screens[idx].x as f64;
            let id = touch_id(event.slot());
            crate::input::touch_motion(state, event.time_msec(), id, local_x, y);
        }
        InputEvent::TouchUp { event } => {
            crate::input::touch_up(state, event.time_msec(), touch_id(event.slot()));
        }
        InputEvent::TouchCancel { .. } => crate::input::touch_cancel(state),
        InputEvent::DeviceAdded { device } => device_added(state, &device),
        InputEvent::DeviceRemoved { device } => {
            log::info!("input device gone: {}", device.name());
            if let Some(drm) = state.drm.as_mut() {
                drm.touch_outputs.remove(device.sysname());
            }
        }
        _ => {}
    }
}

fn touch_id(slot: smithay::backend::input::TouchSlot) -> i32 {
    i32::from(slot)
}

fn key(
    state: &mut LiviState,
    event: <LibinputInputBackend as smithay::backend::input::InputBackend>::KeyboardKeyEvent,
) {
    let Some(keyboard) = state.seat.get_keyboard() else {
        return;
    };
    let pressed = event.state() == KeyState::Pressed;
    let action = keyboard.input::<KeyAction, _>(
        state,
        event.key_code(),
        event.state(),
        SERIAL_COUNTER.next_serial(),
        event.time_msec(),
        |_, modifiers, handle| {
            let sym = handle.modified_sym().raw();
            let first = Keysym::XF86_Switch_VT_1.raw();
            if pressed && (first..=Keysym::XF86_Switch_VT_12.raw()).contains(&sym) {
                return FilterResult::Intercept(KeyAction::SwitchVt((sym - first + 1) as i32));
            }
            if pressed && modifiers.alt && sym == Keysym::Escape.raw() {
                return FilterResult::Intercept(KeyAction::Quit);
            }
            FilterResult::Forward
        },
    );
    match action {
        Some(KeyAction::SwitchVt(vt)) => {
            if let Some(drm) = state.drm.as_mut()
                && let Err(e) = drm.session.change_vt(vt)
            {
                log::error!("cannot switch to vt {vt}: {e}");
            }
        }
        Some(KeyAction::Quit) => state.running = false,
        None => {}
    }
}

#[cfg(test)]
mod tests {
    use super::{Offered, assign, choose, panel_name, size_of, wl_output_in};

    fn mode(w: u16, h: u16, refresh: u32, preferred: bool) -> Offered {
        Offered {
            size: (w, h),
            refresh,
            preferred,
        }
    }

    #[test]
    fn the_setting_wins_with_its_fastest_refresh() {
        let modes = [
            mode(1920, 1080, 60, true),
            mode(1280, 720, 50, false),
            mode(1280, 720, 60, false),
        ];
        assert_eq!(choose(&modes, Some((1280, 720))), Some(2));
        assert_eq!(size_of("1024x600"), Some((1024, 600)));
        assert_eq!(size_of("auto"), None);
    }

    #[test]
    fn without_a_setting_the_panel_stays_at_most_hd() {
        let small_panel = [mode(800, 480, 60, true), mode(640, 480, 60, false)];
        assert_eq!(choose(&small_panel, None), Some(0));
        let xga = [mode(1024, 768, 60, true), mode(800, 600, 60, false)];
        assert_eq!(
            choose(&xga, None),
            Some(0),
            "a 4:3 panel keeps its native mode below the HD pixel count"
        );
        let tv = [
            mode(3840, 2160, 60, true),
            mode(1920, 1080, 60, false),
            mode(1280, 720, 60, false),
        ];
        assert_eq!(
            choose(&tv, None),
            Some(2),
            "a 4k panel drops to 720p like the kiosk did"
        );
        assert_eq!(
            choose(&tv, Some((1366, 768))),
            Some(2),
            "a size the panel lacks falls back"
        );
        let only_big = [mode(2560, 1440, 60, true), mode(1920, 1080, 60, false)];
        assert_eq!(
            choose(&only_big, None),
            Some(1),
            "the smallest when nothing fits"
        );
        assert_eq!(choose(&[], None), None);
    }

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn screens_take_their_connector_or_the_next_free_one() {
        let connected = names(&["HDMI-A-1", "HDMI-A-2", "DSI-1"]);
        let auto = [(0, None), (1, None)];
        assert_eq!(
            assign(&auto, &connected),
            [(0, "HDMI-A-1".into()), (1, "HDMI-A-2".into())]
        );
        let cluster_on_dsi = [(0, None), (1, Some("DSI-1".to_string()))];
        assert_eq!(
            assign(&cluster_on_dsi, &connected),
            [(0, "HDMI-A-1".into()), (1, "DSI-1".into())]
        );
        let main_on_second = [(0, Some("HDMI-A-2".to_string())), (1, None)];
        assert_eq!(
            assign(&main_on_second, &connected),
            [(0, "HDMI-A-2".into()), (1, "HDMI-A-1".into())]
        );
        let gone = [(0, None), (1, Some("HDMI-A-3".to_string()))];
        assert_eq!(
            assign(&gone, &connected),
            [(0, "HDMI-A-1".into())],
            "a chosen connector that is not there leaves the screen dark"
        );
        assert_eq!(
            assign(&auto, &names(&["HDMI-A-1"])),
            [(0, "HDMI-A-1".into())]
        );
        let pinned_cluster = [(0, None), (1, Some("HDMI-A-1".to_string()))];
        assert_eq!(
            assign(&pinned_cluster, &names(&["HDMI-A-1"])),
            [(0, "HDMI-A-1".into())],
            "main keeps the only display even when the cluster asks for it"
        );
        let main_gone = [(0, Some("DSI-1".to_string())), (1, None)];
        assert_eq!(
            assign(&main_gone, &names(&["HDMI-A-1"])),
            [(0, "HDMI-A-1".into())],
            "main never stays dark while a display is connected"
        );
        let cluster_on_first = [(0, None), (1, Some("HDMI-A-1".to_string()))];
        assert_eq!(
            assign(&cluster_on_first, &names(&["HDMI-A-1", "HDMI-A-2"])),
            [(0, "HDMI-A-2".into()), (1, "HDMI-A-1".into())],
            "main steps aside to a display nobody asked for"
        );
    }

    #[test]
    fn a_touch_device_names_its_display_in_the_udev_data() {
        assert_eq!(
            wl_output_in("E:ID_INPUT=1\nE:WL_OUTPUT=DSI-1\nE:ID_INPUT_TOUCHSCREEN=1\n").as_deref(),
            Some("DSI-1")
        );
        assert_eq!(wl_output_in("E:ID_INPUT=1\n"), None);
        assert_eq!(wl_output_in("E:WL_OUTPUT=\n"), None);
    }

    #[test]
    fn the_panel_name_comes_from_the_edid_descriptor() {
        let mut edid = vec![0u8; 128];
        let block = 54 + 18;
        edid[block + 3] = 0xFC;
        edid[block + 5..block + 5 + 13].copy_from_slice(b"Elecrow 8in\n ");
        assert_eq!(panel_name(&edid).as_deref(), Some("Elecrow 8in"));
        assert_eq!(panel_name(&[0u8; 128]), None);
        assert_eq!(panel_name(&[0u8; 20]), None);
    }
}
