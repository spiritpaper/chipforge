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
