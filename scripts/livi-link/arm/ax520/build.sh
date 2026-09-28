#!/usr/bin/env bash
# LIVI-Link AX520+AIC8800D80 dongle kernel build.
# Order: ../build-userspace.sh <this dir>, build.sh, ../../common/build-rootfs.sh <this dir>,
# ../../common/pack-bundle.sh <this dir>.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/board.sh"
: ${KBUILD_BUILD_USER:=LIVI}
: ${KBUILD_BUILD_HOST:=Link}
export KBUILD_BUILD_USER KBUILD_BUILD_HOST

[[ -x $USERSPACE/bin/busybox ]] || { log "no busybox at $USERSPACE — run build-userspace.sh first"; exit 1; }
fetch_kernel

# ---------------------------------------------------------------------------
# 1) Our own Axera AX520 platform glue (mainline has no SoC-specific driver
#    for it — none is needed: single Cortex-A7, real ARM GIC, stock DW IP,
#    all handled by the generic ARM multiplatform boot path).
# ---------------------------------------------------------------------------
log "install mach-axera (idempotent)"
mkdir -p "$KDIR/arch/arm/mach-axera"
cp -f "$HERE/mach.c"       "$KDIR/arch/arm/mach-axera/axera.c"
cp -f "$HERE/mach.Kconfig" "$KDIR/arch/arm/mach-axera/Kconfig"
cat > "$KDIR/arch/arm/mach-axera/Makefile" <<'EOF'
# SPDX-License-Identifier: GPL-2.0-only
obj-$(CONFIG_ARCH_AXERA)	+= axera.o
EOF
grep -q 'mach-axera/Kconfig' "$KDIR/arch/arm/Kconfig" || \
  sed -i '/^source "arch\/arm\/mach-at91\/Kconfig"/a\
\
source "arch/arm/mach-axera/Kconfig"' "$KDIR/arch/arm/Kconfig"
# Without this line arch/arm/Makefile never descends into mach-axera, axera.c is not built, and the
# kernel still boots (as the generic DT machine), which hides that our time setup is missing.
grep -q 'CONFIG_ARCH_AXERA' "$KDIR/arch/arm/Makefile" || \
  sed -i '/^machine-\$(CONFIG_ARCH_AT91)/a machine-$(CONFIG_ARCH_AXERA)\t\t+= axera' "$KDIR/arch/arm/Makefile"
grep -q 'CONFIG_ARCH_AXERA' "$KDIR/arch/arm/Makefile" || { log "could not hook mach-axera into arch/arm/Makefile"; exit 3; }

shopt -s nullglob
log "apply kernel patches (fotg210 udc: second interrupt line, pullup, polarity, IRQs before bind, status bits that clear; dw spi: wait for the last frame; spidev for the LED)"
apply_patches "$HERE/kernel-patches" "$KDIR"

log "install LIVI-Link AX520 DTS (VehiConn-D5A8 CarPlay dongle)"
mkdir -p "$KDIR/arch/arm/boot/dts/axera"
cp -f "$HERE/ax520.dts" "$KDIR/arch/arm/boot/dts/axera/ax520-vehiconn.dts"
OVERLAYS=$(cd "$HERE/overlays" && ls *.dtso | sed 's/\.dtso$//')
rm -f "$KDIR"/arch/arm/boot/dts/axera/ax520-*.dtbo
{
  echo '# SPDX-License-Identifier: GPL-2.0'
  echo 'dtb-$(CONFIG_ARCH_AXERA) += ax520-vehiconn.dtb'
  for o in $OVERLAYS; do
    cp -f "$HERE/overlays/$o.dtso" "$KDIR/arch/arm/boot/dts/axera/ax520-$o.dtso"
    echo "dtb-\$(CONFIG_ARCH_AXERA) += ax520-$o.dtbo"
  done
  echo 'DTC_FLAGS_ax520-vehiconn := -@'
} > "$KDIR/arch/arm/boot/dts/axera/Makefile"
grep -q 'subdir-y += axera' "$KDIR/arch/arm/boot/dts/Makefile" \
  || echo 'subdir-y += axera' >> "$KDIR/arch/arm/boot/dts/Makefile"

# ---------------------------------------------------------------------------
# 2) AIC8800 driver: radxa SDK, Bluetooth through aic_btsdio.
# ---------------------------------------------------------------------------
AIC_ORG=${AIC_ORG:-https://github.com/radxa-pkg/aic8800}
AIC_REF=${AIC_REF:-516e3b087763d80c44f5e3b6d2dd63e0d925c91d}
AIC_CACHE=$TOP/radxa-aic8800
AIC_SUB=src/SDIO/driver_fw/driver/aic8800
AIC_FW_SUB=src/SDIO/driver_fw/fw/aic8800D80
if [[ ! -e $AIC_CACHE/$AIC_SUB/aic8800_fdrv/aic_btsdio.c || ! -d $AIC_CACHE/$AIC_FW_SUB ]]; then
  log "fetch radxa aic8800 driver ($AIC_REF)"
  rm -rf "$AIC_CACHE"
  git clone --filter=blob:none --sparse "$AIC_ORG" "$AIC_CACHE"
  git -C "$AIC_CACHE" sparse-checkout set "$AIC_SUB" "$AIC_FW_SUB"
  git -C "$AIC_CACHE" checkout -q "$AIC_REF"
fi

log "overlay AIC8800 driver into drivers/net/wireless/aic8800 (in-tree, not out-of-tree —
     the vendor Makefiles' obj-m/obj-y need to read our real Kconfig, and CFG80211/BT/mac80211
     symbols only resolve against Module.symvers once vmlinux is actually built with them in)"
DRV=$KDIR/drivers/net/wireless/aic8800
rm -rf "$DRV"
cp -a "$AIC_CACHE/$AIC_SUB" "$DRV"
find "$DRV" -name '*.o' -o -name '*.ko' -o -name '.*.cmd' -o -name Module.symvers -o -name modules.order \
  | xargs rm -f

log "apply AIC8800 driver patches (BT tweaks + mainline API compat)"
apply_patches "$COMMON/patches/aic8800" "$DRV"

log "apply AX520-only AIC8800 driver patches (mainline-only cfg80211 API shape,
     not valid on V821B's older Tina 5.4 cfg80211 — kept out of the shared patch set)"
apply_patches "$HERE/patches" "$DRV"

log "wire AIC8800 into the wireless Kconfig/Makefile tree"
grep -q 'aic8800/Kconfig' "$KDIR/drivers/net/wireless/Kconfig" || \
  sed -i '/^source "drivers\/net\/wireless\/virtual\/Kconfig"/i source "drivers/net/wireless/aic8800/Kconfig"' \
    "$KDIR/drivers/net/wireless/Kconfig"
grep -q 'AIC_WLAN_SUPPORT' "$KDIR/drivers/net/wireless/Makefile" || \
  echo 'obj-$(CONFIG_AIC_WLAN_SUPPORT) += aic8800/' >> "$KDIR/drivers/net/wireless/Makefile"

# The top-level vendor Makefile hardcodes CONFIG_AIC8800_WLAN_SUPPORT/CONFIG_AIC_WLAN_SUPPORT/
# CONFIG_AIC8800_BTLPM_SUPPORT := m, silently overriding whatever our real .config says the
# moment Kbuild processes this fragment. Strip those three lines so the obj-$(CONFIG_X) lines
# right below them read the real Kconfig value instead.
sed -i '/^CONFIG_AIC8800_BTLPM_SUPPORT := m$/d;/^CONFIG_AIC8800_WLAN_SUPPORT := m$/d;/^CONFIG_AIC_WLAN_SUPPORT := m$/d' \
  "$DRV/Makefile"

# aic8800_bsp and aic8800_fdrv duplicate a large amount of source (SDIO transport, core
# message handling, chip-id globals — not just the small helpers V821B's own comment implies)
# under different filenames with identical symbol names. That's fine as two independently-
# linked .ko modules (each module's symbol table is private) — which is what this build keeps
# them as. Don't try to force either one obj-y (built-in): it collides at link time the moment
# both share vmlinux's single symbol namespace, and neither vendor Makefile expects that.

# ---------------------------------------------------------------------------
# 3) Config: built from allnoconfig, not multi_v7_defconfig. multi_v7 is the
#    kitchen-sink config for every ARMv7 SoC (DRM, media, sound, dozens of
#    other vendors' platform drivers), ~6000 objects of which this dongle
#    uses a few hundred. Everything listed here is something the DTS, the
#    boot path or a planned userspace feature actually needs.
# ---------------------------------------------------------------------------
INITRAMFS_LIST=$OUT/initramfs.list
{
  initramfs_common "$USERSPACE/bin/busybox"
  cat <<EOF
dir /dtbo 0755 0 0
file /sbin/ovl $HERE/initramfs/ovl 0755 0 0
file /sbin/diag $HERE/initramfs/diag 0755 0 0
file /sbin/flash-boot $HERE/initramfs/flash-boot 0755 0 0
file /sbin/flash-mtd $HERE/initramfs/flash-mtd 0755 0 0
file /sbin/sfc-sr $HERE/initramfs/sfc-sr 0755 0 0
file /sbin/led-test $HERE/initramfs/led-test 0755 0 0
EOF
} > "$INITRAMFS_LIST"
for o in $OVERLAYS; do
  echo "file /dtbo/ax520-$o.dtbo $KDIR/arch/arm/boot/dts/axera/ax520-$o.dtbo 0644 0 0" >> "$INITRAMFS_LIST"
done
check_initramfs_scripts "$INITRAMFS_LIST"

log "make allnoconfig"
cd "$KDIR"
make ARCH=arm allnoconfig >/dev/null

log "layer LIVI AX520 config onto allnoconfig"
# COMPILE_TEST below is required: USB_FOTG210 depends on ARCH_GEMINI || COMPILE_TEST.
# muboot passes no DTB: the one appended to the zImage is used, and the command line and memory
# size arrive as ATAGS that ARM_ATAG_DTB_COMPAT folds into it.
./scripts/config \
  --enable MMU \
  --enable ARCH_MULTIPLATFORM \
  --enable ARCH_MULTI_V7 \
  --enable ARCH_AXERA \
  --enable ARM_APPENDED_DTB \
  --enable ARM_ATAG_DTB_COMPAT \
  --enable ARM_ATAG_DTB_COMPAT_CMDLINE_EXTEND \
  --enable VFP \
  --enable VFPv3 \
  --enable NEON \
  --disable SMP \
  --enable PREEMPT \
  --enable CC_OPTIMIZE_FOR_SIZE \
  --enable KERNEL_XZ \
  --enable MODULES \
  --enable MODULE_UNLOAD \
  --enable EXPERT \
  --disable IO_URING \
  --disable ETHTOOL_NETLINK \
  --enable IPV6 \
  --disable IPV6_SIT \
  \
  --enable PRINTK \
  --enable PRINTK_TIME \
  --enable BUG \
  --enable FUTEX \
  --enable EPOLL \
  --enable EVENTFD \
  --enable SIGNALFD \
  --enable TIMERFD \
  --enable POSIX_TIMERS \
  --enable MULTIUSER \
  --enable FILE_LOCKING \
  --enable ADVISE_SYSCALLS \
  --enable SHMEM \
  --enable COMPAT_32BIT_TIME \
  --enable HIGH_RES_TIMERS \
  --enable NO_HZ_IDLE \
  --enable SYSVIPC \
  --enable INOTIFY_USER \
  --enable KALLSYMS \
  \
  --enable BLOCK \
  --enable BLK_DEV_WRITE_MOUNTED \
  --enable BINFMT_ELF \
  --enable BINFMT_SCRIPT \
  --enable PROC_FS \
  --enable PROC_SYSCTL \
  --enable SYSFS \
  --enable TMPFS \
  --enable DEVTMPFS \
  --enable CONFIGFS_FS \
  --enable OF_OVERLAY \
  --enable BLK_DEV_INITRD \
  --enable INITRAMFS_COMPRESSION_NONE \
  --set-str INITRAMFS_SOURCE "$INITRAMFS_LIST" \
  \
  --enable TTY \
  --enable UNIX98_PTYS \
  --enable SERIAL_8250 \
  --enable SERIAL_8250_CONSOLE \
  --enable SERIAL_8250_DW \
  --enable SERIAL_OF_PLATFORM \
  --enable SERIAL_EARLYCON \
  \
  --enable GPIOLIB \
  --enable GPIO_DWAPB \
  --enable GPIO_SYSFS \
  \
  --enable MMC \
  --enable MMC_DW \
  --enable MMC_DW_PLTFM \
  --enable PWRSEQ_SIMPLE \
  \
  --enable MTD \
  --enable MTD_BLOCK \
  --enable MTD_CHAR \
  --enable MTD_OF_PARTS \
  --enable MTD_SPI_NOR \
  --disable MTD_SPI_NOR_USE_4K_SECTORS \
  --enable SPI \
  --enable SPI_DESIGNWARE \
  --enable SPI_DW_MMIO \
  --enable SPI_SPIDEV \
  --enable I2C \
  --enable I2C_CHARDEV \
  --enable I2C_DESIGNWARE_CORE \
  --enable I2C_DESIGNWARE_PLATFORM \
  --enable I2C_GPIO \
  --enable PINCTRL \
  --enable PINCTRL_SINGLE \
  --enable MISC_FILESYSTEMS \
  --enable SQUASHFS \
  --enable SQUASHFS_XZ \
  \
  --enable USB_SUPPORT \
  --enable USB \
  --enable COMPILE_TEST \
  --enable USB_FOTG210 \
  --enable USB_FOTG210_HCD \
  --enable USB_FOTG210_UDC \
  --enable USB_GADGET \
  --enable USB_LIBCOMPOSITE \
  --enable USB_CONFIGFS \
  --enable USB_CONFIGFS_NCM \
  --enable USB_CONFIGFS_ACM \
  --enable USB_CONFIGFS_ECM \
  --enable USB_CONFIGFS_RNDIS \
  \
  --enable NET \
  --enable INET \
  --enable PACKET \
  --enable UNIX \
  --enable BRIDGE \
  --enable NETDEVICES \
  --enable WIRELESS \
  --enable WLAN \
  --enable CFG80211 \
  --enable FW_LOADER \
  --enable CFG80211_CERTIFICATION_ONUS \
  --disable CFG80211_REQUIRE_SIGNED_REGDB \
  --disable CFG80211_CRDA_SUPPORT \
  --enable CFG80211_INTERNAL_REGDB \
  --enable AIC_WLAN_SUPPORT \
  --module AIC8800_WLAN_SUPPORT \
  --module AIC8800_BTLPM_SUPPORT \
  --set-str AIC_FW_PATH "/lib/firmware/aic8800d80" \
  \
  --enable BT \
  --enable BT_BREDR \
  --enable BT_LE \
  --enable BT_RFCOMM \
  --enable CRYPTO_ECDH \
  \
  --enable DEBUG_KERNEL \
  --enable DEBUG_FS \
  --enable DYNAMIC_DEBUG \
  --enable DEVMEM \
  --disable STRICT_DEVMEM \
  --enable MAGIC_SYSRQ \
  --enable SOFTLOCKUP_DETECTOR \
  --enable DETECT_HUNG_TASK \
  --set-val DEFAULT_HUNG_TASK_TIMEOUT 30 \
  --enable WQ_WATCHDOG \
  --set-val CONSOLE_LOGLEVEL_DEFAULT 8

make ARCH=arm CROSS_COMPILE="$CROSS_COMPILE" olddefconfig

# CONFIG_PLATFORM_ALLWINNER is the vendor driver's own Makefile variable (aic8800_bsp/Makefile,
# aic8800_fdrv/Makefile), not a Kconfig symbol — AX520 uses dw_mmc, not sunxi-mmc, so this must
# stay at its default "n" (it already is; aicsdio.c's own CONFIG_PLATFORM_ALLWINNER guard around
# the sunxi_mmc_rescan_card() call then correctly compiles out on this platform).

# aic8800_bsp tells the firmware which port Bluetooth uses, so bsp and fdrv both need SDIO BT on.
# With fdrv alone the firmware stays on UART and asserts on the first HCI reset.
for mk in "$DRV/aic8800_bsp/Makefile" "$DRV/aic8800_fdrv/Makefile"; do
  sed -i 's|^\([[:space:]]*export[[:space:]]*\)\?CONFIG_SDIO_BT[[:space:]]*=.*|CONFIG_SDIO_BT = y|' "$mk"
done
grep -q '^CONFIG_SDIO_BT = y' "$DRV/aic8800_bsp/Makefile" && grep -q '^CONFIG_SDIO_BT = y' "$DRV/aic8800_fdrv/Makefile" \
  || { log "CONFIG_SDIO_BT not found in the AIC8800 Makefiles"; exit 6; }
sed -i 's|#define AICBT_DBG_FLAG\([[:space:]]\{1,\}\)1|#define AICBT_DBG_FLAG\10|' "$DRV/aic8800_fdrv/aic_btsdio.h"

# ---------------------------------------------------------------------------
# 4) Build
# ---------------------------------------------------------------------------
command -v "${CROSS_COMPILE}gcc" >/dev/null || { log "no ${CROSS_COMPILE}gcc in PATH"; exit 3; }
"${CROSS_COMPILE}gcc" --version | head -1

log "make dtbs, then zImage modules (-j$JOBS)"
make ARCH=arm CROSS_COMPILE="$CROSS_COMPILE" -j"$JOBS" dtbs
make ARCH=arm CROSS_COMPILE="$CROSS_COMPILE" -j"$JOBS" zImage modules

ZIMAGE=$KDIR/arch/arm/boot/zImage
DTB=$KDIR/arch/arm/boot/dts/axera/ax520-vehiconn.dtb
[[ -f $ZIMAGE && -f $DTB ]] || { log "build did not produce zImage + DTB"; exit 4; }
log "zImage: $(stat -c%s "$ZIMAGE") B   DTB: $(stat -c%s "$DTB") B"

# AIC8800 modules — collected for build-rootfs.sh, not part of this boot image.
log "collect AIC8800 modules (bsp, fdrv)"
MODOUT=$OUT/modules
rm -rf "$MODOUT"; mkdir -p "$MODOUT"
for m in aic8800_bsp aic8800_fdrv; do
  ko=$(find "$DRV" -name "$m.ko" -print -quit)
  [[ -n $ko ]] || { log "module $m.ko not built"; exit 4; }
  "${CROSS_COMPILE}strip" --strip-debug "$ko" -o "$MODOUT/$m.ko"
  log "  $m.ko: $(stat -c%s "$MODOUT/$m.ko") B"
done

# ---------------------------------------------------------------------------
# 5) Wrap into this device's uImage variant (same legacy header layout as
#    stock, but muboot reads it little-endian — see make_uimage.py's own
#    header comment for how that was confirmed against a real mtd3_boot.img).
# ---------------------------------------------------------------------------
log "cat zImage + DTB, wrap as little-endian legacy uImage"
cat "$ZIMAGE" "$DTB" > "$OUT/zImage_w_dtb.bin"
python3 "$HERE/make_uimage.py" "$OUT/zImage_w_dtb.bin" "$OUT/livi-link-ax520-boot.uimg" "LIVI-Link AX520 $KVER"

BOOT_PART_SIZE=$((3 * 1024 * 1024))  # 3 MiB — the "boot" mtd region's real size.
python3 - "$OUT/livi-link-ax520-boot.uimg" "$OUT/livi-link-ax520-boot-padded.uimg" "$BOOT_PART_SIZE" <<'PYEOF'
import sys
src, dst, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
data = open(src, 'rb').read()
assert len(data) <= size, f"{len(data)} exceeds boot partition size {size}"
data += b'\xff' * (size - len(data))
open(dst, 'wb').write(data)
print(f'{dst}: {len(data)} bytes (padded from {len(data)})')
PYEOF

log "done — $OUT/livi-link-ax520-boot-padded.uimg"

build_livid
