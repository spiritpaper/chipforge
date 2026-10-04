/** Effective mute per channel: solo overrides individual mutes. */
export function soloMask(muted: boolean[], soloed: number | null): boolean[] {
  return soloed === null ? [...muted] : muted.map((_, ch) => ch !== soloed)
}
