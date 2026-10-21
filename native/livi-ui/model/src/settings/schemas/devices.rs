use crate::settings::node::{Label, Node};

pub fn schema() -> Node {
    Node::route(
        "devices",
        Label::new("settings.devices", "Devices"),
        vec![Node::bt_device_list(
            Label::new("settings.devices", "Devices"),
            "bluetoothPairedDevices",
        )],
    )
    .icon("devices")
}
