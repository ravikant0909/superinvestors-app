import convictionIndex from '../../conviction_data/index.json'

export interface ConvictionIndexBet {
  investor_name: string
  investor_slug: string
  investor_key?: string | null
  firm_name?: string
  ticker: string
  company_name: string
  weight_pct: number | null
  value_millions?: number
  thesis_headline?: string
  slug: string
  detail_path?: string
}

export interface ConvictionIndexPayload {
  bets: ConvictionIndexBet[]
}

const payload = convictionIndex as ConvictionIndexPayload

export const CONVICTION_SUMMARIES = payload.bets

export const CONVICTION_LOOKUP = new Set(
  payload.bets.map((bet) => `${bet.investor_slug}_${bet.ticker}`),
)

export const CONVICTION_PAGE_SLUGS = payload.bets.map((bet) => bet.slug)

export const CONVICTION_SUMMARY_BY_SLUG = new Map(
  payload.bets.map((bet) => [bet.slug, bet] as const),
)

export function getConvictionHref(investorSlug: string, ticker: string | null | undefined): string | null {
  if (!ticker) {
    return null
  }

  const key = `${investorSlug}_${ticker}`
  if (!CONVICTION_LOOKUP.has(key)) {
    return null
  }

  return `/convictions/${investorSlug}-${ticker}`
}
