import {
  aesCtr128,
  chachaOpen,
  chachaSeal,
  ed25519Generate,
  ed25519Sign,
  ed25519Verify,
  hkdfSha512,
  nonce64,
  nonceLabel,
  sha1,
  sha256,
  x25519Generate,
  x25519PrivFromRaw,
  x25519Shared
} from '../crypto'

const RFC7748 = {
  alicePriv: Buffer.from('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a', 'hex'),
  alicePub: Buffer.from('8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a', 'hex'),
  bobPub: Buffer.from('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f', 'hex'),
  shared: Buffer.from('4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742', 'hex')
}

describe('x25519', () => {
  test('generates a pair with a 32-byte raw public key', () => {
    const { priv, pubRaw } = x25519Generate()
    expect(pubRaw.length).toBe(32)
    expect(priv.type).toBe('private')
  })

  test('both sides derive the same shared secret', () => {
    const a = x25519Generate()
    const b = x25519Generate()
    expect(x25519Shared(a.priv, b.pubRaw).equals(x25519Shared(b.priv, a.pubRaw))).toBe(true)
  })

  test('matches the RFC 7748 test vector via x25519PrivFromRaw', () => {
    const priv = x25519PrivFromRaw(RFC7748.alicePriv)
    expect(x25519Shared(priv, RFC7748.bobPub).equals(RFC7748.shared)).toBe(true)
  })
})

describe('ed25519', () => {
  test('sign/verify round trip', () => {
    const kp = ed25519Generate()
    expect(kp.privRaw.length).toBe(32)
    expect(kp.pubRaw.length).toBe(32)
    const data = Buffer.from('livi')
    const sig = ed25519Sign(kp.privRaw, data)
    expect(sig.length).toBe(64)
    expect(ed25519Verify(kp.pubRaw, data, sig)).toBe(true)
  })

  test('rejects a signature over different data', () => {
    const kp = ed25519Generate()
    const sig = ed25519Sign(kp.privRaw, Buffer.from('a'))
    expect(ed25519Verify(kp.pubRaw, Buffer.from('b'), sig)).toBe(false)
  })

  test('returns false for a malformed public key', () => {
    expect(ed25519Verify(Buffer.alloc(7), Buffer.from('x'), Buffer.alloc(64))).toBe(false)
  })
})

describe('hkdfSha512', () => {
  test('derives 32 bytes by default from string salt and info', () => {
    const out = hkdfSha512(Buffer.from('ikm'), 'salt', 'info')
    expect(out.length).toBe(32)
  })

  test('accepts Buffer salt and info and a custom length', () => {
    const out = hkdfSha512(Buffer.from('ikm'), Buffer.from('salt'), Buffer.from('info'), 64)
    expect(out.length).toBe(64)
    expect(out.subarray(0, 32).equals(hkdfSha512(Buffer.from('ikm'), 'salt', 'info'))).toBe(true)
  })

  test('different info yields different keys', () => {
    const ikm = Buffer.alloc(32, 5)
    expect(hkdfSha512(ikm, 's', 'a').equals(hkdfSha512(ikm, 's', 'b'))).toBe(false)
  })
})

describe('chacha20-poly1305', () => {
  const key = Buffer.alloc(32, 0x42)

  test('seal/open round trip without aad', () => {
    const ct = chachaSeal(key, nonce64(0n), Buffer.from('secret'))
    expect(ct.length).toBe(6 + 16)
    expect(chachaOpen(key, nonce64(0n), ct).toString()).toBe('secret')
  })

  test('seal/open round trip with aad', () => {
    const aad = Buffer.from([0x06, 0x00])
    const ct = chachaSeal(key, nonce64(1n), Buffer.from('payload'), aad)
    expect(chachaOpen(key, nonce64(1n), ct, aad).toString()).toBe('payload')
  })

  test('open throws on a tampered ciphertext', () => {
    const ct = chachaSeal(key, nonce64(2n), Buffer.from('x'))
    ct[0] ^= 0xff
    expect(() => chachaOpen(key, nonce64(2n), ct)).toThrow('authentication failed')
  })

  test('open throws when the aad does not match', () => {
    const ct = chachaSeal(key, nonce64(3n), Buffer.from('x'), Buffer.from('aad'))
    expect(() => chachaOpen(key, nonce64(3n), ct, Buffer.from('bad'))).toThrow()
  })
})

describe('nonces', () => {
  test('nonce64 places the counter little-endian after 4 zero bytes', () => {
    const n = nonce64(0x0102030405060708n)
    expect(n.length).toBe(12)
    expect(n.subarray(0, 4).equals(Buffer.alloc(4))).toBe(true)
    expect(n.subarray(4).equals(Buffer.from('0807060504030201', 'hex'))).toBe(true)
  })

  test('nonceLabel places the ascii label after 4 zero bytes', () => {
    const n = nonceLabel('PV-Msg02')
    expect(n.length).toBe(12)
    expect(n.subarray(0, 4).equals(Buffer.alloc(4))).toBe(true)
    expect(n.subarray(4).toString('ascii')).toBe('PV-Msg02')
  })
})

describe('hashes and aes-ctr', () => {
  test('sha1 matches the known abc digest across parts', () => {
    const expected = 'a9993e364706816aba3e25717850c26c9cd0d89d'
    expect(sha1(Buffer.from('abc')).toString('hex')).toBe(expected)
    expect(sha1(Buffer.from('a'), Buffer.from('bc')).toString('hex')).toBe(expected)
  })

  test('sha256 matches the known abc digest', () => {
    expect(sha256(Buffer.from('abc')).toString('hex')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  test('aesCtr128 matches the NIST SP 800-38A vector and round-trips', () => {
    const key = Buffer.from('2b7e151628aed2a6abf7158809cf4f3c', 'hex')
    const iv = Buffer.from('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff', 'hex')
    const pt = Buffer.from('6bc1bee22e409f96e93d7e117393172a', 'hex')
    const ct = aesCtr128(key, iv, pt)
    expect(ct.toString('hex')).toBe('874d6191b620e3261bef6864990db6ce')
    expect(aesCtr128(key, iv, ct).equals(pt)).toBe(true)
  })
})
