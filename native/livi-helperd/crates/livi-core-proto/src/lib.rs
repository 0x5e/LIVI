pub mod config;
pub mod frame;
pub mod gnss;
pub mod input;
pub mod message;
pub mod patch;
pub mod state;
pub mod telemetry;
pub mod theme;

#[cfg(test)]
mod contract_ts;

pub const PROTOCOL: u32 = 8;

pub const LIFELINE_ENV: &str = "LIVI_LIFELINE";
