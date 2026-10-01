# Sourced by the riscv board scripts (v821b): pinned kernel source, shared paths, log(). BOARD names the
# board, it picks the build tree and the log tag.
: "${BOARD:?set BOARD before sourcing riscv/common.sh}"
RISCV=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
COMMON=$(cd "$RISCV/../common" && pwd)
REPO=$(cd "$RISCV/../../.." && pwd)
TOP=${TOP:-$HOME/LocalDev/$BOARD-kernel}
JOBS=${JOBS:-$(nproc)}
# A riscv64 toolchain builds the rv32 kernel as well.
CROSS_COMPILE=${CROSS_COMPILE:-riscv64-linux-gnu-}

source "$COMMON/kernel.sh"

# livid, the multi-call Rust binary (netd, httpd, wifid, ...), to $OUT/livid. Rust ships no
# std for riscv32 Linux, so nightly builds it, and the Andes gcc links it statically (.cargo/config.toml).
build_livid() {
  local helperd=$REPO/native/livi-helperd rtarget=riscv32gc-unknown-linux-gnu livid
  local PATH=${TC_BIN:+$TC_BIN:}$PATH
  command -v riscv32-linux-gcc >/dev/null || { log "no riscv32-linux-gcc in PATH (set TC_BIN)"; exit 3; }
  log "cargo +nightly build livid ($rtarget)"
  ( cd "$helperd" && cargo +nightly build --profile embedded -p livid --target "$rtarget" -Z build-std=std,panic_abort )
  livid=${CARGO_TARGET_DIR:-$helperd/target}/$rtarget/embedded/livid
  [[ -x $livid ]] || { log "missing $livid"; exit 4; }
  cp -f "$livid" "$OUT/livid"
  log "  livid: $(stat -c%s "$OUT/livid") B"
}
