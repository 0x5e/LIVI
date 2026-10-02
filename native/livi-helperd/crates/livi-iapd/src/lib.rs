// LIVI-Link iAP2 accessory daemon: the kernel's management socket, SDP, RFCOMM channel + host
// handoff.

#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

pub mod mgmt;
pub mod sdp;

#[cfg(target_os = "linux")]
mod server;
#[cfg(target_os = "linux")]
pub use server::{Config, NameSource, run};
