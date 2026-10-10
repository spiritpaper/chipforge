//! Writes a small two-pattern .chipsong for tests: a note on every channel.
//! cargo run -p chipforge --example write_test_song -- out.chipsong

use chipcore::tracker::{Cell, Instrument, Macro, Song};

fn main() -> std::io::Result<()> {
    let path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "test.chipsong".into());
    let mut song = Song {
        pattern_length: 4,
        ..Song::default()
    };
    song.instruments = vec![Instrument {
        volume: Macro::new(&[15, 12, 9]),
        ..Default::default()
    }];
    let mut pattern = vec![[Cell::EMPTY; 4]; 4];
    for (ch, note) in [72, 64, 45, 8].into_iter().enumerate() {
        pattern[0][ch] = Cell::note(note, 0);
    }
    song.patterns = vec![pattern.clone(), pattern];
    song.order = vec![0, 1];
    std::fs::write(&path, song.encode())
}
