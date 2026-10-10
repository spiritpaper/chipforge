//! Converts a .chipsong to a VGM file (NES APU register log).
//!
//! cargo run -p chipcore --example export_vgm -- song.chipsong song.vgm "Title"

use chipcore::tracker::Song;
use chipcore::vgm::render_vgm;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let (Some(input), Some(output)) = (args.next(), args.next()) else {
        return Err("usage: export_vgm <song.chipsong> <out.vgm> [title]".into());
    };
    let title = args.next().unwrap_or_default();
    let song = Song::decode(&std::fs::read(&input)?).map_err(|e| format!("{input}: {e:?}"))?;
    std::fs::write(&output, render_vgm(song, &title))?;
    println!("wrote {output}");
    Ok(())
}
