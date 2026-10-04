//! Renders one loop of the demo song to a 16-bit mono WAV.
//!
//! cargo run --release --example render_demo -- demo.wav

use chipcore::chip::Chip;
use chipcore::song::demo;
use std::io::Write;

const SAMPLE_RATE: u32 = 48_000;

fn main() -> std::io::Result<()> {
    let path = std::env::args().nth(1).unwrap_or_else(|| "demo.wav".into());
    let song = demo();
    let seconds = song.len() as f32 * 60.0 / (song.bpm * song.steps_per_beat as f32);

    let mut chip = Chip::new(SAMPLE_RATE as f32);
    chip.load_song(song);
    chip.play();

    let total = (seconds * SAMPLE_RATE as f32) as usize;
    let mut pcm = Vec::with_capacity(total * 2);
    let mut done = 0;
    while done < total {
        let n = (total - done).min(1024);
        for &s in chip.render(n) {
            pcm.extend_from_slice(&((s * i16::MAX as f32) as i16).to_le_bytes());
        }
        done += n;
    }

    let mut f = std::fs::File::create(&path)?;
    f.write_all(b"RIFF")?;
    f.write_all(&(36 + pcm.len() as u32).to_le_bytes())?;
    f.write_all(b"WAVEfmt ")?;
    f.write_all(&16u32.to_le_bytes())?;
    f.write_all(&1u16.to_le_bytes())?; // PCM
    f.write_all(&1u16.to_le_bytes())?; // mono
    f.write_all(&SAMPLE_RATE.to_le_bytes())?;
    f.write_all(&(SAMPLE_RATE * 2).to_le_bytes())?;
    f.write_all(&2u16.to_le_bytes())?;
    f.write_all(&16u16.to_le_bytes())?;
    f.write_all(b"data")?;
    f.write_all(&(pcm.len() as u32).to_le_bytes())?;
    f.write_all(&pcm)?;
    println!("wrote {path} ({seconds:.2} s)");
    Ok(())
}
