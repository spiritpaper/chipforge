// Ready-made instruments used by templates and offered when adding an instrument.

import { emptyMacro, macro, type Instrument } from './model'

const inst = (name: string, parts: Partial<Omit<Instrument, 'name'>>): Instrument => ({
  name,
  volume: emptyMacro(),
  duty: emptyMacro(),
  pitch: emptyMacro(),
  arpeggio: emptyMacro(),
  ...parts,
})

export const PRESET_INSTRUMENTS = {
  lead: inst('Lead', { volume: macro([13, 12, 11, 10, 10, 9, 9, 8, 6, 3, 0], null, 7), duty: macro([1]) }),
  softLead: inst('Soft lead', { volume: macro([9, 10, 10, 9, 9, 8, 7, 5, 2, 0], null, 6), duty: macro([2]) }),
  pluck: inst('Pluck', { volume: macro([12, 9, 7, 5, 4, 3, 2, 1, 0]), duty: macro([0]) }),
  echo: inst('Echo arp', { volume: macro([7, 6, 5, 4, 3, 2, 1]), duty: macro([0]) }),
  vibratoLead: inst('Vibrato lead', {
    volume: macro([13, 12, 11, 10, 9, 0], null, 4),
    duty: macro([2, 2, 1]),
    pitch: macro([0, 0, 0, 0, 0, 0, 1, 1, -1, -1, -1, -1, 1, 1], 6),
  }),
  bass: inst('Triangle bass', { volume: macro([15]) }),
  kick: inst('Kick', { volume: macro([15, 13, 10, 7, 4, 2, 0]), arpeggio: macro([0, -2, -4, -6, -8]) }),
  snare: inst('Snare', { volume: macro([14, 12, 9, 7, 5, 3, 2, 1, 0]) }),
  hat: inst('Hi-hat', { volume: macro([8, 4, 2, 0]) }),
  openHat: inst('Open hat', { volume: macro([7, 6, 5, 4, 3, 2, 1, 0]), duty: macro([1]) }),
} satisfies Record<string, Instrument>
