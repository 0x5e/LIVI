# native/livi-crypto

N-API addon that gives the main process native ChaCha20-Poly1305, used for the
CarPlay handshake and to decrypt screen video frames without the JS AEAD's CPU
cost. One N-API build loads under both Electron and the test runner, so it must
be built (via `build:native:*` or `node scripts/build-native.mjs`) before
either runs.

Exports `open(key, nonce, ct, aad?)` and `seal(key, nonce, pt, aad?)`.

The addon is built with cargo from the Rust crate
`native/livi-crypto/rust` (aws-lc-rs AEAD — assembly
ChaCha20/Poly1305, NEON on aarch64; needs cmake for the AWS-LC build). N-API is
ABI-stable, so no Electron headers are involved. The cdylib is copied to
`build/Release/livi_crypto.node`, where `index.js` loads it.

The livi-gst-video receivers (audio, mic, screen) use the same crate as a cargo
dependency, so every ChaCha20-Poly1305 in the project is that one implementation.

## Third-party licences

The compiled addon statically embeds [AWS-LC](https://github.com/aws/aws-lc)
via aws-lc-rs (ISC / Apache-2.0, with OpenSSL/SSLeay-licensed portions) and
[napi-rs](https://github.com/napi-rs/napi-rs) (MIT).
