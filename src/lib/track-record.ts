export interface TrackRecordApiTimelineEntry {
  year: number
  quarter: number
  report_date: string
  shares: number
  value: number
  pct_of_portfolio: number
  position_rank: number
}

export interface TrackRecordApiGroup {
  ticker: string | null
  name: string
  cusip: string
  security_slug: string
  timeline: TrackRecordApiTimelineEntry[]
}

export interface RuntimePriceMap {
  [symbol: string]: number | undefined
}

export interface RuntimeTimelineEntry {
  quarter: string
  shares: number
  value_thousands: number
  weight_pct: number
  position_rank: number
  action: 'NEW' | 'INCREASED' | 'DECREASED' | 'HELD'
  share_delta: number
  estimated_price: number | null
  estimated_tx_cost: number | null
}

export interface RuntimeInvestmentRecord {
  ticker: string
  company_name: string
  cusip: string
  first_seen_quarter: string
  last_seen_quarter: string
  holding_period_quarters: number
  is_current: boolean
  current_price: number | null
  current_value_thousands: number | null
  current_weight_pct: number | null
  peak_value_thousands: number
  peak_weight_pct: number
  estimated_entry_price: number | null
  weighted_avg_entry_price: number | null
  exit_price: number | null
  price_return_pct: number | null
  annualized_return_pct: number | null
  timeline: RuntimeTimelineEntry[]
}

function quarterKey(year: number, quarter: number): string {
  return `${year}-Q${quarter}`
}

function quarterIndex(quarter: string): number {
  const [year, q] = quarter.split('-Q')
  return parseInt(year, 10) * 4 + parseInt(q, 10)
}

function estimatePrice(valueThousands: number, shares: number): number | null {
  if (!shares || !valueThousands) {
    return null
  }
  return (valueThousands * 1000) / shares
}

function round(value: number | null, decimals: number = 2): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null
  }
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function buildRuntimeTrackRecords(
  groups: TrackRecordApiGroup[],
  currentPrices: RuntimePriceMap,
): RuntimeInvestmentRecord[] {
  const latestQuarterIndex = groups.reduce((max, group) => {
    const last = group.timeline[group.timeline.length - 1]
    if (!last) {
      return max
    }
    return Math.max(max, quarterIndex(quarterKey(last.year, last.quarter)))
  }, 0)

  const records = groups.map((group) => {
    const timeline = [...group.timeline].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year
      return a.quarter - b.quarter
    })

    const runtimeTimeline: RuntimeTimelineEntry[] = []
    let acquiredShares = 0
    let acquiredCost = 0

    for (let i = 0; i < timeline.length; i += 1) {
      const current = timeline[i]
      const previous = timeline[i - 1]
      const sharesDelta = previous ? current.shares - previous.shares : current.shares
      const action: RuntimeTimelineEntry['action'] =
        !previous ? 'NEW' :
        current.shares > previous.shares ? 'INCREASED' :
        current.shares < previous.shares ? 'DECREASED' :
        'HELD'

      const price = estimatePrice(current.value, current.shares)
      const txCost = price != null && sharesDelta !== 0 ? Math.abs(sharesDelta) * price : null

      if (action === 'NEW' || action === 'INCREASED') {
        acquiredShares += Math.max(sharesDelta, 0)
        acquiredCost += Math.max(sharesDelta, 0) * (price ?? 0)
      }

      runtimeTimeline.push({
        quarter: quarterKey(current.year, current.quarter),
        shares: current.shares,
        value_thousands: current.value,
        weight_pct: current.pct_of_portfolio,
        position_rank: current.position_rank,
        action,
        share_delta: sharesDelta,
        estimated_price: round(price, 2),
        estimated_tx_cost: round(txCost, 0),
      })
    }

    const first = runtimeTimeline[0]
    const last = runtimeTimeline[runtimeTimeline.length - 1]
    const lastQuarter = last?.quarter ?? ''
    const isCurrent = lastQuarter ? quarterIndex(lastQuarter) === latestQuarterIndex : false
    const currentPrice = group.ticker ? currentPrices[group.ticker] ?? null : null
    const endPrice = isCurrent ? currentPrice ?? last?.estimated_price ?? null : last?.estimated_price ?? null
    const entryPrice = first?.estimated_price ?? null
    const weightedAvgEntryPrice = acquiredShares > 0 ? round(acquiredCost / acquiredShares, 2) : null
    const effectiveEntryPrice = weightedAvgEntryPrice ?? entryPrice

    let priceReturnPct: number | null = null
    let annualizedReturnPct: number | null = null
    if (effectiveEntryPrice != null && endPrice != null && effectiveEntryPrice > 0) {
      priceReturnPct = round(((endPrice - effectiveEntryPrice) / effectiveEntryPrice) * 100, 1)
      const quartersHeld = Math.max(quarterIndex(lastQuarter) - quarterIndex(first.quarter) + 1, 1)
      const yearsHeld = quartersHeld / 4
      if (yearsHeld > 0 && endPrice > 0) {
        annualizedReturnPct = round((Math.pow(endPrice / effectiveEntryPrice, 1 / yearsHeld) - 1) * 100, 1)
      }
    }

    return {
      ticker: group.ticker ?? group.cusip,
      company_name: group.name,
      cusip: group.cusip,
      first_seen_quarter: first?.quarter ?? '',
      last_seen_quarter: lastQuarter,
      holding_period_quarters: first && last ? quarterIndex(last.quarter) - quarterIndex(first.quarter) + 1 : 0,
      is_current: isCurrent,
      current_price: currentPrice ?? null,
      current_value_thousands: isCurrent ? last?.value_thousands ?? null : null,
      current_weight_pct: isCurrent ? last?.weight_pct ?? null : null,
      peak_value_thousands: Math.max(...runtimeTimeline.map((entry) => entry.value_thousands), 0),
      peak_weight_pct: Math.max(...runtimeTimeline.map((entry) => entry.weight_pct), 0),
      estimated_entry_price: entryPrice,
      weighted_avg_entry_price: weightedAvgEntryPrice,
      exit_price: isCurrent ? null : last?.estimated_price ?? null,
      price_return_pct: priceReturnPct,
      annualized_return_pct: annualizedReturnPct,
      timeline: runtimeTimeline,
    }
  })

  return records.sort((a, b) => {
    if (a.is_current !== b.is_current) {
      return a.is_current ? -1 : 1
    }
    const aValue = a.current_value_thousands ?? a.peak_value_thousands
    const bValue = b.current_value_thousands ?? b.peak_value_thousands
    return bValue - aValue
  })
}
