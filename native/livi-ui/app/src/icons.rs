use std::cell::RefCell;
use std::collections::HashMap;

use slint::Image;

include!(concat!(env!("OUT_DIR"), "/icons.rs"));

thread_local! {
    static LOADED: RefCell<HashMap<&'static str, Image>> = RefCell::default();
}

pub fn icon(name: &str) -> Option<Image> {
    let (key, bytes) = ICONS.iter().find(|(n, _)| *n == name)?;
    LOADED.with_borrow_mut(|cache| {
        if let Some(img) = cache.get(key) {
            return Some(img.clone());
        }
        let img = Image::load_from_svg_data(bytes).ok()?;
        cache.insert(key, img.clone());
        Some(img)
    })
}
