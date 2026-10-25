use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub struct Bundle {
    pub app: PathBuf,
    pub resources: PathBuf,
}

pub fn find() -> Option<Bundle> {
    let exe = std::env::current_exe().ok()?;
    let contents = exe.parent()?.parent()?;
    let app = contents.parent()?;
    app.extension().is_some_and(|e| e == "app").then(|| Bundle {
        app: app.to_path_buf(),
        resources: contents.join("Resources"),
    })
}

impl Bundle {
    pub fn gstreamer(&self) -> PathBuf {
        self.resources.join("gstreamer/macos-arm64")
    }

    pub fn core(&self) -> PathBuf {
        self.resources.join("core/livi-core")
    }

    pub fn use_bundled_gstreamer(&self) {
        let root = self.gstreamer();
        let vars = [
            ("GST_PLUGIN_SYSTEM_PATH", PathBuf::new()),
            ("GST_PLUGIN_PATH", root.join("lib/gstreamer-1.0")),
            (
                "GST_PLUGIN_SCANNER",
                root.join("libexec/gstreamer-1.0/gst-plugin-scanner"),
            ),
        ];
        for (name, value) in vars {
            unsafe { std::env::set_var(name, value) };
        }
    }

    pub fn relaunch(&self) -> std::io::Result<()> {
        relaunch_through_open(&self.app)
    }
}

fn relaunch_through_open(app: &Path) -> std::io::Result<()> {
    let wait_then_open = format!(
        "while kill -0 {} 2>/dev/null; do sleep 0.2; done; exec /usr/bin/open \"$0\"",
        std::process::id()
    );
    Command::new("/bin/sh")
        .arg("-c")
        .arg(wait_then_open)
        .arg(app)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
}
