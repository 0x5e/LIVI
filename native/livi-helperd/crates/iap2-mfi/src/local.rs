//! Software coprocessor over an MFi identity the caller already holds — the PKCS#8
//! private key and the certificate — for a phone that would otherwise wait for a
//! dongle's MFi chip.
use super::{AuthCoprocessor, MfiError};
use p256::{
    ecdsa::{Signature, SigningKey, signature::hazmat::PrehashSigner},
    pkcs8::DecodePrivateKey,
};

pub struct LocalCoprocessor {
    key: SigningKey,
    certificate: Vec<u8>,
}
impl LocalCoprocessor {
    /// `key` is the PKCS#8 DER of the P-256 private key, `certificate` the p7b blob.
    ///
    /// The bytes are handed in rather than read from a path, so a caller that
    /// carries its credentials some other way — embedded in its own binary, say —
    /// can still use this.
    pub fn load(key: &[u8], certificate: &[u8]) -> Result<Self, MfiError> {
        let key = SigningKey::from_pkcs8_der(key).map_err(|e| MfiError::Io(e.to_string()))?;
        if certificate.is_empty() {
            return Err(MfiError::Io("empty certificate".to_string()));
        }
        Ok(Self { key, certificate: certificate.to_vec() })
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
