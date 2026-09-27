# Sourced by the armv7 board scripts (ax520, imx6ul) and the shared armv7 userspace build: pinned
# kernel source, shared paths, log(). BOARD names the board, it picks the build tree and the log tag.
: "${BOARD:?set BOARD before sourcing arm/common.sh}"
ARM=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
COMMON=$(cd "$ARM/../common" && pwd)
REPO=$(cd "$ARM/../../.." && pwd)
TOP=${TOP:-$HOME/LocalDev/$BOARD-kernel}
JOBS=${JOBS:-$(nproc)}
CROSS_COMPILE=${CROSS_COMPILE:-arm-linux-gnu-}

KVER=6.18.53
KMAJOR=${KVER%%.*}
KURL="https://cdn.kernel.org/pub/linux/kernel/v${KMAJOR}.x/linux-${KVER}.tar.xz"
KDIR=$TOP/linux-$KVER
OUT=$TOP/out
USERSPACE=${USERSPACE:-$TOP/userspace/out}
mkdir -p "$TOP" "$OUT"

log(){ printf '\033[1;36m[%s-%s]\033[0m %s\n' "$BOARD" "${LOG_TAG:-build}" "$*"; }

# Vanilla kernel.org tarball, checked against kernel.org's own published
# sha256sums rather than a hash we would have to keep in sync by hand.
fetch_kernel() {
  [[ -d $KDIR ]] && return 0
  log "fetch linux-$KVER"
  curl -sSL "$KURL" -o "$TOP/linux-$KVER.tar.xz"
  curl -sSL "https://cdn.kernel.org/pub/linux/kernel/v${KMAJOR}.x/sha256sums.asc" -o "$TOP/sha256sums.asc"
  local expected
  expected=$(grep " linux-$KVER.tar.xz\$" "$TOP/sha256sums.asc" | awk '{print $1}')
  [[ -n $expected ]] || { log "linux-$KVER.tar.xz not found in kernel.org sha256sums"; exit 3; }
  echo "$expected  $TOP/linux-$KVER.tar.xz" | sha256sum -c -
  tar -xJf "$TOP/linux-$KVER.tar.xz" -C "$TOP"
}

# The gen_init_cpio list every armv7 initramfs starts from: a plain directory cannot carry device
# nodes, and /dev/console has to exist before init runs. Applet links are made by init itself
# (busybox --install), so only the binary goes in. The board appends its own files.
initramfs_common() {
  local busybox=$1
  cat <<EOF
dir /bin 0755 0 0
dir /sbin 0755 0 0
dir /usr 0755 0 0
dir /usr/bin 0755 0 0
dir /usr/sbin 0755 0 0
dir /etc 0755 0 0
dir /dev 0755 0 0
dir /proc 0755 0 0
dir /sys 0755 0 0
dir /tmp 1777 0 0
dir /mnt 0755 0 0
dir /var 0755 0 0
nod /dev/console 0600 0 0 c 5 1
nod /dev/null 0666 0 0 c 1 3
file /bin/busybox $busybox 0755 0 0
file /init $COMMON/initramfs/init 0755 0 0
file /sbin/net-up $COMMON/initramfs/net-up 0755 0 0
file /sbin/net-down $COMMON/initramfs/net-down 0755 0 0
file /sbin/nousb $COMMON/initramfs/nousb 0755 0 0
file /etc/board.sh $HERE/initramfs/board.sh 0644 0 0
EOF
}

# livid, the multi-call Rust binary (netd, httpd, tinyshell, wifid, ...), to $OUT/livid. musl target,
# so it is fully static like everything else on the rootfs.
build_livid() {
  local helperd=$REPO/native/livi-helperd rtarget=armv7-unknown-linux-musleabihf livid
  log "cargo build livid ($rtarget)"
  (
    cd "$helperd"
    export "CARGO_TARGET_$(echo "$rtarget" | tr 'a-z-' 'A-Z_')_LINKER=${CROSS_COMPILE}gcc"
    export "CC_${rtarget//-/_}=${CROSS_COMPILE}gcc"
    export "AR_${rtarget//-/_}=${CROSS_COMPILE}ar"
    cargo build --profile embedded -p livid --target "$rtarget"
  )
  livid=${CARGO_TARGET_DIR:-$helperd/target}/$rtarget/embedded/livid
  [[ -x $livid ]] || { log "missing $livid"; exit 4; }
  cp -f "$livid" "$OUT/livid"
  log "  livid: $(stat -c%s "$OUT/livid") B"
}

# A script with a syntax error stops init or rcS before the ways in are up, so every shell script in
# the list is parsed here first.
check_initramfs_scripts() {
  local list=$1 kind dst src
  while read -r kind dst src _; do
    [[ $kind == file ]] || continue
    [[ $src == *.sh ]] || { [[ $(head -c 2 "$src") == '#!' ]] && head -n 1 "$src" | grep -q sh; } || continue
    sh -n "$src" || { log "syntax error in $src ($dst)"; exit 4; }
  done < "$list"
}

# Applies every patch in a directory to a tree, and accepts one that is already in.
apply_patches() {
  local dir=$1 tree=$2 p
  for p in "$dir"/*.patch; do
    [[ -e $p ]] || continue
    ( cd "$tree" && patch -p1 -N -r- -s < "$p" ) \
      || ( cd "$tree" && patch -p1 -R --dry-run -s < "$p" >/dev/null ) \
      || { log "patch $(basename "$p") failed"; exit 5; }
  done
}
