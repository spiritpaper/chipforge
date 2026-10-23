//! The classic synth against jsfxr itself: tests/jsfxr_parity.txt holds sounds jsfxr
//! rendered (tools/jsfxr-parity/make-fixture.mjs), and every stored sample must match.

use chipcore::sfxr::{PARAM_COUNT, SfxrParams, render_native};

#[test]
fn sounds_match_jsfxr_sample_for_sample() {
    let text = include_str!("jsfxr_parity.txt");
    let mut lines = text.lines().filter(|l| !l.starts_with('#'));
    let mut checked = 0;
    while let Some(head) = lines.next() {
        let head: Vec<&str> = head.split(' ').collect();
        let (preset, length, every): (&str, usize, usize) =
            (head[1], head[2].parse().unwrap(), head[3].parse().unwrap());
        let values: Vec<f32> = lines
            .next()
            .unwrap()
            .split(' ')
            .map(|v| v.parse().unwrap())
            .collect();
        let want: Vec<f64> = lines
            .next()
            .unwrap()
            .split(' ')
            .map(|v| v.parse().unwrap())
            .collect();
        assert_eq!(values.len(), PARAM_COUNT);
        // jsfxr's values exactly as stored, without clamping.
        let mut params = SfxrParams::default();
        params.0.copy_from_slice(&values);
        let got = render_native(&params);
        assert_eq!(got.len(), length, "{preset}: length");
        for (k, w) in want.iter().enumerate() {
            let g = got[k * every] as f64;
            assert!(
                (g - w).abs() < 1e-6,
                "{preset}: sample {} is {g}, jsfxr {w}",
                k * every
            );
        }
        checked += 1;
    }
    assert!(checked >= 10, "only {checked} sounds in the fixture");
}
