// The song Sound check plays.

import { firstLight } from '../song/templates'
import type { Song } from '../song/model'

class Demo {
  song = $state.raw<Song>(firstLight())

  setBpm(bpm: number) {
    if (!Number.isFinite(bpm)) return
    this.song = { ...this.song, bpm: Math.round(Math.min(300, Math.max(30, bpm))) }
  }
}

export const demo = new Demo()
