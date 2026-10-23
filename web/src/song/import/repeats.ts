// Turns repeat signs into the order bars are actually played, for MusicXML and ABC.

export interface BarRepeats {
  /** A start-repeat sign at the start of this bar. */
  forward?: boolean
  /** An end-repeat sign at the end of this bar: how many times the section plays in all (usually 2). */
  backward?: number
  /** The passes this bar belongs to, when it's under a "1." / "2." ending. */
  endings?: number[]
}

/** Bar indexes in playing order. Unclosed and nested repeats play as written. */
export function playOrder(bars: BarRepeats[], limit = 10_000): number[] {
  const out: number[] = []
  let start = 0
  let pass = 1
  // The end-repeat whose section was just finished, so its endings play for that pass.
  let finishedAt = -1
  let i = 0
  while (i < bars.length && out.length < limit) {
    const bar = bars[i]
    if (bar.forward && i !== start) {
      start = i
      pass = 1
    } else if (bar.forward) start = i
    if (bar.endings) {
      if (!bar.endings.includes(pass)) {
        i++
        continue
      }
    } else if (finishedAt >= 0 && i > finishedAt) {
      // Past the last ending: the next repeat starts counting again.
      pass = 1
      finishedAt = -1
      start = i
    }
    out.push(i)
    const times = bar.backward ?? 0
    if (times > 1 && i !== finishedAt) {
      if (pass < times) {
        pass++
        i = start
        continue
      }
      finishedAt = i
    }
    i++
  }
  return out
}
