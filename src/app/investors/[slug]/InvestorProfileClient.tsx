'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AccordionItem } from '@/components/Accordion'
import { fetchApiJson, fetchPriceMap } from '@/lib/api'
import { getConvictionHref } from '@/lib/conviction-index'
import { coverageNote } from '@/lib/coverage-notes'
import { usePrivateMode } from '@/lib/private-mode'
import {
  buildRuntimeTrackRecords,
  type RuntimeInvestmentRecord,
  type TrackRecordApiGroup,
} from '@/lib/track-record'

interface InvestorHolding {
  shares: number
  value: number
  pct_of_portfolio: number
  position_rank: number
  report_date: string
  filing_date: string
  ticker: string | null
  name: string
  sector: string | null
  cusip: string
  security_slug: string
}

interface InvestorChange {
  change_type: string
  shares_before: number
  shares_after: number
  shares_change: number
  shares_change_pct: number | null
  value_before: number
  value_after: number
  value_change: number
  pct_of_portfolio_before: number | null
  pct_of_portfolio_after: number | null
  year: number
  quarter: number
  report_date: string
  ticker: string | null
  name: string
  security_slug: string
}

interface InvestorResponse {
  name: string
  slug: string
  firm_name: string | null
  active: number
  filings_count: number | null
  latest_report_date: string | null
  verdict_follow: string | null
  verdict_summary: string | null
  biography: string | null
  philosophy: string | null
  style: string | null
  score_notes: string | null
  philosophy_score: number | null
  concentration_score: number | null
  rationality_score: number | null
  integrity_score: number | null
  track_record_score: number | null
  transparency_score: number | null
  relevance_score: number | null
  agi_awareness_score: number | null
  composite_score: number | null
  holdings: InvestorHolding[]
  recent_changes: InvestorChange[]
}

interface LoadState {
  investor: InvestorResponse | null
  trackRecord: RuntimeInvestmentRecord[]
  prices: Record<string, number>
  loading: boolean
  notFound: boolean
}

const SCORE_DIMENSIONS = [
  { key: 'philosophy_score', label: 'Philosophy Alignment', weight: '20%' },
  { key: 'concentration_score', label: 'Concentration', weight: '15%' },
  { key: 'rationality_score', label: 'Rationality', weight: '15%' },
  { key: 'integrity_score', label: 'Integrity', weight: '15%' },
  { key: 'track_record_score', label: 'Track Record', weight: '15%' },
  { key: 'transparency_score', label: 'Transparency', weight: '10%' },
  { key: 'relevance_score', label: 'Relevance', weight: '5%' },
  { key: 'agi_awareness_score', label: 'AGI Awareness', weight: '5%' },
] as const

function verdictLabel(verdict: string | null): string {
  switch (verdict) {
    case 'strong_follow':
    case 'follow':
      return 'FOLLOW'
    case 'monitor':
      return 'WATCH'
    default:
      return 'SKIP'
  }
}

function verdictStyle(verdict: string | null): string {
  switch (verdict) {
    case 'strong_follow':
    case 'follow':
      return 'bg-green-100 text-green-700 border border-green-300'
    case 'monitor':
      return 'bg-yellow-100 text-yellow-700 border border-yellow-300'
    default:
      return 'bg-red-100 text-red-700 border border-red-300'
  }
}

function combinedScoreColor(score: number): string {
  if (score >= 8.0) return 'text-green-600'
  if (score >= 7.0) return 'text-blue-600'
  if (score >= 6.0) return 'text-yellow-600'
  if (score >= 5.0) return 'text-orange-500'
  return 'text-red-500'
}

function combinedScoreBgClass(score: number): string {
  if (score >= 8.0) return 'bg-green-50 border-green-200'
  if (score >= 7.0) return 'bg-blue-50 border-blue-200'
  if (score >= 6.0) return 'bg-yellow-50 border-yellow-200'
  if (score >= 5.0) return 'bg-orange-50 border-orange-200'
  return 'bg-red-50 border-red-200'
}

function scoreColor(score: number): string {
  if (score >= 8) return 'text-green-600'
  if (score >= 6) return 'text-blue-600'
  if (score >= 4) return 'text-yellow-600'
  return 'text-red-500'
}

function barColor(score: number): string {
  if (score >= 8) return 'bg-green-500'
  if (score >= 6) return 'bg-blue-500'
  if (score >= 4) return 'bg-yellow-500'
  return 'bg-red-500'
}

function changeBadge(changeType: string): { label: string; className: string } {
  switch (changeType) {
    case 'NEW':
      return { label: 'NEW', className: 'bg-green-100 text-green-700 border border-green-300' }
    case 'INCREASED':
      return { label: 'ADD', className: 'bg-blue-100 text-blue-700 border border-blue-300' }
    case 'DECREASED':
      return { label: 'TRIM', className: 'bg-orange-100 text-orange-700 border border-orange-300' }
    case 'SOLD_OUT':
      return { label: 'EXIT', className: 'bg-red-100 text-red-700 border border-red-300' }
    default:
      return { label: changeType, className: 'bg-gray-100 text-gray-700 border border-gray-300' }
  }
}

function formatParagraphs(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .split(/(?:\n\n|\n)/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

function formatValueFromThousands(value: number | null | undefined): string {
  if (value == null) return '--'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}B`
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}M`
  return `$${value.toFixed(0)}K`
}

function formatShares(shares: number | null | undefined): string {
  if (shares == null) return '--'
  const abs = Math.abs(shares)
  if (abs >= 1_000_000) return `${(shares / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(shares / 1_000).toFixed(0)}K`
  return shares.toLocaleString()
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return '--'
  if (price >= 1000) {
    return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  }
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatReturn(pct: number | null): { text: string; className: string } {
  if (pct == null) return { text: '--', className: 'text-gray-400' }
  return {
    text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
    className: pct >= 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold',
  }
}

function formatHoldingPeriod(quarters: number): string {
  if (quarters >= 4) {
    const years = quarters / 4
    return Number.isInteger(years) ? `${years}y` : `${years.toFixed(1)}y`
  }
  return `${quarters}Q`
}

function formatQuarter(year: number, quarter: number): string {
  return `${year}-Q${quarter}`
}

function quarterFromReportDate(date: string | null | undefined): string | null {
  if (!date) return null
  const year = date.slice(0, 4)
  const month = parseInt(date.slice(5, 7), 10)
  if (!year || !month) return null
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`
}

function displayTicker(ticker: string | null, companyName: string): string {
  if (!ticker || /^\d{5,}/.test(ticker)) {
    return companyName.split(' ').slice(0, 2).join(' ')
  }
  return ticker
}

function quarterIndex(quarter: string): number {
  const [year, q] = quarter.split('-Q')
  return parseInt(year, 10) * 4 + parseInt(q, 10)
}

// Null-safe descending numeric compare: nullish/NaN always sort LAST,
// regardless of direction, so missing price/return/value never scramble order.
function cmpDescNullable(a: number | null | undefined, b: number | null | undefined): number {
  const an = a == null || Number.isNaN(a) ? null : a
  const bn = b == null || Number.isNaN(b) ? null : b
  if (an === null && bn === null) return 0
  if (an === null) return 1
  if (bn === null) return -1
  return bn - an
}

export default function InvestorProfileClient({ slug }: { slug: string }) {
  const priv = usePrivateMode()
  const [state, setState] = useState<LoadState>({
    investor: null,
    trackRecord: [],
    prices: {},
    loading: true,
    notFound: false,
  })
  // "Since your last visit": remember the latest filing this browser has seen
  // (localStorage, no account needed) so returning visitors see what's new.
  const [visit, setVisit] = useState<{ state: 'first' | 'return' | 'caught'; lastQ: string | null }>({
    state: 'first',
    lastQ: null,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const investor = await fetchApiJson<InvestorResponse>(`/api/investor/${slug}`)
        const trackRecordGroups = await fetchApiJson<TrackRecordApiGroup[]>(`/api/investor/${slug}/track-record`)

        const symbols = Array.from(new Set(
          investor.holdings
            .map((holding) => holding.ticker)
            .filter((ticker): ticker is string => Boolean(ticker) && !/^\d{5,}/.test(ticker!)),
        ))

        const prices = await fetchPriceMap(symbols)
        const trackRecord = buildRuntimeTrackRecords(trackRecordGroups, prices)

        if (!cancelled) {
          setState({
            investor,
            trackRecord,
            prices,
            loading: false,
            notFound: false,
          })
        }
      } catch (error) {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message.toLowerCase() : ''
        setState((current) => ({
          ...current,
          loading: false,
          notFound: message.includes('404') || message.includes('not found'),
        }))
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [slug])

  // Compare the latest filing to what this browser last saw, then remember it.
  useEffect(() => {
    if (!state.investor) return
    const currentQ = quarterFromReportDate(state.investor.latest_report_date)
    if (!currentQ) return
    try {
      const key = `si-lastq-${slug}`
      const stored = localStorage.getItem(key)
      if (!stored) setVisit({ state: 'first', lastQ: null })
      else if (stored < currentQ) setVisit({ state: 'return', lastQ: stored })
      else setVisit({ state: 'caught', lastQ: stored })
      localStorage.setItem(key, currentQ)
    } catch {
      /* localStorage unavailable */
    }
  }, [state.investor, slug])

  const investor = state.investor

  const summary = useMemo(() => {
    if (!investor) {
      return null
    }

    const currentRecords = state.trackRecord.filter((record) => record.is_current).slice(0, 15)
    const exitedRecords = state.trackRecord.filter((record) => !record.is_current)
    const latestQuarter = state.trackRecord[0]?.last_seen_quarter ?? ''
    const recentExits = exitedRecords
      .filter((record) => latestQuarter && quarterIndex(latestQuarter) - quarterIndex(record.last_seen_quarter) <= 8)
      .slice(0, 10)
    const withReturns = state.trackRecord.filter((record) => record.price_return_pct != null)
    const winners = withReturns.filter((record) => (record.price_return_pct ?? 0) > 0)
    const winRate = withReturns.length > 0 ? (winners.length / withReturns.length) * 100 : null
    const avgReturn = withReturns.length > 0
      ? withReturns.reduce((sum, record) => sum + (record.price_return_pct ?? 0), 0) / withReturns.length
      : null
    const avgHoldingPeriod = state.trackRecord.length > 0
      ? state.trackRecord.reduce((sum, record) => sum + record.holding_period_quarters, 0) / state.trackRecord.length
      : 0

    return {
      currentRecords,
      recentExits,
      winRate,
      avgReturn,
      avgHoldingPeriod,
    }
  }, [investor, state.trackRecord])

  if (state.loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
        Loading investor profile...
      </div>
    )
  }

  if (state.notFound || !investor || !summary) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center">
        <h1 className="text-xl font-bold text-gray-900">Investor not found</h1>
        <p className="mt-2 text-sm text-gray-500">This investor profile is unavailable.</p>
        <Link href="/investors" className="mt-4 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-800">
          Back to investors
        </Link>
      </div>
    )
  }

  const currentHoldings = [...investor.holdings].sort((a, b) => cmpDescNullable(a.pct_of_portfolio, b.pct_of_portfolio))
  const totalValue = currentHoldings.reduce((sum, holding) => sum + holding.value, 0)
  const top5Weight = currentHoldings.slice(0, 5).reduce((sum, holding) => sum + holding.pct_of_portfolio, 0)
  const maxWeight = currentHoldings[0]?.pct_of_portfolio ?? 1
  const recByCusip = new Map(state.trackRecord.map((r) => [r.cusip, r]))
  const concentrationShades = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#ddd6fe']
  const verdict = verdictLabel(investor.verdict_follow)
  const combinedScore = investor.composite_score ?? 0
  const has13FData = (investor.filings_count ?? 0) > 0
  const currentQuarter = quarterFromReportDate(investor.latest_report_date)
  const changeRank: Record<string, number> = { NEW: 0, INCREASED: 1, DECREASED: 2, SOLD_OUT: 3 }
  const sortedChanges = [...investor.recent_changes].sort((a, b) => {
    const r = (changeRank[a.change_type] ?? 9) - (changeRank[b.change_type] ?? 9)
    return r !== 0 ? r : cmpDescNullable(Math.abs(a.value_change), Math.abs(b.value_change))
  })

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-900 transition">Home</Link>
        <span className="text-gray-300">/</span>
        <Link href="/investors" className="hover:text-gray-900 transition">Investors</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900 font-medium">{investor.name}</span>
      </nav>

      {has13FData && (
        <div className="flex gap-2">
          <span className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-gray-900 text-white border border-gray-900">Overview</span>
          <Link href={`/investors/${slug}/track-record`} className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-white text-gray-600 border border-gray-200 hover:bg-gray-50">History</Link>
        </div>
      )}

      <header className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                {investor.name}
              </h1>
              {priv && (
                <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide ${verdictStyle(investor.verdict_follow)}`}>
                  {verdict}
                </span>
              )}
              {investor.active === 0 && (
                <span className="inline-block px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 border border-gray-200">
                  Archived
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">{investor.firm_name ?? investor.style ?? 'Unknown firm'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {has13FData ? (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  13F as of {quarterFromReportDate(investor.latest_report_date) ?? '--'}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 font-semibold border bg-gray-100 text-gray-600 border-gray-200">
                  Profile only
                </span>
              )}
              <span className="text-gray-400">
                {has13FData && investor.latest_report_date
                  ? `Filed ${investor.latest_report_date} · ~45-day reporting delay`
                  : coverageNote(slug) ?? 'No 13F filing history is available for this investor.'}
              </span>
            </div>
            {priv && investor.verdict_summary && (
              <p className="mt-2 text-sm text-gray-600 italic leading-relaxed max-w-3xl">
                {investor.verdict_summary}
              </p>
            )}
          </div>

          {priv && (
            <div className={`flex-shrink-0 flex flex-col items-center justify-center w-24 h-24 rounded-2xl border ${combinedScoreBgClass(combinedScore)}`}>
              <span className={`text-3xl font-extrabold ${combinedScoreColor(combinedScore)}`}>
                {combinedScore.toFixed(1)}
              </span>
              <span className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">
                / 10
              </span>
            </div>
          )}
        </div>
      </header>

      {!has13FData && (
        <section className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-900">
          {coverageNote(slug) ? (
            <>
              <span className="font-semibold">Why no holdings? </span>
              {coverageNote(slug)} This page shows qualitative research and scoring only.
            </>
          ) : (
            <>This investor is part of the tracked roster, but does not have 13F holdings in the dataset.
            This page shows qualitative research and scoring only.</>
          )}
        </section>
      )}

      {has13FData && visit.state === 'return' && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 flex gap-3 items-start">
          <span className="text-xl leading-none">🆕</span>
          <div>
            <div className="font-semibold text-indigo-900 text-sm">New filing since your last visit</div>
            <div className="text-xs text-indigo-700 mt-0.5">
              You last saw <strong>{visit.lastQ}</strong>. The latest 13F is <strong>{currentQuarter}</strong> — here&apos;s what changed.
            </div>
          </div>
        </section>
      )}
      {has13FData && visit.state === 'caught' && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex gap-3 items-start">
          <span className="text-xl leading-none">✓</span>
          <div>
            <div className="font-semibold text-emerald-900 text-sm">You&apos;re up to date</div>
            <div className="text-xs text-emerald-700 mt-0.5">
              Latest filing is <strong>{currentQuarter}</strong> — the same one you saw last time. We&apos;ll flag this page when the next 13F lands.
            </div>
          </div>
        </section>
      )}

      {has13FData && investor.recent_changes.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">What changed this quarter</h2>
              <p className="text-xs text-gray-500 mt-0.5">{currentQuarter} &middot; new buys first</p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px] flex-shrink-0">
              {(['NEW', 'INCREASED', 'DECREASED', 'SOLD_OUT'] as const).map((type) => {
                const count = investor.recent_changes.filter((change) => change.change_type === type).length
                if (!count) return null
                return (
                  <span key={type} className={`px-1.5 py-0.5 rounded font-semibold ${changeBadge(type).className}`}>
                    {count} {changeBadge(type).label}
                  </span>
                )
              })}
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {sortedChanges.map((change) => {
              const badge = changeBadge(change.change_type)
              const isNew = change.change_type === 'NEW'
              // Estimated trade price = the quarter MEAN ≈ the midpoint of the prior and current
              // quarter-end 13F marks (value÷shares); NOT value_change/shares_change. The fill
              // happened at an unknown point in the quarter, so the midpoint of the two surrounding
              // marks minimises estimation error. Fall back to the one available mark for opens/exits.
              const beforeP = change.shares_before > 0 ? (change.value_before * 1000) / change.shares_before : null
              const afterP = change.shares_after > 0 ? (change.value_after * 1000) / change.shares_after : null
              const estTradePrice =
                beforeP != null && afterP != null ? (beforeP + afterP) / 2 : afterP ?? beforeP
              const bought = change.shares_change >= 0
              // Cash traded ≈ |shares changed| × estimated trade price (immune to mark-to-market sign flips).
              const tradeCashThousands = estTradePrice != null
                ? (Math.abs(change.shares_change) * estTradePrice) / 1000
                : Math.abs(change.value_change)
              const convictionHref = isNew ? getConvictionHref(slug, change.ticker) : null
              const afterW = change.pct_of_portfolio_after
              return (
                <div
                  key={`${change.security_slug}-${change.change_type}`}
                  className={`rounded-xl border p-3 ${isNew ? 'border-green-200 bg-green-50/40' : 'border-gray-200 bg-white'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-gray-900 text-sm">{displayTicker(change.ticker, change.name)}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${badge.className}`}>{badge.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">{change.name}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    <span>
                      <span className="text-gray-400">{bought ? 'Bought' : 'Sold'}: </span>
                      <span className="font-mono font-semibold text-gray-800">{formatShares(Math.abs(change.shares_change))} sh</span>
                    </span>
                    <span>
                      <span className="text-gray-400">Traded: </span>
                      <span className={`font-mono font-semibold ${bought ? 'text-green-600' : 'text-red-500'}`}>
                        {bought ? '+' : '−'}{formatValueFromThousands(tradeCashThousands)}
                      </span>
                    </span>
                    {totalValue > 0 && (
                      <span title="Cash traded (|shares changed| × estimated trade price) as a share of the current portfolio">
                        <span className="text-gray-400">= </span>
                        <span className="font-mono font-semibold text-gray-800">{((tradeCashThousands / totalValue) * 100).toFixed(1)}% of portfolio</span>
                      </span>
                    )}
                    {estTradePrice != null && (
                      <span title="Estimated trade price = the quarter's mean ≈ the midpoint of the prior and current quarter-end 13F marks (value ÷ shares). The exact fill is unknown; the midpoint minimises the estimation error.">
                        <span className="text-gray-400">est. price </span>
                        <span className="font-mono font-semibold text-gray-800 border-b border-dotted border-gray-300">{formatPrice(estTradePrice)}</span>
                      </span>
                    )}
                    {afterW != null && afterW > 0 && (
                      <span><span className="text-gray-400">now </span><span className="font-mono font-semibold text-gray-800">{afterW.toFixed(1)}%</span></span>
                    )}
                  </div>
                  {convictionHref && (
                    <Link href={convictionHref} className="inline-block mt-1.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800">
                      Read the deep-dive &rarr;
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Est. price = the quarter&apos;s mean ≈ the midpoint of the prior and current quarter-end 13F marks (value ÷ shares). The exact fill is unknown, so the midpoint of the two surrounding marks is used to minimise the estimation error. Trade size = shares changed × that price.
          </p>
        </section>
      )}

      {has13FData && currentHoldings.length === 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-900">
          Historical 13F filings are loaded for this investor, but the latest parsed filing did not
          produce a current holdings table.
        </section>
      )}

      {currentHoldings.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Current Portfolio</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {currentHoldings[0]?.report_date ?? '--'} &middot; Filed {currentHoldings[0]?.filing_date ?? '--'}
              </p>
            </div>
            <Link
              href={`/investors/${slug}/track-record`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 transition flex-shrink-0"
            >
              Full Track Record
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <StatCard value={formatValueFromThousands(totalValue)} label="Total Value" />
            <StatCard value={currentHoldings.length.toString()} label="Positions" />
            <StatCard value={`${top5Weight.toFixed(1)}%`} label="Top 5 Conc." />
            <StatCard value={investor.recent_changes.length.toString()} label="Changes This Q" />
          </div>

          <div className="mb-4">
            <div className="flex h-7 rounded-lg overflow-hidden border border-gray-200">
              {currentHoldings.slice(0, 6).map((holding, i) => (
                <div
                  key={holding.security_slug}
                  className="h-full flex items-center justify-center text-[10px] font-bold text-white overflow-hidden whitespace-nowrap"
                  style={{ width: `${holding.pct_of_portfolio}%`, background: concentrationShades[i] ?? '#c7d2fe' }}
                  title={`${displayTicker(holding.ticker, holding.name)} · ${holding.pct_of_portfolio.toFixed(1)}%`}
                >
                  {holding.pct_of_portfolio >= 8 ? `${displayTicker(holding.ticker, holding.name)} ${holding.pct_of_portfolio.toFixed(0)}%` : ''}
                </div>
              ))}
              {currentHoldings.length > 6 && (
                <div className="h-full flex-1 bg-gray-100" title="Smaller positions" />
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">How the portfolio is split — top 5 = {top5Weight.toFixed(0)}%</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] text-gray-500 uppercase tracking-wide">
                  <th className="py-1.5 px-1.5 text-center w-8">#</th>
                  <th className="py-1.5 px-1.5 text-left">Ticker</th>
                  <th className="py-1.5 px-1.5 text-left hidden sm:table-cell">Company</th>
                  <th className="py-1.5 px-1.5 text-right hidden sm:table-cell">Est. Entry</th>
                  <th className="py-1.5 px-1.5 text-right hidden sm:table-cell">Price</th>
                  <th className="py-1.5 px-1.5 text-right">Return</th>
                  <th className="py-1.5 px-1.5 text-right hidden sm:table-cell">Value</th>
                  <th className="py-1.5 px-1.5 text-right min-w-[120px]">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {currentHoldings.map((holding, index) => {
                  const price = holding.ticker ? state.prices[holding.ticker] ?? null : null
                  const relatedChange = investor.recent_changes.find((change) => change.security_slug === holding.security_slug)
                  const convictionHref = getConvictionHref(slug, holding.ticker)
                  const rec = recByCusip.get(holding.cusip)
                  const barWidthPct = maxWeight > 0 ? (holding.pct_of_portfolio / maxWeight) * 100 : 0

                  return (
                    <tr key={holding.security_slug} className="hover:bg-gray-50/50 transition">
                      <td className="py-2 px-1.5 text-center text-gray-400 text-xs">{index + 1}</td>
                      <td className="py-2 px-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-gray-900 text-xs">
                            {displayTicker(holding.ticker, holding.name)}
                          </span>
                          {relatedChange && (
                            <span className={`inline-block px-1 py-0.5 rounded text-[8px] font-bold uppercase leading-none ${changeBadge(relatedChange.change_type).className}`}>
                              {changeBadge(relatedChange.change_type).label}
                            </span>
                          )}
                          {convictionHref && (
                            <Link
                              href={convictionHref}
                              className="inline-block px-1 py-0.5 text-[8px] font-bold uppercase rounded bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-200 transition"
                            >
                              Conviction
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-1.5 text-gray-500 text-xs hidden sm:table-cell truncate max-w-[180px]">
                        {holding.name}
                      </td>
                      <td className="py-2 px-1.5 text-right hidden sm:table-cell">
                        <span className="font-mono text-xs text-gray-600" title={rec?.estimated_entry_price != null ? `Est. entry = 13F value ÷ shares in ${rec.first_seen_quarter}` : undefined}>
                          {formatPrice(rec?.estimated_entry_price ?? null)}
                        </span>
                      </td>
                      <td className="py-2 px-1.5 text-right hidden sm:table-cell">
                        <span className="font-mono text-xs text-gray-700">{formatPrice(price)}</span>
                      </td>
                      <td className="py-2 px-1.5 text-right">
                        <span className={`font-mono text-xs ${formatReturn(rec?.price_return_pct ?? null).className}`}>
                          {formatReturn(rec?.price_return_pct ?? null).text}
                        </span>
                      </td>
                      <td className="py-2 px-1.5 text-right text-gray-700 text-xs hidden sm:table-cell">
                        {formatValueFromThousands(holding.value)}
                      </td>
                      <td className="py-2 px-1.5">
                        <div className="flex items-center gap-1.5 justify-end">
                          <div className="w-16 hidden sm:block">
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-indigo-400" style={{ width: `${barWidthPct}%` }} />
                            </div>
                          </div>
                          <span className="text-xs text-gray-900 font-semibold">
                            {holding.pct_of_portfolio.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {state.trackRecord.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-5 sm:px-6">
          <div className="mb-3">
            <h2 className="text-lg font-bold text-gray-900">Track Record</h2>
            <p className="text-xs text-gray-500 mt-0.5">{state.trackRecord.length} positions tracked across the loaded filing history</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <StatCard
              value={summary.winRate != null ? `${summary.winRate.toFixed(0)}%` : '--'}
              label={`Win Rate${state.trackRecord.filter((record) => record.price_return_pct != null).length > 0 ? ` (${state.trackRecord.filter((record) => record.price_return_pct != null).length})` : ''}`}
              valueClass={summary.winRate != null ? (summary.winRate >= 50 ? 'text-green-600' : 'text-red-500') : undefined}
            />
            <StatCard
              value={summary.avgReturn != null ? `${summary.avgReturn >= 0 ? '+' : ''}${summary.avgReturn.toFixed(0)}%` : '--'}
              label="Avg Return"
              valueClass={summary.avgReturn != null ? (summary.avgReturn >= 0 ? 'text-green-600' : 'text-red-500') : undefined}
            />
            <StatCard
              value={summary.avgHoldingPeriod > 0 ? formatHoldingPeriod(Math.round(summary.avgHoldingPeriod)) : '--'}
              label="Avg Hold"
            />
            <StatCard value={summary.currentRecords.length.toString()} label="Current" />
          </div>

          <Link
            href={`/investors/${slug}/track-record`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition"
          >
            See the full position history &rarr;
          </Link>
          <p className="text-xs text-gray-400 mt-2">
            A visual timeline of every position — when he opened, added, trimmed, and exited, and how each bet performed.
          </p>
        </section>
      )}


      <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 sm:px-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">About {investor.name}</h2>
        <p className="text-xs text-gray-400 mb-3">Runtime data from the D1-backed API</p>

        {investor.philosophy && (
          <AccordionItem title="Philosophy" defaultOpen>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              {formatParagraphs(investor.philosophy).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </AccordionItem>
        )}

        {investor.biography && (
          <AccordionItem title="Background">
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              {formatParagraphs(investor.biography).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </AccordionItem>
        )}

        {investor.verdict_summary && (
          <AccordionItem title="Why Track This Investor">
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              {formatParagraphs(investor.verdict_summary).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </AccordionItem>
        )}

        {investor.score_notes && (
          <AccordionItem title="Score Notes">
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              {formatParagraphs(investor.score_notes).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </AccordionItem>
        )}
      </section>

      {priv && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-5 sm:px-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Score Breakdown</h2>
          <div className="space-y-2.5">
            {SCORE_DIMENSIONS.map(({ key, label, weight }) => {
              const value = investor[key] ?? 0
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="w-36 flex-shrink-0">
                    <span className="text-xs font-medium text-gray-700">{label}</span>
                    <span className="ml-1 text-[10px] text-gray-400">({weight})</span>
                  </div>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor(value)}`} style={{ width: `${(value / 10) * 100}%` }} />
                  </div>
                  <span className={`w-8 text-right text-xs font-bold ${scoreColor(value)}`}>
                    {value}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <div className="pt-2 pb-6">
        <Link
          href="/investors"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition"
        >
          Back to All Investors
        </Link>
      </div>
    </div>
  )
}

function StatCard({
  value,
  label,
  valueClass,
}: {
  value: string
  label: string
  valueClass?: string
}) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
      <p className={`text-base font-extrabold font-mono ${valueClass ?? 'text-gray-900'}`}>{value}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
    </div>
  )
}

