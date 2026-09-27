# V821B + AIC8800D80: what the shared rootfs and bundle scripts (common/) take from this board.
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BOARD=v821b
REPO=$(cd "$HERE/../../../.." && pwd)
USERSPACE=${USERSPACE:-$HOME/LocalDev/livi-userspace-build/out}
OUT_DIR=${OUT_DIR:-$HOME/LocalDev/tina-test/out}
log(){ printf '\033[1;36m[%s-%s]\033[0m %s\n' "$BOARD" "${LOG_TAG:-build}" "$*"; }

BUSYBOX=$USERSPACE/bin/busybox
HOSTAPD=$USERSPACE/usr/sbin/hostapd
LIVID=$REPO/native/livi-helperd/target/riscv32gc-unknown-linux-gnu/embedded/livid
ROOTFS_IMG=$OUT_DIR/livi-link-v821b-mtd3.bin
ROOTFS_SIZE=$((0x480000))  # mtd3, 4.5 MiB
# The MTD index: 1 = mtd1 (bootimg), 3 = mtd3 (rootfs).
BUNDLE=$OUT_DIR/livi-link-v821b.lfwb
BUNDLE_IMAGES=("1:$OUT_DIR/livi-link-v821b-mtd1.bin" "3:$ROOTFS_IMG")

# busybox and hostapd link musl and libnl dynamically here.
rootfs_payload() {
  local work=$1 m
  log "musl runtime + libnl3 (from $USERSPACE)"
  cp    "$USERSPACE/lib/libc.so"              "$work/lib/libc.so"
  cp -P "$USERSPACE/lib/ld-musl-riscv32.so.1" "$work/lib/"
  cp -P "$USERSPACE/usr/lib"/libnl-3.so*       "$work/usr/lib/"
  cp -P "$USERSPACE/usr/lib"/libnl-genl-3.so*  "$work/usr/lib/"

  local modules=${MODULES:-$OUT_DIR/modules} krel=5.4.220
  mkdir -p "$work/lib/modules/$krel"
  for m in aic8800_bsp aic8800_fdrv aic8800_btlpm; do
    need "$modules/$m.ko" "run build.sh first"
    cp "$modules/$m.ko" "$work/lib/modules/$krel/$m.ko"
  done
  log "AIC8800 modules: $(du -sk "$work/lib/modules/$krel" | cut -f1) KiB"

  # The from-source AIC driver (tag 20250410) requests firmware under lowercase aic8800d80/, but
  # the blobs live in aic8800D80/. Add a case alias here — the build host is case-sensitive, the
  # Mac repo is not, so this can't live in the committed overlay.
  if [ -d "$work/lib/firmware/aic8800D80" ] && [ ! -e "$work/lib/firmware/aic8800d80" ]; then
    ln -s aic8800D80 "$work/lib/firmware/aic8800d80"
    log "firmware case alias: aic8800d80 -> aic8800D80"
  fi
}
