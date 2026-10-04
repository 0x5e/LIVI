use std::io;
use std::os::fd::{AsRawFd, OwnedFd, RawFd};
use std::time::{Duration, Instant};

use tokio::io::Interest;
use tokio::io::unix::AsyncFd;
use tokio::sync::mpsc;

use iap2_link::{
    CONTROL_SESSION_ID, Event, FILE_TRANSFER_SESSION_ID, LinkConfig, LinkEngine, LinkState,
};

use crate::file_transfer::{FileTransferReceiver, FtOutput};
use crate::framing::FrameReader;
use crate::{ChannelError, ControlChannel};

const PHONE_QUIET: Duration = Duration::from_secs(5);
const TRACE_CHUNKS: usize = 20;
const TRACE_BYTES: usize = 32;

/// The first chunks of a wired link in both directions, as LIVI.log shows them.
#[derive(Default)]
struct Trace {
    bytes_in: usize,
    bytes_out: usize,
    chunks_in: usize,
    chunks_out: usize,
}

impl Trace {
    fn inbound(&mut self, data: &[u8], now: u64) {
        self.bytes_in += data.len();
        self.chunks_in += 1;
        if self.chunks_in <= TRACE_CHUNKS {
            println!("[link] in  {now} ms: {} bytes {}", data.len(), hex(data));
        }
    }

    fn out(&mut self, data: &[u8], now: u64) {
        self.bytes_out += data.len();
        self.chunks_out += 1;
        if self.chunks_out <= TRACE_CHUNKS {
            println!("[link] out {now} ms: {} bytes {}", data.len(), hex(data));
        }
    }
}

fn hex(data: &[u8]) -> String {
    let shown: Vec<String> = data.iter().take(TRACE_BYTES).map(|b| format!("{b:02x}")).collect();
    let more = if data.len() > TRACE_BYTES { " …" } else { "" };
    format!("{}{more}", shown.join(" "))
}

pub struct LinkChannel {
    out_tx: mpsc::UnboundedSender<Vec<u8>>,
    in_rx: mpsc::UnboundedReceiver<Vec<u8>>,
}

impl ControlChannel for LinkChannel {
    async fn send(&mut self, frame: Vec<u8>) -> Result<(), ChannelError> {
        self.out_tx.send(frame).map_err(|_| ChannelError::Closed)
    }
    async fn recv(&mut self) -> Option<Vec<u8>> {
        self.in_rx.recv().await
    }
}

/// Completed file-transfer payloads (album artwork) the phone pushed over the link.
pub type ArtworkRx = mpsc::UnboundedReceiver<Vec<u8>>;

pub fn spawn_link(
    fd: OwnedFd,
    cfg: LinkConfig,
    initiate_negotiate: bool,
) -> (LinkChannel, ArtworkRx) {
    set_nonblocking(fd.as_raw_fd());
    let (out_tx, out_rx) = mpsc::unbounded_channel();
    let (in_tx, in_rx) = mpsc::unbounded_channel();
    let (art_tx, art_rx) = mpsc::unbounded_channel();
    tokio::spawn(async move {
        if let Err(e) = pump(fd, cfg, initiate_negotiate, out_rx, in_tx, art_tx).await {
            eprintln!("[link] pump ended: {e}");
        }
    });
    (LinkChannel { out_tx, in_rx }, art_rx)
}

async fn pump(
    fd: OwnedFd,
    cfg: LinkConfig,
    initiate_negotiate: bool,
    mut out_rx: mpsc::UnboundedReceiver<Vec<u8>>,
    in_tx: mpsc::UnboundedSender<Vec<u8>>,
    art_tx: mpsc::UnboundedSender<Vec<u8>>,
) -> io::Result<()> {
    let async_fd = AsyncFd::with_interest(fd, Interest::READABLE | Interest::WRITABLE)?;
    let start = Instant::now();
    let now = || start.elapsed().as_millis() as u64;

    let mut engine = LinkEngine::new(cfg);
    engine.start(initiate_negotiate, now());
    let mut reader = FrameReader::default();
    let mut ft = FileTransferReceiver::default();
    let mut pending = engine.take_output();

    loop {
        let sleep = engine
            .next_deadline()
            .map(|d| Duration::from_millis(d.saturating_sub(now())))
            .unwrap_or(Duration::from_secs(3600));

        tokio::select! {
            r = async_fd.readable() => {
                let mut guard = r?;
                let mut buf = [0u8; 4096];
                match read_fd(async_fd.get_ref().as_raw_fd(), &mut buf) {
                    Ok(0) => { engine.feed_eof(); }
                    Ok(n) => engine.feed(&buf[..n], now()),
                    Err(e) if e.kind() == io::ErrorKind::WouldBlock => guard.clear_ready(),
                    Err(e) => return Err(e),
                }
            }
            w = async_fd.writable(), if !pending.is_empty() => {
                let mut guard = w?;
                match write_fd(async_fd.get_ref().as_raw_fd(), &pending) {
                    Ok(n) => { pending.drain(..n); }
                    Err(e) if e.kind() == io::ErrorKind::WouldBlock => guard.clear_ready(),
                    Err(e) => return Err(e),
                }
            }
            frame = out_rx.recv() => {
                match frame {
                    Some(frame) => engine.send(CONTROL_SESSION_ID, frame, now()),
                    None => return Ok(()),
                }
            }
            _ = tokio::time::sleep(sleep) => {}
        }

        engine.advance_time(now());
        pending.extend(engine.take_output());

        if !drain_events(&mut engine, &mut reader, &mut ft, &in_tx, &art_tx, &mut pending, now()) {
            return Ok(());
        }
    }
}

/// Moves engine events out to the session: control frames get reassembled into CSM frames,
/// file transfers are acknowledged and completed artwork forwarded. Returns false when the
/// link is finished.
fn drain_events(
    engine: &mut LinkEngine,
    reader: &mut FrameReader,
    ft: &mut FileTransferReceiver,
    in_tx: &mpsc::UnboundedSender<Vec<u8>>,
    art_tx: &mpsc::UnboundedSender<Vec<u8>>,
    pending: &mut Vec<u8>,
    now: u64,
) -> bool {
    let mut ft_replies: Vec<Vec<u8>> = Vec::new();
    while let Some(event) = engine.poll_event() {
        match event {
            Event::Control(bytes) => {
                reader.push(&bytes);
                while let Some(frame) = reader.next_frame() {
                    if in_tx.send(frame).is_err() {
                        return false;
                    }
                }
            }
            Event::FileTransfer(datagram) => {
                for out in ft.feed(&datagram) {
                    match out {
                        FtOutput::Reply(bytes) => ft_replies.push(bytes),
                        FtOutput::Complete(data) => {
                            let _ = art_tx.send(data);
                        }
                    }
                }
            }
            Event::Dead { reason } => {
                if let Some(r) = reason {
                    eprintln!("[link] dead: {r}");
                }
                return false;
            }
            _ => {}
        }
    }
    if !ft_replies.is_empty() {
        for reply in ft_replies {
            engine.send(FILE_TRANSFER_SESSION_ID, reply, now);
        }
        pending.extend(engine.take_output());
    }
    engine.state() != LinkState::Dead
}

/// Drives the link over any byte stream (the wired carkit TLS channel), splitting it so
/// reads never block outgoing ACKs.
pub fn spawn_link_stream<S>(
    stream: S,
    cfg: LinkConfig,
    initiate_negotiate: bool,
) -> (LinkChannel, ArtworkRx)
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let (out_tx, out_rx) = mpsc::unbounded_channel();
    let (in_tx, in_rx) = mpsc::unbounded_channel();
    let (art_tx, art_rx) = mpsc::unbounded_channel();
    tokio::spawn(async move {
        if let Err(e) = pump_stream(stream, cfg, initiate_negotiate, out_rx, in_tx, art_tx).await {
            eprintln!("[link] stream pump ended: {e}");
        }
    });
    (LinkChannel { out_tx, in_rx }, art_rx)
}

async fn pump_stream<S>(
    stream: S,
    cfg: LinkConfig,
    initiate_negotiate: bool,
    mut out_rx: mpsc::UnboundedReceiver<Vec<u8>>,
    in_tx: mpsc::UnboundedSender<Vec<u8>>,
    art_tx: mpsc::UnboundedSender<Vec<u8>>,
) -> io::Result<()>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let (mut rd, mut wr) = tokio::io::split(stream);
    let (rx_tx, mut rx_rx) = mpsc::unbounded_channel::<Vec<u8>>();
    tokio::spawn(async move {
        let mut buf = [0u8; 8192];
        loop {
            match rd.read(&mut buf).await {
                Ok(0) => break,
                Err(e) => {
                    eprintln!("[link] reading from the phone failed: {e}");
                    break;
                }
                Ok(n) => {
                    if rx_tx.send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
            }
        }
    });

    let start = Instant::now();
    let now = || start.elapsed().as_millis() as u64;

    let mut engine = LinkEngine::new(cfg);
    engine.start(initiate_negotiate, now());
    let mut reader = FrameReader::default();
    let mut ft = FileTransferReceiver::default();
    let mut pending = engine.take_output();
    // What a cable session that never identifies needs to show: what went out, what came back.
    let mut trace = Trace::default();
    let mut state = engine.state();
    let summary = tokio::time::sleep(PHONE_QUIET);
    tokio::pin!(summary);
    let mut summed = false;

    loop {
        if !pending.is_empty() {
            let out = std::mem::take(&mut pending);
            trace.out(&out, now());
            wr.write_all(&out).await?;
            wr.flush().await?;
        }

        let sleep = engine
            .next_deadline()
            .map(|d| Duration::from_millis(d.saturating_sub(now())))
            .unwrap_or(Duration::from_secs(3600));

        tokio::select! {
            data = rx_rx.recv() => match data {
                Some(data) => {
                    trace.inbound(&data, now());
                    engine.feed(&data, now())
                }
                None => engine.feed_eof(),
            },
            frame = out_rx.recv() => match frame {
                Some(frame) => engine.send(CONTROL_SESSION_ID, frame, now()),
                None => return Ok(()),
            },
            _ = &mut summary, if !summed => {
                summed = true;
                let (skipped, dropped) = engine.discarded();
                println!(
                    "[link] after {} s: {} bytes in, {} out, {skipped} skipped, {dropped} frames \
                     dropped, {:?}",
                    PHONE_QUIET.as_secs(),
                    trace.bytes_in,
                    trace.bytes_out,
                    engine.state()
                );
            }
            _ = tokio::time::sleep(sleep) => {}
        }

        engine.advance_time(now());
        pending.extend(engine.take_output());

        let alive =
            drain_events(&mut engine, &mut reader, &mut ft, &in_tx, &art_tx, &mut pending, now());
        if engine.state() != state {
            println!("[link] {state:?} -> {:?} after {} ms", engine.state(), now());
            state = engine.state();
        }
        if !alive {
            return Ok(());
        }
    }
}

fn set_nonblocking(fd: RawFd) {
    unsafe {
        let flags = libc::fcntl(fd, libc::F_GETFL);
        if flags >= 0 {
            libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK);
        }
    }
}

fn read_fd(fd: RawFd, buf: &mut [u8]) -> io::Result<usize> {
    let n = unsafe { libc::read(fd, buf.as_mut_ptr() as *mut libc::c_void, buf.len()) };
    if n < 0 { Err(io::Error::last_os_error()) } else { Ok(n as usize) }
}

fn write_fd(fd: RawFd, buf: &[u8]) -> io::Result<usize> {
    let n = unsafe { libc::write(fd, buf.as_ptr() as *const libc::c_void, buf.len()) };
    if n < 0 { Err(io::Error::last_os_error()) } else { Ok(n as usize) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_traced_chunk_shows_its_first_bytes_and_marks_the_rest() {
        assert_eq!(hex(&[0xff, 0x55, 0x02]), "ff 55 02");
        let long = vec![0xab; TRACE_BYTES + 1];
        assert!(hex(&long).ends_with("ab …"));
        assert_eq!(hex(&long).matches("ab").count(), TRACE_BYTES);
    }

    #[test]
    fn the_trace_counts_every_byte_but_logs_only_the_first_chunks() {
        let mut trace = Trace::default();
        for _ in 0..TRACE_CHUNKS + 5 {
            trace.inbound(&[1, 2, 3], 0);
            trace.out(&[4, 5], 0);
        }
        assert_eq!(
            (trace.bytes_in, trace.bytes_out),
            (3 * (TRACE_CHUNKS + 5), 2 * (TRACE_CHUNKS + 5))
        );
    }
}
