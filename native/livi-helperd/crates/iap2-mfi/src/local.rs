//! Local credential provider. Credentials remain outside the application bundle.
use super::{AuthCoprocessor, MfiError};
use p256::{
    ecdsa::{Signature, SigningKey, signature::hazmat::PrehashSigner},
    pkcs8::DecodePrivateKey,
};
use std::path::Path;
pub struct LocalCoprocessor {
    key: SigningKey,
    certificate: Vec<u8>,
}
impl LocalCoprocessor {
    pub fn load(path: &Path) -> Result<Self, MfiError> {
        let fail = |e: String| MfiError::Io(format!("local authentication: {e}"));
        let bytes = std::fs::read(path.join("identity.pk8")).map_err(|e| fail(e.to_string()))?;
        let key = SigningKey::from_pkcs8_der(&bytes).map_err(|e| fail(e.to_string()))?;
        let certificate =
            std::fs::read(path.join("certificate.p7b")).map_err(|e| fail(e.to_string()))?;
        if certificate.is_empty() {
            return Err(fail("empty certificate".into()));
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
