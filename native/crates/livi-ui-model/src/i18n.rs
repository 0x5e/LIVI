use std::collections::HashMap;

use serde_json::Value;

const EN: &str = include_str!("../locales/en.json");
const DE: &str = include_str!("../locales/de.json");
const FR: &str = include_str!("../locales/fr.json");
const UA: &str = include_str!("../locales/ua.json");

pub struct Strings {
    lang: String,
    words: HashMap<String, String>,
    fallback: HashMap<String, String>,
}

fn flatten(prefix: &str, value: &Value, out: &mut HashMap<String, String>) {
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                let key = if prefix.is_empty() {
                    k.clone()
                } else {
                    format!("{prefix}.{k}")
                };
                flatten(&key, v, out);
            }
        }
        Value::String(s) => {
            out.insert(prefix.to_string(), s.clone());
        }
        _ => {}
    }
}

fn table(json: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    if let Ok(v) = serde_json::from_str::<Value>(json) {
        flatten("", &v, &mut out);
    }
    out
}

fn source(lang: &str) -> &'static str {
    match lang.split(['-', '_']).next().unwrap_or("en") {
        "de" => DE,
        "fr" => FR,
        "ua" | "uk" => UA,
        _ => EN,
    }
}

impl Strings {
    pub fn new(lang: &str) -> Self {
        Self {
            lang: lang.to_string(),
            words: table(source(lang)),
            fallback: table(EN),
        }
    }

    pub fn lang(&self) -> &str {
        &self.lang
    }

    pub fn get(&self, key: &str) -> Option<&str> {
        self.words
            .get(key)
            .or_else(|| self.fallback.get(key))
            .map(String::as_str)
    }

    pub fn t(&self, key: &str, text: &str) -> String {
        self.get(key).unwrap_or(text).to_string()
    }

    pub fn with(&self, key: &str, text: &str, vars: &[(&str, &str)]) -> String {
        let mut s = self.t(key, text);
        for (name, value) in vars {
            s = s.replace(&format!("{{{{{name}}}}}"), value);
        }
        s
    }
}

impl Default for Strings {
    fn default() -> Self {
        Self::new("en")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nested_keys_resolve_with_english_fallback() {
        let de = Strings::new("de");
        assert_eq!(de.t("settings.audio", "x"), "Audio");
        assert_eq!(de.t("settings.devices", "x"), "Geräte");
        assert_eq!(de.t("no.such.key", "Fallback"), "Fallback");
    }

    #[test]
    fn region_codes_pick_the_language() {
        assert_eq!(
            Strings::new("uk-UA").t("settings.audio", "x"),
            Strings::new("ua").t("settings.audio", "x")
        );
    }

    #[test]
    fn placeholders_are_filled() {
        let en = Strings::new("en");
        assert_eq!(en.with("none", "Hi {{name}}", &[("name", "Ada")]), "Hi Ada");
    }
}
