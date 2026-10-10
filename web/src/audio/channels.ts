import type { ChipKind } from '../song/model'

export interface ChannelInfo {
  name: string
  role: string
  /** CSS custom property holding the channel color. */
  color: string
  key: string
}

/** NES (2A03) channel order, matching chipcore. */
export const CHANNELS: ChannelInfo[] = [
  { name: 'Pulse 1', role: 'Lead', color: 'var(--pulse1)', key: '1' },
  { name: 'Pulse 2', role: 'Harmony', color: 'var(--pulse2)', key: '2' },
  { name: 'Triangle', role: 'Bass', color: 'var(--tri)', key: '3' },
  { name: 'Noise', role: 'Drums', color: 'var(--noise)', key: '4' },
]

/** Game Boy (DMG) channels: the same roles, with the wave channel in the triangle's place. */
export const GB_CHANNELS: ChannelInfo[] = CHANNELS.map((c, i) => (i === 2 ? { ...c, name: 'Wave' } : c))

export const channelsFor = (chip: ChipKind | undefined) => (chip === 'gb' ? GB_CHANNELS : CHANNELS)
