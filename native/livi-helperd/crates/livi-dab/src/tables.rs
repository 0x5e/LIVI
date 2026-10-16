// Transmission mode I constants, the phase reference symbol and the frequency
// interleaver.

use rustfft::num_complex::Complex32;

pub const SAMPLE_RATE: u32 = 2_048_000;
pub const TU: usize = 2048;
pub const TG: usize = 504;
pub const TS: usize = TU + TG;
pub const TNULL: usize = 2656;
pub const FRAME: usize = 196_608;
pub const SYMBOLS: usize = 76;
pub const CARRIERS: usize = 1536;
pub const BITS_PER_SYMBOL: usize = 2 * CARRIERS;
pub const FIC_SYMBOLS: usize = 3;
pub const MSC_SYMBOLS: usize = SYMBOLS - 1 - FIC_SYMBOLS;
pub const CIF_BITS: usize = 55_296;

const H: [[u8; 32]; 4] = [
    [
        0, 2, 0, 0, 0, 0, 1, 1, 2, 0, 0, 0, 2, 2, 1, 1, 0, 2, 0, 0, 0, 0, 1, 1, 2, 0, 0, 0, 2, 2,
        1, 1,
    ],
    [
        0, 3, 2, 3, 0, 1, 3, 0, 2, 1, 2, 3, 2, 3, 3, 0, 0, 3, 2, 3, 0, 1, 3, 0, 2, 1, 2, 3, 2, 3,
        3, 0,
    ],
    [
        0, 0, 0, 2, 0, 2, 1, 3, 2, 2, 0, 2, 2, 0, 1, 3, 0, 0, 0, 2, 0, 2, 1, 3, 2, 2, 0, 2, 2, 0,
        1, 3,
    ],
    [
        0, 1, 2, 1, 0, 3, 3, 2, 2, 3, 2, 1, 2, 1, 3, 2, 0, 1, 2, 1, 0, 3, 3, 2, 2, 3, 2, 1, 2, 1,
        3, 2,
    ],
];

/// (i, n) for each run of 32 carriers from k = -768 upwards, zero skipped.
const PRS_BLOCKS: [(u8, u8); 48] = [
    (0, 1),
    (1, 2),
    (2, 0),
    (3, 1),
    (0, 3),
    (1, 2),
    (2, 2),
    (3, 3),
    (0, 2),
    (1, 1),
    (2, 2),
    (3, 3),
    (0, 1),
    (1, 2),
    (2, 3),
    (3, 3),
    (0, 2),
    (1, 2),
    (2, 2),
    (3, 1),
    (0, 1),
    (1, 3),
    (2, 1),
    (3, 2),
    (0, 3),
    (3, 1),
    (2, 1),
    (1, 1),
    (0, 2),
    (3, 2),
    (2, 1),
    (1, 0),
    (0, 2),
    (3, 2),
    (2, 3),
    (1, 3),
    (0, 0),
    (3, 2),
    (2, 1),
    (1, 3),
    (0, 3),
    (3, 3),
    (2, 3),
    (1, 0),
    (0, 3),
    (3, 0),
    (2, 1),
    (1, 1),
];

/// FFT bin of carrier k, k in -768..=768 without 0.
pub fn bin(k: i32) -> usize {
    k.rem_euclid(TU as i32) as usize
}

/// Carrier indices k in ascending order.
fn carriers() -> impl Iterator<Item = i32> {
    (-768..=768).filter(|&k| k != 0)
}

/// The phase reference symbol as FFT bins, unit magnitude on the carriers.
pub fn phase_reference() -> Vec<Complex32> {
    let mut out = vec![Complex32::new(0.0, 0.0); TU];
    for (pos, k) in carriers().enumerate() {
        let (i, n) = PRS_BLOCKS[pos / 32];
        let phi = std::f32::consts::FRAC_PI_2 * (H[i as usize][pos % 32] + n) as f32;
        out[bin(k)] = Complex32::from_polar(1.0, phi);
    }
    out
}

/// Carrier k for each QPSK symbol index n of an OFDM symbol.
pub fn frequency_map() -> Vec<i32> {
    let mut out = Vec::with_capacity(CARRIERS);
    let mut pi = 0usize;
    for _ in 0..TU {
        pi = (13 * pi + 511) % TU;
        if (256..=1792).contains(&pi) && pi != 1024 {
            out.push(pi as i32 - 1024);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frequency_map_is_a_permutation_of_the_carriers() {
        let mut m = frequency_map();
        assert_eq!(m.len(), CARRIERS);
        m.sort_unstable();
        assert!(m.iter().copied().eq(carriers()));
    }

    #[test]
    fn frequency_map_starts_like_the_interleaver() {
        // The first value 13 * 0 + 511 = 511 is carrier -513.
        let m = frequency_map();
        assert_eq!(m[0], -513);
    }

    #[test]
    fn phase_reference_covers_carriers_only() {
        let p = phase_reference();
        assert_eq!(p.iter().filter(|c| c.norm_sqr() > 0.5).count(), CARRIERS);
        assert_eq!(p[0].norm_sqr(), 0.0);
    }
}
