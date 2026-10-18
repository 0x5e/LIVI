use std::net::ToSocketAddrs;

pub const LINK_NAME: &str = "livi-link.local";

pub const CHOICE: &str = "livi-link";

pub fn resolves() -> bool {
    (LINK_NAME, 0u16)
        .to_socket_addrs()
        .map(|mut a| a.any(|a| a.is_ipv4()))
        .unwrap_or(false)
}

pub fn addr(port: u16) -> String {
    format!("{LINK_NAME}:{port}")
}

#[cfg(target_os = "linux")]
pub fn host_iface() -> Option<String> {
    host_iface_in(std::path::Path::new("/sys/class/net"))
}

#[cfg(target_os = "linux")]
pub fn attached() -> bool {
    host_iface().is_some()
}

#[cfg(not(target_os = "linux"))]
pub fn attached() -> bool {
    own_ipv4().into_iter().any(on_link)
}

#[cfg_attr(target_os = "linux", allow(dead_code))]
fn on_link(ip: std::net::Ipv4Addr) -> bool {
    matches!(ip.octets(), [10, 10, 10, _])
}

#[cfg(not(target_os = "linux"))]
fn own_ipv4() -> Vec<std::net::Ipv4Addr> {
    let mut out = Vec::new();
    let mut list: *mut libc::ifaddrs = std::ptr::null_mut();
    // SAFETY: getifaddrs fills the list or fails, every entry is read before freeifaddrs.
    unsafe {
        if libc::getifaddrs(&mut list) != 0 {
            return out;
        }
        let mut cur = list;
        while !cur.is_null() {
            let addr = (*cur).ifa_addr;
            if !addr.is_null() && i32::from((*addr).sa_family) == libc::AF_INET {
                let sin = &*(addr as *const libc::sockaddr_in);
                out.push(std::net::Ipv4Addr::from(u32::from_be(sin.sin_addr.s_addr)));
            }
            cur = (*cur).ifa_next;
        }
        libc::freeifaddrs(list);
    }
    out
}

#[cfg(target_os = "linux")]
fn host_iface_in(net: &std::path::Path) -> Option<String> {
    std::fs::read_dir(net).ok()?.flatten().find_map(|entry| {
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

#[cfg(test)]
mod subnet_tests {
    use super::on_link;

    #[test]
    fn only_the_links_subnet_counts() {
        assert!(on_link("10.10.10.100".parse().unwrap()));
        assert!(!on_link("10.10.11.100".parse().unwrap()));
        assert!(!on_link("192.168.1.10".parse().unwrap()));
    }
}
