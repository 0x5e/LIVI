//! Shared LIVI-Link mDNS: wire format + interface-tracking daemon.
//! Used by livid's netd on every LIVI Link board.
pub mod wire;
pub mod daemon;

pub use wire::{Name, PORT, GROUP, build_answer, parse_query};
