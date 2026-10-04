//! Renders an encoded song (`.cfs`, as exported by the web app) once through to a
//! 16-bit mono WAV, printing where the loop starts.
//!
//! cargo run --release --example render_song -- song.cfs song.wav

use chipcore::chip::Chip;
use chipcore::tracker::Song;
use std::io::Write;

const SAMPLE_RATE: u32 = 48_000;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let (Some(input), output) = (args.next(), args.next()) else {
        return Err("usage: render_song <song.cfs> [out.wav]".into());
    };
    let output = output.unwrap_or_else(|| "song.wav".into());
    let song = Song::decode(&std::fs::read(&input)?).map_err(|e| format!("{input}: {e:?}"))?;
    let rendered = Chip::render_song(song, SAMPLE_RATE as f32);

    let pcm: Vec<u8> = rendered
        .samples
        .iter()
        .flat_map(|&s| ((s * i16::MAX as f32) as i16).to_le_bytes())
        .collect();
    let mut f = std::fs::File::create(&output)?;
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

    let secs = |n: usize| n as f32 / SAMPLE_RATE as f32;
    println!(
        "wrote {output}: {:.2} s, loop starts at {:.2} s{}",
        secs(rendered.samples.len()),
        secs(rendered.loop_start),
        if rendered.looped {
            ""
        } else {
            " (song did not loop within the time limit)"
        }
    );
    Ok(())
}
