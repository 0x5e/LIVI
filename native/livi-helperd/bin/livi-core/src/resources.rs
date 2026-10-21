use std::path::{Path, PathBuf};

pub struct Resources {
    pub helper: PathBuf,
    pub gst_host: PathBuf,
    pub compositor: PathBuf,
    pub gstreamer: Option<PathBuf>,
    pub templates: PathBuf,
    pub ui: Option<UiCmd>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UiCmd {
    Exec { bin: PathBuf, args: Vec<String> },
    Shell(String),
}

fn platform_dir() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", _) => Some("macos-arm64"),
        ("linux", "aarch64") => Some("linux-arm64"),
        ("linux", "x86_64") => Some("linux-x64"),
        _ => None,
    }
}

fn env_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}

fn env_str(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

fn repo_around(exe: &Path) -> Option<PathBuf> {
    exe.ancestors()
        .find(|dir| dir.join("native/livi-helperd/Cargo.toml").is_file())
        .map(Path::to_path_buf)
}

impl Resources {
    pub fn from_env() -> Self {
        let layout = match env_path("LIVI_RESOURCES") {
            Some(res) => Self::installed(&res),
            None => {
                let root = env_path("LIVI_ROOT")
                    .or_else(|| {
                        std::env::current_exe()
                            .ok()
                            .and_then(|exe| repo_around(&exe))
                    })
                    .or_else(|| std::env::current_dir().ok())
                    .unwrap_or_default();
                Self::repo(&root)
            }
        };
        let ui = if std::env::var("LIVI_NO_UI").is_ok_and(|v| v == "1") {
            None
        } else {
            env_str("LIVI_UI_CMD").map(UiCmd::Shell).or(layout.ui)
        };
        Self {
            helper: env_path("LIVI_HELPER_BIN").unwrap_or(layout.helper),
            gst_host: env_path("LIVI_GST_HOST_BIN").unwrap_or(layout.gst_host),
            compositor: env_path("LIVI_COMPOSITOR_BIN").unwrap_or(layout.compositor),
            gstreamer: layout.gstreamer,
            templates: layout.templates,
            ui,
        }
    }

    fn installed(res: &Path) -> Self {
        Self {
            helper: res.join("driver/livi-helperd"),
            gst_host: res.join("gst-host/livi-gst-host"),
            compositor: res.join("compositor/livi-compositor"),
            gstreamer: platform_dir()
                .map(|d| res.join("gstreamer").join(d))
                .filter(|p| p.is_dir()),
            templates: res.to_path_buf(),
            ui: res.parent().map(|app| UiCmd::Exec {
                bin: app.join("livi-ui"),
                args: Vec::new(),
            }),
        }
    }

    fn repo(root: &Path) -> Self {
        Self {
            helper: root.join("native/livi-helperd/build/Release/livi-helperd"),
            gst_host: root.join("native/livi-gst-video/build/Release/livi-gst-host"),
            compositor: root.join("out/compositor/livi-compositor"),
            gstreamer: platform_dir()
                .map(|d| root.join("assets/gstreamer").join(d))
                .filter(|p| p.is_dir()),
            templates: root.join("assets/linux"),
            ui: Some(UiCmd::Exec {
                bin: root.join("native/livi-helperd/build/Release/LIVI"),
                args: Vec::new(),
            }),
        }
    }
}

pub fn gst_env(root: &Path) -> Vec<(String, String)> {
    let utf8 = if cfg!(target_os = "macos") {
        "en_US.UTF-8"
    } else {
        "C.UTF-8"
    };
    let lib_var = if cfg!(target_os = "macos") {
        "DYLD_LIBRARY_PATH"
    } else {
        "LD_LIBRARY_PATH"
    };
    let p = |rel: &str| root.join(rel).display().to_string();
    vec![
        ("LANG".into(), utf8.into()),
        ("LC_ALL".into(), utf8.into()),
        ("GST_PLUGIN_SYSTEM_PATH".into(), String::new()),
        ("GST_PLUGIN_PATH".into(), p("lib/gstreamer-1.0")),
        (
            "GST_PLUGIN_SCANNER".into(),
            p("libexec/gstreamer-1.0/gst-plugin-scanner"),
        ),
        (lib_var.into(), p("lib")),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layouts_point_where_the_build_puts_things() {
        let repo = Resources::repo(Path::new("/src/LIVI"));
        assert_eq!(
            repo.helper,
            PathBuf::from("/src/LIVI/native/livi-helperd/build/Release/livi-helperd")
        );
        assert_eq!(
            repo.compositor,
            PathBuf::from("/src/LIVI/out/compositor/livi-compositor")
        );
        assert_eq!(
            repo.ui,
            Some(UiCmd::Exec {
                bin: PathBuf::from("/src/LIVI/native/livi-helperd/build/Release/LIVI"),
                args: Vec::new(),
            })
        );
        let installed = Resources::installed(Path::new("/opt/LIVI/resources"));
        assert_eq!(
            installed.helper,
            PathBuf::from("/opt/LIVI/resources/driver/livi-helperd")
        );
        assert_eq!(
            installed.gst_host,
            PathBuf::from("/opt/LIVI/resources/gst-host/livi-gst-host")
        );
        assert_eq!(installed.gstreamer, None);
        assert_eq!(
            installed.ui,
            Some(UiCmd::Exec {
                bin: PathBuf::from("/opt/LIVI/livi-ui"),
                args: Vec::new()
            })
        );
    }

    #[test]
    fn a_build_in_a_checkout_finds_the_checkout() {
        let dir = crate::config_file::tests::TempDir::new();
        let release = dir.0.join("native/livi-helperd/build/Release");
        std::fs::create_dir_all(&release).unwrap();
        std::fs::write(dir.0.join("native/livi-helperd/Cargo.toml"), "").unwrap();
        assert_eq!(repo_around(&release.join("livi-core")), Some(dir.0.clone()));
        assert_eq!(repo_around(Path::new("/usr/bin/livi-core")), None);
    }

    #[test]
    fn gst_env_points_into_the_bundle() {
        let env = gst_env(Path::new("/b"));
        let get = |k: &str| env.iter().find(|(n, _)| n == k).map(|(_, v)| v.as_str());
        assert_eq!(get("GST_PLUGIN_PATH"), Some("/b/lib/gstreamer-1.0"));
        assert_eq!(get("GST_PLUGIN_SYSTEM_PATH"), Some(""));
    }
}
