# AX520 + AIC8800D80: what the shared rootfs and bundle scripts (common/) take from this board.
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BOARD=ax520
source "$HERE/../common.sh"

BUSYBOX=$USERSPACE/bin/busybox
HOSTAPD=$USERSPACE/usr/sbin/hostapd
LIVID=$OUT/livid
ROOTFS_IMG=$OUT/livi-link-ax520-rootfs.bin
ROOTFS_SIZE=$((0x440000))  # "rootfs" partition in ax520.dts
# The MTD index in ax520.dts: 3 = boot (kernel uImage), 6 = rootfs.
BUNDLE=$OUT/livi-link-ax520.lfwb
BUNDLE_IMAGES=("3:$OUT/livi-link-ax520-boot.uimg" "6:$ROOTFS_IMG")

FW_SRC=$TOP/radxa-aic8800/src/SDIO/driver_fw/fw/aic8800D80
# What the driver actually request_firmware()s on this board (stock dmesg), plus
# the u04 patch pair and the two config texts, which are tiny.
FW_FILES="aic_powerlimit_8800d80.txt aic_userconfig_8800d80.txt
          fmacfw_8800d80_h_u02.bin fw_adid_8800d80_u02.bin
          fw_patch_8800d80_u02.bin fw_patch_8800d80_u02_ext0.bin fw_patch_8800d80_u04.bin
          fw_patch_table_8800d80_u02.bin fw_patch_table_8800d80_u04.bin"

rootfs_payload() {
  local work=$1 o n f
  need "$OUT/modules/aic8800_bsp.ko"  "run build.sh first"
  need "$OUT/modules/aic8800_fdrv.ko" "run build.sh first"
  need "$FW_SRC"                      "run build.sh first (it fetches the firmware next to the driver)"

  log "flash tools from the initramfs (flash-mtd, sfc-sr), so a running system can be updated over USB-NCM"
  cp "$HERE/initramfs/flash-mtd" "$HERE/initramfs/sfc-sr" "$work/usr/sbin/"
  chmod 755 "$work/usr/sbin/flash-mtd" "$work/usr/sbin/sfc-sr"

  log "device-tree overlays (rcS switches sdio0 on after the WiFi enable)"
  mkdir -p "$work/dtbo"
  for o in "$HERE"/overlays/*.dtso; do
    n=$(basename "$o" .dtso)
    cp "$KDIR/arch/arm/boot/dts/axera/ax520-$n.dtbo" "$work/dtbo/"
  done

  log "AIC8800 modules"
  mkdir -p "$work/lib/modules/$KVER"
  cp "$OUT/modules"/aic8800_bsp.ko "$OUT/modules"/aic8800_fdrv.ko "$work/lib/modules/$KVER/"

  log "AIC8800 firmware"
  mkdir -p "$work/lib/firmware/aic8800d80"
  for f in $FW_FILES; do
    [[ -f $FW_SRC/$f ]] || { log "firmware $f not in $FW_SRC"; exit 2; }
    cp "$FW_SRC/$f" "$work/lib/firmware/aic8800d80/$f"
  done
}
