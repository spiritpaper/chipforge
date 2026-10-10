// Plan data from the server, and how it's shown.

export interface PlanInfo {
  id: string
  name: string
  maxSongs: number | null
  share: boolean
  gpuConversion: boolean
  badge: boolean
  prices: Partial<Record<'month' | 'year', number>>
  until?: string | null
}

export interface BillingInfo {
  enabled: boolean
  currency: string
  checkout: boolean
  plans: PlanInfo[]
}

export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount.toLocaleString('en')} ${currency}`
  }
}

/** What a plan includes, in plain words. */
export function planFeatures(p: PlanInfo): string[] {
  const out = [p.maxSongs === null ? 'Sync unlimited songs' : `Sync up to ${p.maxSongs} songs`, 'Sync your sound library']
  if (p.share) out.push('Share songs by link')
  if (p.gpuConversion) out.push('Server conversion on a GPU (coming soon)')
  if (p.badge) out.push('Supporter badge')
  return out
}

/** Result messages for ?payment=… after returning from the gateway (ok null: neutral). */
export const PAYMENT_RESULTS: Record<string, { ok: boolean | null; text: string }> = {
  ok: { ok: true, text: 'Payment received. Thank you! Your plan is active.' },
  cancelled: { ok: null, text: 'Payment cancelled. Nothing was charged.' },
  failed: { ok: false, text: "The payment didn't go through. Nothing was charged." },
  error: { ok: false, text: "We couldn't confirm the payment with the gateway yet. If you were charged, it will be applied; contact support if it isn't within a day." },
  unknown: { ok: false, text: "We couldn't find that payment. If you were charged, contact support." },
}
