//! The LIVI Link on the network: the dongle answers to `LINK_NAME` over mDNS on its USB link,
//! and everything on it is addressed by that name.

use std::net::ToSocketAddrs;

/// The name the dongle's mDNS responder answers to.
pub const LINK_NAME: &str = "livi-link.local";

/// What the Wi-Fi interface and Bluetooth adapter settings carry when a dongle radio is chosen.
pub const CHOICE: &str = "livi-link";

/// Whether the name resolves to an IPv4 address right now.
pub fn resolves() -> bool {
    (LINK_NAME, 0u16).to_socket_addrs().map(|mut a| a.any(|a| a.is_ipv4())).unwrap_or(false)
}

/// "LINK_NAME:port".
pub fn addr(port: u16) -> String {
    format!("{LINK_NAME}:{port}")
}

/// This machine's network interface on the dongle's USB link, told apart by the gadget's product
/// name. Another interface in the dongle's subnet, such as a Wi-Fi card joined to its access
/// point, must not stand in for it: the phone is told to reach the host over this one.
#[cfg(target_os = "linux")]
pub fn host_iface() -> Option<String> {
    host_iface_in(std::path::Path::new("/sys/class/net"))
}

#[cfg(target_os = "linux")]
fn host_iface_in(net: &std::path::Path) -> Option<String> {
    std::fs::read_dir(net).ok()?.flatten().find_map(|entry| {
        // `device` is the USB interface, its parent the gadget.
        let product = std::fs::read_to_string(entry.path().join("device/../product")).ok()?;
        (product.trim() == crate::LINK_PRODUCT).then(|| entry.file_name().into_string().ok())?
    })
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    #[test]
    fn the_link_is_the_interface_on_the_gadget() {
        let root = std::env::temp_dir().join(format!("livi-link-iface-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let gadget = |name: &str, product: &str| {
            let usb = root.join("devices").join(name);
            std::fs::create_dir_all(usb.join("iface")).unwrap();
            std::fs::write(usb.join("product"), format!("{product}\n")).unwrap();
            usb.join("iface")
        };
        let net = root.join("net");
        for (iface, device) in [
            ("wlp102s0", gadget("1-1", "Wireless Card")),
            ("usb0", gadget("1-2", crate::LINK_PRODUCT)),
        ] {
            std::fs::create_dir_all(net.join(iface)).unwrap();
            symlink(device, net.join(iface).join("device")).unwrap();
        }
        std::fs::create_dir_all(net.join("lo")).unwrap();

        assert_eq!(host_iface_in(&net).as_deref(), Some("usb0"));
        std::fs::remove_dir_all(&root).unwrap();
    }
}
