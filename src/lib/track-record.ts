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
  prior_stints: number
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
    // Running-average cost basis of the shares CURRENTLY HELD. Sells reduce it at
    // the running average (so the basis reflects shares still owned, not every
    // share ever bought). A >1-quarter gap in the 13F timeline = a full exit and
    // re-entry: reset the basis and start a fresh holding segment.
    let heldShares = 0
    let heldCost = 0
    let segmentFirstQuarter = quarterKey(timeline[0]?.year ?? 0, timeline[0]?.quarter ?? 1)
    let priorStints = 0

    for (let i = 0; i < timeline.length; i += 1) {
      const current = timeline[i]
      const previous = timeline[i - 1]
      const curIdx = quarterIndex(quarterKey(current.year, current.quarter))
      const prevIdx = previous ? quarterIndex(quarterKey(previous.year, previous.quarter)) : null
      const isReopen = prevIdx != null && curIdx - prevIdx > 1
      const price = estimatePrice(current.value, current.shares)

      let action: RuntimeTimelineEntry['action']
      let sharesDelta: number
      if (!previous || isReopen) {
        action = 'NEW'
        sharesDelta = current.shares
        if (isReopen) priorStints += 1
        heldShares = current.shares
        heldCost = current.shares * (price ?? 0)
        segmentFirstQuarter = quarterKey(current.year, current.quarter)
      } else {
        sharesDelta = current.shares - previous.shares
        if (sharesDelta > 0) {
          action = 'INCREASED'
          heldShares += sharesDelta
          heldCost += sharesDelta * (price ?? 0)
        } else if (sharesDelta < 0) {
          action = 'DECREASED'
          const avg = heldShares > 0 ? heldCost / heldShares : 0
          heldCost = Math.max(0, heldCost + sharesDelta * avg)
          heldShares = Math.max(0, heldShares + sharesDelta)
        } else {
          action = 'HELD'
        }
      }

      const txCost = price != null && sharesDelta !== 0 ? Math.abs(sharesDelta) * price : null
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
    // entry = the active segment's opening-quarter price; avg cost = running held-share basis
    const segmentEntryPrice = runtimeTimeline.find((t) => t.quarter === segmentFirstQuarter)?.estimated_price ?? null
    const avgCost = heldShares > 0 ? round(heldCost / heldShares, 2) : segmentEntryPrice
    const effectiveEntryPrice = avgCost ?? segmentEntryPrice
    const segmentQuartersHeld = Math.max(quarterIndex(lastQuarter) - quarterIndex(segmentFirstQuarter) + 1, 1)

    let priceReturnPct: number | null = null
    let annualizedReturnPct: number | null = null
    if (effectiveEntryPrice != null && endPrice != null && effectiveEntryPrice > 0) {
      priceReturnPct = round(((endPrice - effectiveEntryPrice) / effectiveEntryPrice) * 100, 1)
      const yearsHeld = segmentQuartersHeld / 4
      if (yearsHeld > 0 && endPrice > 0) {
        annualizedReturnPct = round((Math.pow(endPrice / effectiveEntryPrice, 1 / yearsHeld) - 1) * 100, 1)
      }
    }

    return {
      ticker: group.ticker ?? group.cusip,
      company_name: group.name,
      cusip: group.cusip,
      first_seen_quarter: segmentFirstQuarter,
      last_seen_quarter: lastQuarter,
      holding_period_quarters: segmentQuartersHeld,
      is_current: isCurrent,
      current_price: currentPrice ?? null,
      current_value_thousands: isCurrent ? last?.value_thousands ?? null : null,
      current_weight_pct: isCurrent ? last?.weight_pct ?? null : null,
      peak_value_thousands: Math.max(...runtimeTimeline.map((entry) => entry.value_thousands), 0),
      peak_weight_pct: Math.max(...runtimeTimeline.map((entry) => entry.weight_pct), 0),
      estimated_entry_price: segmentEntryPrice,
      weighted_avg_entry_price: avgCost,
      exit_price: isCurrent ? null : last?.estimated_price ?? null,
      price_return_pct: priceReturnPct,
      annualized_return_pct: annualizedReturnPct,
      prior_stints: priorStints,
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
