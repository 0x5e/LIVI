//! Software coprocessor over the credentials seeded beside the app (identity.pk8 +
//! certificate.p7b), for a phone that would otherwise wait for a dongle's MFi chip.
use super::{AuthCoprocessor, MfiError};
use p256::{
    ecdsa::{Signature, SigningKey, signature::hazmat::PrehashSigner},
    pkcs8::DecodePrivateKey,
};
use std::path::Path;

fn fail(e: impl core::fmt::Display) -> MfiError {
    MfiError::Io(e.to_string())
}

pub struct LocalCoprocessor {
    key: SigningKey,
    certificate: Vec<u8>,
}
impl LocalCoprocessor {
    pub fn load(path: &Path) -> Result<Self, MfiError> {
        let bytes = std::fs::read(path.join("identity.pk8")).map_err(fail)?;
        let key = SigningKey::from_pkcs8_der(&bytes).map_err(fail)?;
        let certificate = std::fs::read(path.join("certificate.p7b")).map_err(fail)?;
        if certificate.is_empty() {
            return Err(fail("empty certificate"));
        }
        Ok(Self { key, certificate })
    }
}
impl AuthCoprocessor for LocalCoprocessor {
    fn protocol_major(&mut self) -> Result<u8, MfiError> {
        Ok(3)
    }
    fn read_certificate(&mut self) -> Result<Vec<u8>, MfiError> {
        Ok(self.certificate.clone())
    }
    fn generate_challenge_response(&mut self, challenge: &[u8]) -> Result<Vec<u8>, MfiError> {
        if challenge.len() != 32 {
            return Err(MfiError::ChallengeSize(challenge.len()));
        }
        let signature: Signature =
            self.key.sign_prehash(challenge).map_err(|e| MfiError::Io(e.to_string()))?;
        Ok(signature.to_bytes().to_vec())
    }
}
