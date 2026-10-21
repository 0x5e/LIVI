use crate::settings::node::{CustomPage, Label, Node, OptionValue, Shown, choice};

fn color(key: &'static str, text: &'static str, path: &'static str) -> Node {
    Node::color(Label::new(key, text), path)
        .display_value()
        .page(Label::new(key, text))
}

pub fn schema() -> Node {
    Node::route(
        "appearance",
        Label::new("settings.appearance", "Appearance"),
        vec![
            Node::slider(
                Label::new("settings.displayBrightness", "Display Brightness"),
                "displayBrightness",
            )
            .icon("displayBrightness")
            .display_value()
            .shown(Shown::Percent)
            .page(Label::new(
                "settings.displayBrightness",
                "Display Brightness",
            )),
            Node::checkbox(
                Label::new("settings.displayBrightnessAuto", "Auto Brightness"),
                "displayBrightnessAuto",
            )
            .icon("displayBrightnessAuto"),
            Node::checkbox(Label::new("settings.darkMode", "Dark Mode"), "darkMode")
                .icon("darkMode"),
            Node::checkbox(
                Label::new("settings.overlayMessages", "Overlay Messages"),
                "overlayMessages",
            )
            .icon("overlayMessages"),
            Node::select(
                Label::new("settings.phoneAppearance", "Phone Appearance"),
                "appearanceMode",
                vec![
                    choice(
                        Label::new("settings.phoneAppearanceAuto", "Auto"),
                        OptionValue::Text("auto"),
                    ),
                    choice(
                        Label::new("settings.phoneAppearanceDay", "Day"),
                        OptionValue::Text("day"),
                    ),
                    choice(
                        Label::new("settings.phoneAppearanceNight", "Night"),
                        OptionValue::Text("night"),
                    ),
                ],
            )
            .icon("phoneAppearance")
            .display_value()
            .page(Label::new("settings.phoneAppearance", "Phone Appearance")),
            Node::route(
                "ui-colors",
                Label::plain("UI Colors"),
                vec![
                    color(
                        "settings.primaryColorDark",
                        "Primary Color Dark",
                        "primaryColorDark",
                    ),
                    color(
                        "settings.highlightColorDark",
                        "Highlight Color Dark",
                        "highlightColorDark",
                    ),
                    color(
                        "settings.backgroundColorDark",
                        "Background Color Dark",
                        "backgroundColorDark",
                    ),
                    color(
                        "settings.primaryColorLight",
                        "Primary Color Light",
                        "primaryColorLight",
                    ),
                    color(
                        "settings.highlightColorLight",
                        "Highlight Color Light",
                        "highlightColorLight",
                    ),
                    color(
                        "settings.backgroundColorLight",
                        "Background Color Light",
                        "backgroundColorLight",
                    ),
                ],
            )
            .icon("uiColors"),
            Node::route(
                "display-contrast-gamma",
                Label::plain("Contrast / Gamma"),
                vec![Node::custom(
                    Label::plain("Contrast / Gamma"),
                    "displayGamma",
                    CustomPage::ContrastGammaCalibration,
                )],
            )
            .icon("contrastGamma"),
            Node::route(
                "display-color",
                Label::plain("Color"),
                vec![Node::custom(
                    Label::plain("Color"),
                    "displayColorR",
                    CustomPage::ColorCalibration,
                )],
            )
            .icon("displayColor"),
            Node::route(
                "ui-icon",
                Label::new("settings.uiIcon", "UI Icon"),
                vec![Node::custom(
                    Label::new("settings.uiIcon", "UI Icon"),
                    "carplayIcon180",
                    CustomPage::IconUploader,
                )],
            )
            .icon("uiIcon"),
        ],
    )
    .icon("appearance")
}
