use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

use crate::util::{Arch, copy_exe, copy_tree, exec, root, version};

const START: &str = r#"#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
[ "$1" = telemetry ] && exec "$HERE/resources/core/livi-core" "$@"
export LIVI_RESOURCES="$HERE/resources"
exec "$HERE/resources/core/livi-core"
"#;

const DESKTOP: &str = "[Desktop Entry]
Name=LIVI
Comment=Linux In-Vehicle Infotainment
Exec=AppRun %U
Icon=livi
Type=Application
Terminal=false
Categories=Utility;
StartupWMClass=LIVI
";

const TEMPLATES: [&str; 6] = [
    "99-LIVI.rules.template",
    "99-LIVI-helper.sudoers.template",
    "livi-wifi-ap.service.template",
    "99-LIVI-wifi-ap.sudoers.template",
    "livi-kiosk.service.template",
    "livi-touch-filter",
];

fn copy(src: &Path, dest: &Path) -> Result<(), String> {
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    fs::copy(src, dest)
        .map(|_| ())
        .map_err(|e| format!("{} -> {}: {e}", src.display(), dest.display()))
}

fn write_exe(path: &Path, text: &str) -> Result<(), String> {
    fs::write(path, text).map_err(|e| format!("{}: {e}", path.display()))?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())
}

fn appimagetool() -> String {
    std::env::var("APPIMAGETOOL").unwrap_or_else(|_| "appimagetool".into())
}

pub fn run(arch: Arch) -> Result<(), String> {
    if !cfg!(target_os = "linux") {
        return Err("package-linux runs on Linux".into());
    }
    crate::build_native::run(arch)?;

    let root = root();
    let version = version()?;
    let dist = root.join("dist");
    let app = dist.join(format!("linux-{}-unpacked", arch.name()));
    let res = app.join("resources");
    let _ = fs::remove_dir_all(&app);
    fs::create_dir_all(&res).map_err(|e| e.to_string())?;

    let built = |rel: &str| root.join("native").join(rel);
    copy_exe(
        &built("livi-helperd/build/Release/LIVI"),
        &app.join("livi-ui"),
    )?;
    copy_exe(
        &built("livi-helperd/build/Release/livi-core"),
        &res.join("core/livi-core"),
    )?;
    copy_exe(
        &built("livi-helperd/build/Release/livi-helperd"),
        &res.join("driver/livi-helperd"),
    )?;
    copy_exe(
        &built("livi-gst-video/build/Release/livi-gst-host"),
        &res.join("gst-host/livi-gst-host"),
    )?;
    copy_exe(
        &root.join("out/compositor/livi-compositor"),
        &res.join("compositor/livi-compositor"),
    )?;

    let linux = root.join("assets/linux");
    for name in TEMPLATES {
        copy(&linux.join(name), &res.join(name))?;
    }
    fs::set_permissions(
        res.join("livi-touch-filter"),
        fs::Permissions::from_mode(0o755),
    )
    .map_err(|e| e.to_string())?;
    copy(
        &linux.join("dev.f-io.livi.metainfo.xml"),
        &app.join("share/metainfo/dev.f-io.livi.metainfo.xml"),
    )?;
    copy_exe(
        &root.join("scripts/install/pi/setup-hdmi-pr-display.sh"),
        &res.join("setup-hdmi-pr-display.sh"),
    )?;
    let displays = root.join("assets/displays");
    if displays.is_dir() {
        copy_tree(&displays, &res.join("displays"), &|_| false)?;
    }

    let gst_dir = format!("gstreamer/linux-{}", arch.name());
    let gst_src = root.join("assets").join(&gst_dir);
    let skip = |p: &Path| {
        p.extension().is_some_and(|e| e == "a")
            || p.strip_prefix(&gst_src)
                .is_ok_and(|r| r.starts_with("share"))
    };
    copy_tree(&gst_src, &res.join(&gst_dir), &skip)?;

    write_exe(&app.join("LIVI"), START)?;
    std::os::unix::fs::symlink("LIVI", app.join("AppRun")).map_err(|e| e.to_string())?;
    fs::write(app.join("dev.f-io.livi.desktop"), DESKTOP).map_err(|e| e.to_string())?;
    copy(
        &root.join("assets/icons/linux/livi.png"),
        &app.join("livi.png"),
    )?;

    let image = dist.join(format!("LIVI-{version}-linux-{}.AppImage", arch.name()));
    let _ = fs::remove_file(&image);
    exec(
        Command::new(appimagetool())
            .env("ARCH", arch.appimage())
            .env("VERSION", &version)
            .arg("--no-appstream")
            .arg(&app)
            .arg(&image),
    )?;
    println!("[package-linux] {}", image.display());
    Ok(())
}
