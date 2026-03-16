'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AccordionItem } from '@/components/Accordion'
import { fetchApiJson, fetchPriceMap } from '@/lib/api'
import { getConvictionHref } from '@/lib/conviction-index'
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

export default function InvestorProfileClient({ slug }: { slug: string }) {
  const [state, setState] = useState<LoadState>({
    investor: null,
    trackRecord: [],
    prices: {},
    loading: true,
    notFound: false,
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

  const currentHoldings = [...investor.holdings].sort((a, b) => b.pct_of_portfolio - a.pct_of_portfolio)
  const totalValue = currentHoldings.reduce((sum, holding) => sum + holding.value, 0)
  const top5Weight = currentHoldings.slice(0, 5).reduce((sum, holding) => sum + holding.pct_of_portfolio, 0)
  const maxWeight = currentHoldings[0]?.pct_of_portfolio ?? 1
  const verdict = verdictLabel(investor.verdict_follow)
  const combinedScore = investor.composite_score ?? 0
  const has13FData = (investor.filings_count ?? 0) > 0

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-900 transition">Home</Link>
        <span className="text-gray-300">/</span>
        <Link href="/investors" className="hover:text-gray-900 transition">Investors</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900 font-medium">{investor.name}</span>
      </nav>

      <header className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                {investor.name}
              </h1>
              <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide ${verdictStyle(investor.verdict_follow)}`}>
                {verdict}
              </span>
              {investor.active === 0 && (
                <span className="inline-block px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 border border-gray-200">
                  Archived
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">{investor.firm_name ?? investor.style ?? 'Unknown firm'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold border ${
                  has13FData
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-gray-100 text-gray-600 border-gray-200'
                }`}
              >
                {has13FData ? '13F data loaded' : 'Profile only'}
              </span>
              <span className="text-gray-400">
                {has13FData && investor.latest_report_date
                  ? `Latest filing: ${investor.latest_report_date}`
                  : 'No 13F filing history is loaded in the current dataset.'}
              </span>
            </div>
            {investor.verdict_summary && (
              <p className="mt-2 text-sm text-gray-600 italic leading-relaxed max-w-3xl">
                {investor.verdict_summary}
              </p>
            )}
          </div>

          <div className={`flex-shrink-0 flex flex-col items-center justify-center w-24 h-24 rounded-2xl border ${combinedScoreBgClass(combinedScore)}`}>
            <span className={`text-3xl font-extrabold ${combinedScoreColor(combinedScore)}`}>
              {combinedScore.toFixed(1)}
            </span>
            <span className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">
              / 10
            </span>
          </div>
        </div>
      </header>

      {!has13FData && (
        <section className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-900">
          This investor is part of the tracked roster, but no 13F filing history is loaded in the
          current runtime dataset. This page currently shows qualitative research and scoring only.
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

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] text-gray-500 uppercase tracking-wide">
                  <th className="py-1.5 px-1.5 text-center w-8">#</th>
                  <th className="py-1.5 px-1.5 text-left">Ticker</th>
                  <th className="py-1.5 px-1.5 text-left hidden sm:table-cell">Company</th>
                  <th className="py-1.5 px-1.5 text-right hidden sm:table-cell">Price</th>
                  <th className="py-1.5 px-1.5 text-right">Value</th>
                  <th className="py-1.5 px-1.5 text-right hidden sm:table-cell">Shares</th>
                  <th className="py-1.5 px-1.5 text-right min-w-[130px]">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {currentHoldings.map((holding, index) => {
                  const price = holding.ticker ? state.prices[holding.ticker] ?? null : null
                  const relatedChange = investor.recent_changes.find((change) => change.security_slug === holding.security_slug)
                  const convictionHref = getConvictionHref(slug, holding.ticker)
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
                        <span className="font-mono text-xs text-gray-700">{formatPrice(price)}</span>
                      </td>
                      <td className="py-2 px-1.5 text-right text-gray-700 text-xs">
                        {formatValueFromThousands(holding.value)}
                      </td>
                      <td className="py-2 px-1.5 text-right text-gray-500 text-xs hidden sm:table-cell">
                        {holding.shares.toLocaleString()}
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
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Investment History</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {state.trackRecord.length} positions tracked &middot; Current and recently exited
              </p>
            </div>
            <Link
              href={`/investors/${slug}/track-record`}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition flex-shrink-0"
            >
              View Full Track Record &rarr;
            </Link>
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

          {summary.currentRecords.length > 0 && (
            <CompactTrackRecordTable
              title="Current Holdings"
              records={summary.currentRecords}
              showCurrent
            />
          )}

          {summary.recentExits.length > 0 && (
            <div className="mt-4">
              <CompactTrackRecordTable
                title="Recently Exited"
                records={summary.recentExits}
              />
            </div>
          )}
        </section>
      )}

      {investor.recent_changes.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Recent Changes</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Latest quarter reported in the runtime database
              </p>
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

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] text-gray-500 uppercase tracking-wide">
                  <th className="py-1.5 px-1.5 text-left">Action</th>
                  <th className="py-1.5 px-1.5 text-left">Ticker</th>
                  <th className="py-1.5 px-1.5 text-left hidden sm:table-cell">Company</th>
                  <th className="py-1.5 px-1.5 text-right">Shares Change</th>
                  <th className="py-1.5 px-1.5 text-right">Value Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {investor.recent_changes.map((change) => {
                  const badge = changeBadge(change.change_type)
                  const estimatedTradePrice = change.shares_change !== 0
                    ? (Math.abs(change.value_change) * 1000) / Math.abs(change.shares_change)
                    : null
                  return (
                    <tr key={`${change.security_slug}-${change.change_type}`} className="hover:bg-gray-50/50 transition">
                      <td className="py-2 px-1.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-2 px-1.5">
                        <span className="font-mono font-bold text-gray-900">
                          {displayTicker(change.ticker, change.name)}
                        </span>
                      </td>
                      <td className="py-2 px-1.5 text-gray-500 hidden sm:table-cell truncate max-w-[180px]">
                        {change.name}
                      </td>
                      <td className="py-2 px-1.5 text-right">
                        <span className={change.shares_change > 0 ? 'text-green-600' : 'text-red-500'}>
                          {formatShares(change.shares_change)}
                        </span>
                        {change.shares_change_pct != null && (
                          <span className="text-gray-400 text-[10px] ml-1">
                            ({change.shares_change_pct > 0 ? '+' : ''}{change.shares_change_pct.toFixed(0)}%)
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-1.5 text-right">
                        <span className={change.value_change > 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                          {change.value_change > 0 ? '+' : ''}{formatValueFromThousands(change.value_change)}
                        </span>
                        {estimatedTradePrice != null && (
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            ~{formatPrice(estimatedTradePrice)}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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

function CompactTrackRecordTable({
  title,
  records,
  showCurrent = false,
}: {
  title: string
  records: RuntimeInvestmentRecord[]
  showCurrent?: boolean
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-[10px] text-gray-500 uppercase tracking-wide">
              <th className="py-1.5 px-1.5 text-left">Ticker</th>
              <th className="py-1.5 px-1.5 text-left hidden sm:table-cell">Company</th>
              <th className="py-1.5 px-1.5 text-right">Entry</th>
              <th className="py-1.5 px-1.5 text-right">{showCurrent ? 'Current' : 'Exit'}</th>
              <th className="py-1.5 px-1.5 text-right hidden sm:table-cell">Hold</th>
              <th className="py-1.5 px-1.5 text-right">Return</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.map((record) => {
              const returnInfo = formatReturn(record.price_return_pct)
              return (
                <tr key={`${record.ticker}-${record.first_seen_quarter}`} className="hover:bg-gray-50/50 transition">
                  <td className="py-1.5 px-1.5">
                    <span className="font-mono font-bold text-gray-900">{displayTicker(record.ticker, record.company_name)}</span>
                  </td>
                  <td className="py-1.5 px-1.5 text-gray-500 hidden sm:table-cell truncate max-w-[150px]">
                    {record.company_name}
                  </td>
                  <td className="py-1.5 px-1.5 text-right text-gray-500 font-mono">
                    {record.first_seen_quarter}
                  </td>
                  <td className="py-1.5 px-1.5 text-right font-mono text-gray-700">
                    {showCurrent ? formatPrice(record.current_price) : record.last_seen_quarter}
                  </td>
                  <td className="py-1.5 px-1.5 text-right text-gray-500 hidden sm:table-cell">
                    {formatHoldingPeriod(record.holding_period_quarters)}
                  </td>
                  <td className="py-1.5 px-1.5 text-right">
                    <span className={`font-mono ${returnInfo.className}`}>{returnInfo.text}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
