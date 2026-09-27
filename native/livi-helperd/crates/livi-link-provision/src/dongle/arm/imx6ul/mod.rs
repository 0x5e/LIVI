//! The i.MX6ULL dongle. Our kernel goes in through the vendor U-Boot (`boot`), the rootfs is a
//! squashfs written from a system that does not run from it. On the vendor firmware the tool's USB
//! bootstrap gives the first shell, and the whole flash is backed up before anything is written.

pub mod boot;
pub mod mtd;
pub mod shell;

use std::path::Path;
use std::thread::sleep;
use std::time::{Duration, Instant};

use shell::Shell;

/// How long the dongle may take to come back after a reboot.
const REBOOT_TIMEOUT: Duration = Duration::from_secs(180);

/// The bundle CI builds for this board, baked in so the tool is a single download. Empty in a
/// local build without the CI asset.
pub(crate) const IMX6UL_LFWB: &[u8] =
    include_bytes!("../../../../../../../../assets/livi-link/imx6ul_iw416/livi-link-imx6ull.lfwb");

#[derive(Debug, PartialEq, Eq)]
pub enum Running {
    /// The vendor firmware, from its jffs2 rootfs.
    Vendor,
    /// Our initramfs, which stays when there is no rootfs of ours to switch to.
    Rescue,
    /// LIVI Link from its squashfs.
    Livi,
}

pub fn running(sh: &Shell) -> Result<Running, String> {
    Ok(running_from(&sh.sh("cat /proc/mounts")?))
}

fn running_from(mounts: &str) -> Running {
    let fs = |t: &str| mounts.lines().any(|l| l.split_whitespace().nth(2) == Some(t));
    if fs("jffs2") {
        Running::Vendor
    } else if fs("squashfs") {
        Running::Livi
    } else {
        Running::Rescue
    }
}

/// Installs a bundle over the dongle's shell. The vendor firmware is backed up to `backup_root`
/// first, then our kernel goes in and comes up in the rescue system, since the vendor's rootfs
/// cannot be overwritten while it runs, and the rootfs follows from there. A running LIVI Link
/// goes to the rescue system first for the same reason.
pub fn install(sh: &Shell, bundle: &[u8], backup_root: &Path, progress: &dyn Fn(&str)) -> Result<(), String> {
    let bundle = boot::read_bundle(bundle)?;
    let (Some(kernel), Some(rootfs)) = (&bundle.kernel, &bundle.rootfs) else {
        return Err("the bundle has to carry both the kernel and the rootfs".into());
    };
    match running(sh)? {
        Running::Livi => {
            to_rescue(sh, progress)?;
            let plan = boot::prepare(sh, kernel, backup_root, progress)?;
            boot::write_rootfs(sh, rootfs, &plan.backup, progress)?;
            boot::install(sh, &plan, progress)
        }
        Running::Vendor => {
            let dir = mtd::backup(sh, backup_root, progress)?;
            progress(&format!("vendor firmware saved in {}", crate::tilde(&dir)));
            let plan = boot::prepare(sh, kernel, backup_root, progress)?;
            boot::install(sh, &plan, progress)?;
            if running(sh)? != Running::Rescue {
                return Err("our kernel is in, but the dongle did not come up in the rescue system".into());
            }
            boot::write_rootfs(sh, rootfs, &plan.backup, progress)?;
            reboot(sh, progress)
        }
        Running::Rescue => {
            let plan = boot::prepare(sh, kernel, backup_root, progress)?;
            boot::write_rootfs(sh, rootfs, &plan.backup, progress)?;
            boot::install(sh, &plan, progress)
        }
    }
}

/// Restarts LIVI Link into its rescue system: the initramfs stays there when it finds its mark in
/// the bootstate partition, the mark a start that did not come up leaves behind.
fn to_rescue(sh: &Shell, progress: &dyn Fn(&str)) -> Result<(), String> {
    let parts = mtd::partitions(sh)?;
    let state = parts.iter().find(|p| p.name == "bootstate").ok_or("no bootstate partition in /proc/mtd")?;
    let block = state.device.replacen("/dev/mtd", "/dev/mtdblock", 1);
    sh.sh(&format!("printf LIVIBOOT > {block} && sync"))?;
    progress("restarting into the rescue system, it writes the rootfs");
    sh.sh("(sleep 1; sync; reboot; sleep 5; reboot -f) >/dev/null 2>&1 &")?;
    let gone = Instant::now();
    while sh.port_open(shell::TELNET_PORT) && gone.elapsed() < Duration::from_secs(30) {
        sleep(Duration::from_secs(1));
    }
    wait_for_dongle(sh, progress)?;
    match running(sh)? {
        Running::Rescue => Ok(()),
        other => Err(format!("the dongle came back as {other:?}, not in its rescue system")),
    }
}

fn reboot(sh: &Shell, progress: &dyn Fn(&str)) -> Result<(), String> {
    progress("rebooting into LIVI Link");
    // A shell as PID 1 (our initramfs) ignores the signal a plain reboot sends it.
    sh.sh("(sleep 1; sync; reboot; sleep 5; reboot -f) >/dev/null 2>&1 &")?;
    Ok(())
}

fn wait_for_dongle(sh: &Shell, progress: &dyn Fn(&str)) -> Result<(), String> {
    let start = Instant::now();
    while start.elapsed() < REBOOT_TIMEOUT {
        if sh.port_open(shell::TELNET_PORT) {
            progress(&format!("dongle back after {}s", start.elapsed().as_secs()));
            return Ok(());
        }
        sleep(Duration::from_secs(3));
    }
    Err(format!("dongle did not come back within {}s", REBOOT_TIMEOUT.as_secs()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_mounts_tell_which_system_runs() {
        let vendor = "rootfs / rootfs rw 0 0\n/dev/mtdblock2 / jffs2 rw,relatime 0 0\nproc /proc proc rw 0 0";
        assert_eq!(running_from(vendor), Running::Vendor);
        let ours = "/dev/root / squashfs ro,relatime 0 0\ntmpfs /tmp tmpfs rw 0 0";
        assert_eq!(running_from(ours), Running::Livi);
        assert_eq!(running_from("none / rootfs rw 0 0\nproc /proc proc rw 0 0"), Running::Rescue);
    }
}
