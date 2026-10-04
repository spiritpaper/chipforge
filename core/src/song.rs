//! A minimal step-sequenced song: one track per channel, one cell per 16th note.
//!
//! Phase 0 only needs enough to play the built-in demo; Phase 2 replaces this with
//! patterns, instruments and effects.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Drum {
    Kick,
    Snare,
    Hat,
}

impl Drum {
    /// (noise period index, short mode, volume, decay per second)
    pub fn voice(self) -> (u8, bool, u8, f32) {
        match self {
            Drum::Kick => (13, false, 15, 150.0),
            Drum::Snare => (7, false, 13, 70.0),
            Drum::Hat => (1, false, 8, 220.0),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cell {
    /// Keep whatever is sounding.
    Hold,
    Off,
    Note(u8),
    Drum(Drum),
}

#[derive(Clone, Debug)]
pub struct Track {
    pub cells: Vec<Cell>,
    pub volume: u8,
    pub decay_per_sec: f32,
    /// Pulse duty index; ignored by other channels.
    pub duty: u8,
}

#[derive(Clone, Debug)]
pub struct Song {
    pub bpm: f32,
    pub steps_per_beat: u32,
    /// Pulse 1, Pulse 2, Triangle, Noise.
    pub tracks: [Track; 4],
}

impl Song {
    pub fn len(&self) -> usize {
        self.tracks[0].cells.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Parse a note name such as `C4`, `F#3` or `Bb5` into a MIDI note number.
pub fn parse_note(token: &str) -> Result<u8, String> {
    let mut chars = token.chars();
    let letter = chars.next().ok_or("empty note")?;
    let base: i32 = match letter.to_ascii_uppercase() {
        'C' => 0,
        'D' => 2,
        'E' => 4,
        'F' => 5,
        'G' => 7,
        'A' => 9,
        'B' => 11,
        _ => return Err(format!("unknown note letter in {token:?}")),
    };
    let rest = chars.as_str();
    let (accidental, octave) = match rest.chars().next() {
        Some('#') => (1, &rest[1..]),
        Some('b') => (-1, &rest[1..]),
        _ => (0, rest),
    };
    let octave: i32 = octave
        .parse()
        .map_err(|_| format!("bad octave in {token:?}"))?;
    let midi = (octave + 1) * 12 + base + accidental;
    u8::try_from(midi)
        .ok()
        .filter(|&m| m <= 127)
        .ok_or_else(|| format!("note out of range: {token:?}"))
}

/// Parse whitespace-separated cells: `.` hold, `-` off, `k`/`s`/`h` drums, or a note.
pub fn parse_track(src: &str) -> Result<Vec<Cell>, String> {
    src.split_whitespace()
        .map(|tok| match tok {
            "." => Ok(Cell::Hold),
            "-" => Ok(Cell::Off),
            "k" => Ok(Cell::Drum(Drum::Kick)),
            "s" => Ok(Cell::Drum(Drum::Snare)),
            "h" => Ok(Cell::Drum(Drum::Hat)),
            note => parse_note(note).map(Cell::Note),
        })
        .collect()
}

/// "First Light": an original four-bar loop in A minor (Am – F – C – G).
pub fn demo() -> Song {
    let lead = "
        A4 .  C5 .  E5 .  A5 .  G5 .  E5 .  C5 .  D5 .
        F5 .  .  .  E5 .  C5 .  A4 .  .  .  C5 .  .  -
        E5 .  G5 .  C6 .  .  .  B5 .  G5 .  E5 .  G5 .
        D5 .  .  .  B4 .  D5 .  G5 .  .  .  -  .  .  .";
    let harmony = "
        A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4
        F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3
        C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4
        G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3";
    let bass = "
        A2 . A3 . A2 . A3 . A2 . A3 . A2 . E3 .
        F2 . F3 . F2 . F3 . F2 . F3 . F2 . C3 .
        C3 . C4 . C3 . C4 . C3 . C4 . C3 . G3 .
        G2 . G3 . G2 . G3 . G2 . G3 . B2 . D3 .";
    let drums = "
        k . h . s . h . k k h . s . h h
        k . h . s . h . k k h . s . h h
        k . h . s . h . k k h . s . h h
        k . h . s . h . k . s s s s s s";

    let track = |src: &str, volume, decay_per_sec, duty| Track {
        cells: parse_track(src).expect("demo song is valid"),
        volume,
        decay_per_sec,
        duty,
    };
    Song {
        bpm: 140.0,
        steps_per_beat: 4,
        tracks: [
            track(lead, 12, 6.0, 1),
            track(harmony, 6, 25.0, 0),
            track(bass, 15, 0.0, 0),
            track(drums, 15, 0.0, 0),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_note_names() {
        assert_eq!(parse_note("A4"), Ok(69));
        assert_eq!(parse_note("C4"), Ok(60));
        assert_eq!(parse_note("F#3"), Ok(54));
        assert_eq!(parse_note("Bb2"), Ok(46));
        assert_eq!(parse_note("C-1"), Ok(0));
    }

    #[test]
    fn rejects_bad_tokens() {
        assert!(parse_note("H4").is_err());
        assert!(parse_note("C").is_err());
        assert!(parse_note("G#9").is_err());
        assert!(parse_track("C4 ? D4").is_err());
    }

    #[test]
    fn demo_tracks_have_equal_length() {
        let song = demo();
        assert_eq!(song.len(), 64);
        assert!(song.tracks.iter().all(|t| t.cells.len() == song.len()));
    }
}
