use crate::dongle;
use crate::dongle::arm::imx6ul::shell::{self, Shell};

pub enum Detected {
    /// A shell on the i.MX6UL dongle: the vendor firmware after the USB bootstrap, or our rescue
    /// system.
    Imx6ul { host: String },
    LiviLink { model: String, target: String },
    /// A dongle in stock firmware, running the "Liaoyuan" web/OTA stack (`dongle::web`) — could
    /// be a V821B or an AX520 (or another project not yet seen), see `dongle::hook::ly_project`.
    DongleStock { info: dongle::web::HostInfo },
    Nothing,
}

impl Detected {
    pub fn label(&self) -> String {
        match self {
            Detected::Imx6ul { host } => format!("i.MX6UL dongle with a shell at {host}"),
            Detected::LiviLink { model, .. } => format!("{model} already running LIVI Link"),
            Detected::DongleStock { info } => {
                let project = dongle::hook::ly_project(&info.sys.appver)
                    .unwrap_or_else(|| "unknown project".into());
                format!("{project} dongle in stock firmware ({}, appver {})", info.name, info.sys.appver)
            }
            Detected::Nothing => "no dongle found".into(),
        }
    }
}

pub fn detect() -> Detected {
    if let Some(status) = dongle::link::status(shell::DEFAULT_HOST) {
        return Detected::LiviLink { model: status.model, target: status.target };
    }
    if let Ok(info) = dongle::web::host() {
        return Detected::DongleStock { info };
    }
    if Shell::new(shell::DEFAULT_HOST).port_open(shell::TELNET_PORT) {
        return Detected::Imx6ul { host: shell::DEFAULT_HOST.to_string() };
    }
    Detected::Nothing
}
