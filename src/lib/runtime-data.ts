export interface CurrentPriceData {
  price: number
  prev_close: number
}

export interface QuarterRangeData {
  min: number
  max: number
  avg: number
}

export interface AllPrices {
  fetched_at: string
  current_prices: Record<string, CurrentPriceData>
  quarter_ranges: Record<string, Record<string, QuarterRangeData>>
}

export interface NonUsPosition {
  company: string
  country: string
  estimated_value_millions: number
}

export interface PortfolioAdjustment {
  estimated_total_aum_millions: number
  us_13f_value_millions: number
  non_us_pct_estimate: number
  non_us_notes: string
  known_non_us_positions: NonUsPosition[]
  confidence: string
  sources: string[]
  last_updated: string
}

export function getCurrentPriceFromPayload(
  prices: AllPrices | null | undefined,
  ticker: string | null | undefined,
): CurrentPriceData | null {
  if (!prices || !ticker) {
    return null
  }

  return prices.current_prices[ticker] || null
}

export function getAdjustedWeightFromPayload(
  adjustments: Record<string, PortfolioAdjustment> | null | undefined,
  investorKey: string | null | undefined,
  usPct: number,
): { adjusted_pct: number | null; has_adjustment: boolean; confidence: string | null } {
  if (!adjustments || !investorKey) {
    return { adjusted_pct: null, has_adjustment: false, confidence: null }
  }

  const adjustment = adjustments[investorKey]
  if (!adjustment || adjustment.non_us_pct_estimate === 0) {
    return { adjusted_pct: null, has_adjustment: false, confidence: null }
  }

  const usPortfolioFraction = 1 - adjustment.non_us_pct_estimate / 100
  const adjustedPct = usPct * usPortfolioFraction

  return {
    adjusted_pct: Math.round(adjustedPct * 10) / 10,
    has_adjustment: true,
    confidence: adjustment.confidence,
  }
}
