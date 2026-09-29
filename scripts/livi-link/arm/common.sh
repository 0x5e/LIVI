# Sourced by the armv7 board scripts (ax520, imx6ul) and the shared armv7 userspace build: pinned
# kernel source, shared paths, log(). BOARD names the board, it picks the build tree and the log tag.
: "${BOARD:?set BOARD before sourcing arm/common.sh}"
ARM=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
COMMON=$(cd "$ARM/../common" && pwd)
REPO=$(cd "$ARM/../../.." && pwd)
TOP=${TOP:-$HOME/LocalDev/$BOARD-kernel}
JOBS=${JOBS:-$(nproc)}
CROSS_COMPILE=${CROSS_COMPILE:-arm-linux-gnu-}

source "$COMMON/kernel.sh"

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
