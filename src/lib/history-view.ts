// Shared view-model + helpers for the investor Position-History page (Ledger /
// Timeline-boxes / Trade-Tape views). Wraps buildRuntimeTrackRecords so every
// view renders identical, correct numbers. Math mirrors the validated enrich.py:
// quarter-mean price marks, running-average cost basis, S&P-500 benchmark.

import {
  buildRuntimeTrackRecords,
  type RuntimeInvestmentRecord,
  type RuntimePriceMap,
  type TrackRecordApiGroup,
} from './track-record'
import { spxAnnualized, spxClose, SPX_LATEST, SPX_ASOF } from './spx'

export type ActionType = 'open' | 'add' | 'trim' | 'exit'

export interface HistoryEvent {
  qi: number // 0-based quarter index = year*4 + (quarter-1)
  year: number
  q: number
  quarter: string // "2023-Q2"
  label: string // "Q2 2023"
  type: ActionType
  shares_delta: number
  shares_after: number
  price: number | null
  chg_pct: number | null // % change in shares vs prior quarter
  weight: number // % of portfolio AFTER this event
  value_thousands: number // position $ value AFTER this event
}

export interface HistoryPosition {
  ticker: string
  name: string
  cusip: string
  security_slug: string | null
  linkable: boolean
  status: 'held' | 'exited'
  first_quarter: string
  last_quarter: string
  first_qi: number
  now_qi: number
  now_label: string
  exit_qi: number | null // for sorting exited positions by recency
  holding_quarters: number
  holding_years: number
  entry_price: number | null
  avg_cost: number | null
  end_price: number | null
  end_is_live: boolean
  current_price: number | null
  current_weight: number
  current_value_thousands: number | null
  current_shares: number | null
  peak_weight: number
  peak_value_thousands: number
  return_pct: number | null
  annualized_pct: number | null
  spx_annual_pct: number | null
  beat_spx: boolean
  prior_stints: number
  n_quarters_observed: number
  n_changes: number
  transient: boolean
  points: { qi: number; year: number; q: number; weight: number }[]
  events: HistoryEvent[]
}

export interface HistorySummary {
  spx_asof: string
  spx_latest: number
  counts: { total: number; held: number; exited: number; transient: number }
  aggregate: {
    win_rate: number | null
    beat_spx_rate: number | null
    median_return: number | null
    median_holding_years: number | null
    best: { ticker: string; name: string; return_pct: number } | null
    worst: { ticker: string; name: string; return_pct: number } | null
    biggest_current: { ticker: string; weight: number } | null
  }
  axis: { min_qi: number; max_qi: number }
}

export interface HistoryView {
  summary: HistorySummary
  positions: HistoryPosition[]
}

// ---- quarter helpers (0-based quarter index, matching enrich.py qidx0) ----
export function qi0(quarter: string): number {
  const [y, q] = quarter.split('-Q')
  return parseInt(y, 10) * 4 + (parseInt(q, 10) - 1)
}
export function qYear(qi: number): number {
  return Math.floor(qi / 4)
}
export function qLabel(qi: number): string {
  return `Q${(qi % 4) + 1} ${qYear(qi)}`
}

function round(v: number | null, d = 2): number | null {
  if (v == null || !Number.isFinite(v)) return null
  const f = 10 ** d
  return Math.round(v * f) / f
}
function median(xs: number[]): number | null {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  if (!n) return null
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

const ACTION_FROM: Record<RuntimeInvestmentRecord['timeline'][number]['action'], ActionType | null> = {
  NEW: 'open',
  INCREASED: 'add',
  DECREASED: 'trim',
  HELD: null,
}

function enrich(r: RuntimeInvestmentRecord): HistoryPosition {
  const segStart = qi0(r.first_seen_quarter)
  const seg = r.timeline.filter((t) => qi0(t.quarter) >= segStart)
  const points = seg.map((t) => {
    const i = qi0(t.quarter)
    return { qi: i, year: qYear(i), q: (i % 4) + 1, weight: t.weight_pct }
  })

  const events: HistoryEvent[] = []
  for (const t of seg) {
    const type = ACTION_FROM[t.action]
    if (!type) continue // skip pure HELD quarters (no change was made)
    const prevShares = t.shares - t.share_delta
    const chg = type !== 'open' && prevShares > 0 ? round((t.share_delta / prevShares) * 100, 1) : null
    const i = qi0(t.quarter)
    events.push({
      qi: i, year: qYear(i), q: (i % 4) + 1, quarter: t.quarter, label: qLabel(i),
      type, shares_delta: t.share_delta, shares_after: t.shares, price: t.estimated_price,
      chg_pct: chg, weight: t.weight_pct, value_thousands: t.value_thousands,
    })
  }

  const last = seg[seg.length - 1]
  const lastQi = last ? qi0(last.quarter) : segStart
  const nowQi = r.is_current ? lastQi : lastQi + 1
  const endPrice = r.is_current ? r.current_price ?? last?.estimated_price ?? null : r.exit_price
  if (!r.is_current) {
    events.push({
      qi: nowQi, year: qYear(nowQi), q: (nowQi % 4) + 1, quarter: `${qYear(nowQi)}-Q${(nowQi % 4) + 1}`,
      label: qLabel(nowQi), type: 'exit', shares_delta: -(last?.shares ?? 0), shares_after: 0,
      price: endPrice, chg_pct: null, weight: 0, value_thousands: 0,
    })
  }

  const avgCost = r.weighted_avg_entry_price ?? r.estimated_entry_price
  const holdingYears = Math.max(r.holding_period_quarters / 4, 0.25)
  const spxAnnual = round(
    spxAnnualized(r.first_seen_quarter, r.is_current ? SPX_LATEST : spxClose(r.last_seen_quarter), holdingYears),
    1,
  )
  const beatSpx = r.annualized_return_pct != null && spxAnnual != null && r.annualized_return_pct > spxAnnual
  const nChanges = events.filter((e) => e.type !== 'exit').length

  return {
    ticker: r.ticker,
    name: r.company_name,
    cusip: r.cusip,
    security_slug: r.cusip ? r.ticker : null,
    linkable: /^[A-Za-z][A-Za-z.\-]{0,5}$/.test(r.ticker),
    status: r.is_current ? 'held' : 'exited',
    first_quarter: r.first_seen_quarter,
    last_quarter: r.last_seen_quarter,
    first_qi: segStart,
    now_qi: nowQi,
    now_label: qLabel(nowQi),
    exit_qi: r.is_current ? null : nowQi,
    holding_quarters: r.holding_period_quarters,
    holding_years: round(holdingYears, 2) ?? holdingYears,
    entry_price: r.estimated_entry_price,
    avg_cost: avgCost,
    end_price: endPrice,
    end_is_live: !!(r.is_current && r.current_price != null),
    current_price: r.current_price,
    current_weight: r.current_weight_pct ?? 0,
    current_value_thousands: r.current_value_thousands,
    current_shares: r.is_current ? last?.shares ?? null : null,
    peak_weight: r.peak_weight_pct,
    peak_value_thousands: r.peak_value_thousands,
    return_pct: r.price_return_pct,
    annualized_pct: r.annualized_return_pct,
    spx_annual_pct: spxAnnual,
    beat_spx: beatSpx,
    prior_stints: r.prior_stints,
    n_quarters_observed: r.timeline.length,
    n_changes: nChanges,
    transient: r.holding_period_quarters <= 1 && (r.price_return_pct == null || Math.abs(r.price_return_pct) < 0.1),
    points,
    events,
  }
}

export function buildHistoryView(groups: TrackRecordApiGroup[], prices: RuntimePriceMap): HistoryView {
  const records = buildRuntimeTrackRecords(groups, prices)
  const positions = records.filter((r) => r.timeline.length > 0).map(enrich)

  const held = positions.filter((p) => p.status === 'held')
  const exited = positions.filter((p) => p.status === 'exited')
  const withRet = positions.filter((p) => p.return_pct != null) as (HistoryPosition & { return_pct: number })[]
  const wins = withRet.filter((p) => p.return_pct > 0)
  const beat = positions.filter((p) => p.beat_spx)
  const best = withRet.length ? withRet.reduce((a, b) => (b.return_pct > a.return_pct ? b : a)) : null
  const worst = withRet.length ? withRet.reduce((a, b) => (b.return_pct < a.return_pct ? b : a)) : null
  const biggest = held.length ? held.reduce((a, b) => (b.current_weight > a.current_weight ? b : a)) : null

  const summary: HistorySummary = {
    spx_asof: SPX_ASOF,
    spx_latest: SPX_LATEST,
    counts: {
      total: positions.length,
      held: held.length,
      exited: exited.length,
      transient: positions.filter((p) => p.transient).length,
    },
    aggregate: {
      win_rate: withRet.length ? round((wins.length / withRet.length) * 100, 1) : null,
      beat_spx_rate: withRet.length ? round((beat.length / withRet.length) * 100, 1) : null,
      median_return: round(median(withRet.map((p) => p.return_pct)), 1),
      median_holding_years: round(median(positions.map((p) => p.holding_years)), 1),
      best: best ? { ticker: best.ticker, name: best.name, return_pct: best.return_pct } : null,
      worst: worst ? { ticker: worst.ticker, name: worst.name, return_pct: worst.return_pct } : null,
      biggest_current: biggest ? { ticker: biggest.ticker, weight: biggest.current_weight } : null,
    },
    axis: {
      min_qi: positions.reduce((m, p) => Math.min(m, p.first_qi), Infinity) || 0,
      max_qi: positions.reduce((m, p) => Math.max(m, p.now_qi), 0),
    },
  }

  return { summary, positions }
}

// ---- formatting helpers (shared across all three views) ----
export function fmtPrice(p: number | null): string {
  if (p == null) return '--'
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  return `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
export function fmtValue(v: number | null): string {
  if (v == null) return '--'
  const a = Math.abs(v)
  if (a >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}B`
  if (a >= 1_000) return `$${(v / 1_000).toFixed(0)}M`
  return `$${v.toFixed(0)}K`
}
export function fmtShares(s: number | null): string {
  if (s == null) return '--'
  const a = Math.abs(s)
  const sign = s < 0 ? '-' : ''
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`
  if (a >= 1_000) return `${sign}${(a / 1_000).toFixed(0)}K`
  return s.toLocaleString()
}
export function fmtPct(p: number | null, signed = true): string {
  if (p == null) return '--'
  const sign = p >= 0 ? (signed ? '+' : '') : '-'
  const abs = Math.abs(p)
  return `${sign}${abs >= 100 ? abs.toFixed(0) : abs.toFixed(1)}%`
}
export function tidyTicker(tk: string, name: string): string {
  if (!tk || /^\d{4,}/.test(tk)) return name.split(' ').slice(0, 2).join(' ')
  return tk
}

// visual metadata per action: glyph, label (verb), and tailwind color classes
export const ACTION_META: Record<ActionType, {
  glyph: string; verb: string; text: string; bg: string; ring: string; dot: string
}> = {
  open: { glyph: '●', verb: 'Opened', text: 'text-green-700', bg: 'bg-green-50', ring: 'border-green-200', dot: '#16a34a' },
  add: { glyph: '▲', verb: 'Added', text: 'text-blue-700', bg: 'bg-blue-50', ring: 'border-blue-200', dot: '#2563eb' },
  trim: { glyph: '▼', verb: 'Trimmed', text: 'text-orange-700', bg: 'bg-orange-50', ring: 'border-orange-200', dot: '#ea580c' },
  exit: { glyph: '✕', verb: 'Exited', text: 'text-rose-700', bg: 'bg-rose-50', ring: 'border-rose-200', dot: '#e11d48' },
}

export { SPX_ASOF }
