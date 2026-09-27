//! The kernel of the i.MX6ULL board goes in through the vendor U-Boot (see imx6ul-uboot): the web
//! flash stages it with this dongle's fuses, and U-Boot converts it on its next start.

use std::fs;
use std::process::Command;

const OCOTP: &str = "/sys/bus/nvmem/devices/imx-ocotp0/nvmem";

/// The kernel partition for `zimage`, built from what it holds now and what U-Boot keeps.
pub fn stage_kernel(zimage: &[u8], kernel: &[u8]) -> Result<Vec<u8>, String> {
    let fuses = fs::read(OCOTP)
        .ok()
        .and_then(|n| imx6ul_uboot::Fuses::from_ocotp(&n))
        .ok_or_else(|| format!("could not read the fuses from {OCOTP}"))?;
    let uboot = mtd("uboot")?;
    let uboot = fs::read(&uboot).map_err(|e| format!("read {uboot}: {e}"))?;
    imx6ul_uboot::stage(zimage, kernel, &uboot, fuses)
}

/// Makes U-Boot convert the staging blocks on its next start. Runs before the kernel partition is
/// written: a failed erase leaves the old kernel alone, and once the write is complete any start,
/// a planned one or not, comes up with the new kernel.
pub fn erase_env() -> Result<(), String> {
    let env = mtd("env")?;
    let erased = Command::new("/usr/sbin/flash_eraseall").args(["-q", &env]).status().is_ok_and(|s| s.success())
        && fs::read(&env).is_ok_and(|b| !b.is_empty() && b.iter().all(|&x| x == 0xff));
    if erased { Ok(()) } else { Err(format!("could not erase the environment block {env}")) }
}

fn mtd(name: &str) -> Result<String, String> {
    fs::read_dir("/sys/class/mtd")
        .into_iter()
        .flatten()
        .flatten()
        .find_map(|e| {
            let dev = e.file_name().into_string().ok()?;
            let n = dev.strip_prefix("mtd")?;
            if n.is_empty() || !n.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            (fs::read_to_string(e.path().join("name")).ok()?.trim() == name).then(|| format!("/dev/{dev}"))
        })
        .ok_or_else(|| format!("no {name} partition"))
}
