# i.MX6ULL + IW416: what this board's build scripts and the shared rootfs and bundle scripts
# (common/) take from it.
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BOARD=imx6ul
source "$HERE/../common.sh"

# The vendor U-Boot reads a fixed number of kernel bytes, too few for the full busybox next to the
# kernel, hostapd and the Wi-Fi firmware, so the initramfs gets a busybox with only what the two
# ways in (USB NCM, the Wi-Fi AP), the switch to the rootfs and the provisioner use.
RESCUE_APPLETS="
  LFS BUSYBOX ASH SH_IS_ASH ASH_JOB_CONTROL ASH_ECHO ASH_PRINTF ASH_TEST ASH_CMDCMD ASH_OPTIMIZE_FOR_SIZE
  FEATURE_SH_MATH FEATURE_EDITING FEATURE_TAB_COMPLETION FEATURE_INSTALLER FEATURE_DEVPTS
  CTTYHACK SETSID STTY SWITCH_ROOT
  CAT CHMOD CP CUT DATE DD DF DIRNAME BASENAME DU ECHO ENV FALSE TRUE HEAD TAIL LN LS MKDIR MV
  OD PRINTF RM SEQ SLEEP SYNC TEST TEST1 TEST2 TOUCH TR UNAME UPTIME WC MD5SUM SHA256SUM
  GREP SED AWK HEXDUMP XXD VI
  PS KILL KILLALL PKILL PGREP PIDOF FREE
  MOUNT UMOUNT DMESG FLASHCP FLASH_ERASEALL DEVMEM HALT REBOOT POWEROFF RX
  IFCONFIG FEATURE_IFCONFIG_STATUS BRCTL FEATURE_BRCTL_FANCY FEATURE_BRCTL_SHOW NC NC_SERVER TELNETD
  FEATURE_TELNETD_STANDALONE UDHCPD PING
"

KERNEL_IMG=$OUT/livi-link-imx6ull.zimg
# How many bytes the vendor U-Boot reads on the units we know. The provisioner checks each
# dongle's own value before it writes anything.
KERNEL_MAX=$((0x302fd8))
BUSYBOX=$USERSPACE/bin/busybox
HOSTAPD=$USERSPACE/usr/sbin/hostapd
LIVID=$OUT/livid
ROOTFS_IMG=$OUT/livi-link-imx6ull-rootfs.bin
ROOTFS_SIZE=$((0xc60000))  # "rootfs" partition in imx6ull.dts
# The MTD index in imx6ull.dts: 2 = kernel (the provisioner stages it for the vendor U-Boot), 3 = rootfs.
BUNDLE=$OUT/livi-link-imx6ull.lfwb
BUNDLE_IMAGES=("2:$KERNEL_IMG" "3:$ROOTFS_IMG")

# Not in a tagged linux-firmware tree under this path, so pinned by its hash.
IW416_FW_URL=https://git.kernel.org/pub/scm/linux/kernel/git/firmware/linux-firmware.git/plain/mrvl/sdiouartiw416_combo_v0.bin
IW416_FW_SHA=afcca1b8c240a97b9c452ef8023a829c1942127072907efe34c25bfabb2ba7f9
IW416_FW=$TOP/sdiouartiw416_combo_v0.bin
# mwifiex takes its channels from cfg80211, which allows no access point on 5 GHz without a database.
REGDB_VER=2026.09.03
REGDB_SHA=b22e0901227b820cd1c280abe681a15b773a5103a5e10dc442e94ebb34cbf58d
REGDB=$TOP/wireless-regdb-$REGDB_VER/regulatory.db

fetch_firmware() {
  if ! echo "$IW416_FW_SHA  $IW416_FW" | sha256sum -c --status 2>/dev/null; then
    log "fetch IW416 firmware"
    curl -sSL "$IW416_FW_URL" -o "$IW416_FW"
    echo "$IW416_FW_SHA  $IW416_FW" | sha256sum -c - || { log "IW416 firmware changed upstream, check it and update IW416_FW_SHA"; exit 3; }
  fi
  if [[ ! -f $REGDB ]]; then
    log "fetch wireless-regdb $REGDB_VER"
    curl -sSL "https://cdn.kernel.org/pub/software/network/wireless-regdb/wireless-regdb-$REGDB_VER.tar.xz" \
      -o "$TOP/wireless-regdb-$REGDB_VER.tar.xz"
    echo "$REGDB_SHA  $TOP/wireless-regdb-$REGDB_VER.tar.xz" | sha256sum -c -
    tar -xJf "$TOP/wireless-regdb-$REGDB_VER.tar.xz" -C "$TOP"
  fi
}

rootfs_payload() {
  local work=$1
  need "$OUT/modules/load" "run build.sh first"
  fetch_firmware
  log "IW416 firmware + regulatory.db"
  mkdir -p "$work/lib/firmware/mrvl"
  cp "$IW416_FW" "$work/lib/firmware/mrvl/"
  cp "$REGDB" "$work/lib/firmware/regulatory.db"

  log "kernel modules (Bluetooth and the crypto it selects)"
  mkdir -p "$work/lib/modules/$KVER"
  cp "$OUT/modules"/* "$work/lib/modules/$KVER/"
}
