//! Shared LIVI-Link mDNS: wire format + interface-tracking daemon.
//! Used by livid's netd on every LIVI Link board.
pub mod daemon;
pub mod wire;

pub use wire::{GROUP, Name, PORT, build_answer, parse_query};
