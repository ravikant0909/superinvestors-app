'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchApiJson, fetchPriceMap } from '@/lib/api'
import { getConvictionHref } from '@/lib/conviction-index'
import {
  buildRuntimeTrackRecords,
  type RuntimeInvestmentRecord,
  type RuntimeTimelineEntry,
  type TrackRecordApiGroup,
} from '@/lib/track-record'

interface InvestorResponse {
  name: string
  holdings: Array<{ ticker: string | null }>
}

function formatValueFromThousands(value: number | null | undefined): string {
  if (value == null) return '--'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}B`
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}M`
  return `$${value.toFixed(0)}K`
}

function formatReturn(pct: number | null): { text: string; className: string } {
  if (pct == null) return { text: '--', className: 'text-gray-400' }
  const sign = pct >= 0 ? '+' : ''
  return {
    text: `${sign}${pct.toFixed(1)}%`,
    className: pct >= 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold',
  }
}

function formatPrice(price: number | null): string {
  if (price == null) return '--'
  if (price >= 1000) {
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatCost(cost: number | null): string {
  if (cost == null) return '--'
  if (cost >= 1_000_000_000) return `$${(cost / 1_000_000_000).toFixed(1)}B`
  if (cost >= 1_000_000) return `$${(cost / 1_000_000).toFixed(1)}M`
  if (cost >= 1_000) return `$${(cost / 1_000).toFixed(0)}K`
  return `$${cost.toFixed(0)}`
}

function formatShareCount(shares: number): string {
  const abs = Math.abs(shares)
  if (abs >= 1_000_000) return `${(shares / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(shares / 1_000).toFixed(0)}K`
  return shares.toLocaleString()
}

function formatHoldingPeriod(quarters: number): string {
  if (quarters >= 4) {
    const years = quarters / 4
    return years === Math.floor(years) ? `${years}y` : `${years.toFixed(1)}y`
  }
  return `${quarters}Q`
}

function getActionBadge(action: string): { label: string; className: string } {
  switch (action) {
    case 'NEW':
      return { label: 'NEW', className: 'bg-green-100 text-green-700 border border-green-300' }
    case 'INCREASED':
      return { label: 'ADD', className: 'bg-blue-100 text-blue-700 border border-blue-300' }
    case 'DECREASED':
      return { label: 'TRIM', className: 'bg-orange-100 text-orange-700 border border-orange-300' }
    default:
      return { label: action, className: 'bg-gray-100 text-gray-500 border border-gray-200' }
  }
}

function displayTicker(ticker: string, companyName: string): string {
  return /^\d{5,}/.test(ticker) ? companyName.split(' ').slice(0, 2).join(' ') : ticker
}

export default function TrackRecordClient({ slug }: { slug: string }) {
  const [investorName, setInvestorName] = useState<string>('')
  const [records, setRecords] = useState<RuntimeInvestmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [investor, groups] = await Promise.all([
          fetchApiJson<InvestorResponse>(`/api/investor/${slug}`),
          fetchApiJson<TrackRecordApiGroup[]>(`/api/investor/${slug}/track-record`),
        ])

        const symbols = investor.holdings
          .map((holding) => holding.ticker)
          .filter((ticker): ticker is string => Boolean(ticker) && !/^\d{5,}/.test(ticker!))
        const prices = await fetchPriceMap(symbols)
        const runtimeRecords = buildRuntimeTrackRecords(groups, prices).map((record) => ({
          ...record,
          timeline: record.timeline.length > 24 ? record.timeline.slice(-24) : record.timeline,
        }))

        if (!cancelled) {
          setInvestorName(investor.name)
          setRecords(runtimeRecords)
          setLoading(false)
        }
      } catch (error) {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message.toLowerCase() : ''
        setNotFound(message.includes('404') || message.includes('not found'))
        setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [slug])

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
        Loading track record...
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center">
        <h1 className="text-xl font-bold text-gray-900">Track record not found</h1>
        <Link href="/investors" className="mt-4 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-800">
          Back to investors
        </Link>
      </div>
    )
  }

  const currentHoldings = records.filter((record) => record.is_current).slice(0, 50)
  const exitedPositions = records.filter((record) => !record.is_current).slice(0, 100)
  const maxCurrentValue = currentHoldings.length > 0
    ? Math.max(...currentHoldings.map((record) => record.current_value_thousands ?? 0))
    : 1
  const totalPositions = records.length
  const avgHoldingPeriod = records.length > 0
    ? records.reduce((sum, record) => sum + record.holding_period_quarters, 0) / records.length
    : 0
  const withReturns = records.filter((record) => record.price_return_pct != null)
  const winners = withReturns.filter((record) => (record.price_return_pct ?? 0) > 0)
  const winRate = withReturns.length > 0 ? (winners.length / withReturns.length) * 100 : null
  const avgReturn = withReturns.length > 0
    ? withReturns.reduce((sum, record) => sum + (record.price_return_pct ?? 0), 0) / withReturns.length
    : null
  const bestPerformer = withReturns.length > 0
    ? withReturns.reduce((best, record) => (record.price_return_pct ?? -Infinity) > (best.price_return_pct ?? -Infinity) ? record : best)
    : null
  const worstPerformer = withReturns.length > 0
    ? withReturns.reduce((worst, record) => (record.price_return_pct ?? Infinity) < (worst.price_return_pct ?? Infinity) ? record : worst)
    : null

  return (
    <div className="space-y-8">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-900 transition">Home</Link>
        <span className="text-gray-300">/</span>
        <Link href="/investors" className="hover:text-gray-900 transition">Investors</Link>
        <span className="text-gray-300">/</span>
        <Link href={`/investors/${slug}`} className="hover:text-gray-900 transition">{investorName}</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900 font-medium">Track Record</span>
      </nav>

      <header className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-8 sm:px-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
          {investorName}&apos;s Track Record
        </h1>
        <p className="mt-2 text-base text-gray-500">
          Complete investment history across {totalPositions} positions
          {avgHoldingPeriod > 0 && (
            <> &middot; Average holding period: {formatHoldingPeriod(Math.round(avgHoldingPeriod))}</>
          )}
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCard value={totalPositions.toString()} label="Total Positions" />
        <StatCard value={currentHoldings.length.toString()} label="Current" />
        <StatCard value={exitedPositions.length.toString()} label="Exited" />
        <StatCard value={avgHoldingPeriod > 0 ? formatHoldingPeriod(Math.round(avgHoldingPeriod)) : '--'} label="Avg Holding" />
        <StatCard
          value={winRate != null ? `${winRate.toFixed(0)}%` : '--'}
          label={`Win Rate${withReturns.length > 0 ? ` (${withReturns.length})` : ''}`}
          valueClass={winRate != null ? (winRate >= 50 ? 'text-green-600' : 'text-red-500') : undefined}
        />
        <StatCard
          value={avgReturn != null ? `${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(0)}%` : '--'}
          label="Avg Return"
          valueClass={avgReturn != null ? (avgReturn >= 0 ? 'text-green-600' : 'text-red-500') : undefined}
        />
        <StatCard
          value={bestPerformer ? `${(bestPerformer.price_return_pct ?? 0) >= 0 ? '+' : ''}${bestPerformer.price_return_pct?.toFixed(0)}%` : '--'}
          label={bestPerformer ? `Best: ${bestPerformer.ticker}` : 'Best'}
          valueClass={bestPerformer ? 'text-green-600' : undefined}
        />
        <StatCard
          value={worstPerformer ? `${(worstPerformer.price_return_pct ?? 0) >= 0 ? '+' : ''}${worstPerformer.price_return_pct?.toFixed(0)}%` : '--'}
          label={worstPerformer ? `Worst: ${worstPerformer.ticker}` : 'Worst'}
          valueClass={worstPerformer ? ((worstPerformer.price_return_pct ?? 0) >= 0 ? 'text-green-600' : 'text-red-500') : undefined}
        />
      </div>

      {currentHoldings.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-900">Current Holdings</h2>
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-indigo-100 text-indigo-700">
              {currentHoldings.length}
            </span>
          </div>
          <div className="space-y-4">
            {currentHoldings.map((record) => (
              <PositionCard key={`${record.ticker}-${record.first_seen_quarter}`} record={record} slug={slug} maxValue={maxCurrentValue} />
            ))}
          </div>
        </section>
      )}

      {exitedPositions.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-900">Exited Positions</h2>
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-gray-100 text-gray-600">
              {exitedPositions.length}
            </span>
          </div>
          <div className="space-y-4">
            {exitedPositions.map((record) => (
              <PositionCard key={`${record.ticker}-${record.last_seen_quarter}`} record={record} slug={slug} maxValue={0} />
            ))}
          </div>
        </section>
      )}

      {records.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center">
          <p className="text-gray-500">No filing history available for this investor.</p>
        </div>
      )}

      <div className="pt-4 pb-8">
        <Link
          href={`/investors/${slug}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition"
        >
          Back to {investorName}
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-3 py-3 text-center">
      <p className={`text-xl font-extrabold ${valueClass || 'text-gray-900'}`}>{value}</p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-1 leading-tight">{label}</p>
    </div>
  )
}

function PositionCard({
  record,
  slug,
  maxValue,
}: {
  record: RuntimeInvestmentRecord
  slug: string
  maxValue: number
}) {
  const returnInfo = formatReturn(record.price_return_pct)
  const annualizedInfo = formatReturn(record.annualized_return_pct)
  const effectiveEntry = record.weighted_avg_entry_price ?? record.estimated_entry_price
  const effectiveExitOrCurrent = record.is_current ? record.current_price : record.exit_price
  const weightBarPct = record.is_current && maxValue > 0
    ? Math.max(((record.current_value_thousands ?? 0) / maxValue) * 100, 2)
    : 0
  const convictionHref = getConvictionHref(slug, record.ticker)
  const keyDecisions = record.timeline.filter((entry) => entry.action !== 'HELD')
  const totalHeldQuarters = record.timeline.filter((entry) => entry.action === 'HELD').length
  const maxWeight = Math.max(...record.timeline.map((entry) => entry.weight_pct), 1)
  const borderColor = record.price_return_pct != null
    ? record.price_return_pct >= 0 ? 'border-l-green-500' : 'border-l-red-400'
    : 'border-l-gray-300'

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 border-l-4 ${borderColor} overflow-hidden`}>
      <div className="px-5 py-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-shrink-0 sm:w-44">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-extrabold text-gray-900">{displayTicker(record.ticker, record.company_name)}</span>
              {convictionHref && (
                <Link
                  href={convictionHref}
                  className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-200 transition"
                >
                  Deep Dive
                </Link>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5 leading-tight">{record.company_name}</p>
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
              <span>{record.first_seen_quarter}</span>
              <span className="text-gray-300">→</span>
              <span>{record.is_current ? 'Present' : record.last_seen_quarter}</span>
              <span className="text-gray-300">&middot;</span>
              <span>{formatHoldingPeriod(record.holding_period_quarters)}</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {record.is_current && weightBarPct > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Portfolio Weight</span>
                  <span className="font-mono text-xs font-semibold text-gray-700">
                    {(record.current_weight_pct ?? 0).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(weightBarPct, 100)}%` }} />
                </div>
              </div>
            )}

            <div className="flex items-end gap-px h-10 mb-1">
              {record.timeline.map((entry, index) => {
                const heightPct = Math.max((entry.weight_pct / maxWeight) * 100, 3)
                let barColor = 'bg-gray-200'
                if (entry.action === 'NEW') barColor = 'bg-green-500'
                else if (entry.action === 'INCREASED') barColor = 'bg-blue-500'
                else if (entry.action === 'DECREASED') barColor = 'bg-orange-400'

                return (
                  <div
                    key={index}
                    className="flex-1 min-w-0"
                    title={`${entry.quarter}: ${entry.weight_pct.toFixed(1)}% weight | ${formatShareCount(entry.shares)} shares | ${entry.action}${entry.estimated_price ? ` | ~${formatPrice(entry.estimated_price)}/sh` : ''}`}
                  >
                    <div className={`w-full rounded-t-sm ${barColor}`} style={{ height: `${heightPct}%`, minHeight: '2px' }} />
                  </div>
                )
              })}
            </div>
            <div className="flex gap-px text-[8px] text-gray-400">
              {record.timeline.map((entry, index) => (
                <div key={index} className="flex-1 min-w-0 text-center truncate">
                  {(index === 0 || index === record.timeline.length - 1 || (record.timeline.length > 6 && index === Math.floor(record.timeline.length / 2)))
                    ? entry.quarter.replace('20', "'")
                    : ''}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-shrink-0 sm:w-52">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <span className="text-[11px] text-gray-400">Avg Entry</span>
              <span className="font-mono text-[11px] text-gray-700 text-right">{formatPrice(effectiveEntry)}</span>
              <span className="text-[11px] text-gray-400">{record.is_current ? 'Current' : 'Exit Est.'}</span>
              <span className="font-mono text-[11px] text-gray-700 text-right">{formatPrice(effectiveExitOrCurrent)}</span>
              <div className="col-span-2 border-t border-gray-100" />
              <span className="text-[11px] text-gray-400">Return</span>
              <span className={`font-mono text-[11px] text-right ${returnInfo.className}`}>{returnInfo.text}</span>
              <span className="text-[11px] text-gray-400">Annualized</span>
              <span className={`font-mono text-[11px] text-right ${annualizedInfo.className}`}>{annualizedInfo.text}</span>
              <div className="col-span-2 border-t border-gray-100" />
              <span className="text-[11px] text-gray-400">{record.is_current ? 'Value' : 'Peak Value'}</span>
              <span className="font-mono text-[11px] text-gray-700 text-right">
                {record.is_current && record.current_value_thousands != null
                  ? formatValueFromThousands(record.current_value_thousands)
                  : formatValueFromThousands(record.peak_value_thousands)}
              </span>
              <span className="text-[11px] text-gray-400">{record.is_current ? 'Weight' : 'Peak Weight'}</span>
              <span className="font-mono text-[11px] text-gray-700 text-right">
                {record.is_current && record.current_weight_pct != null
                  ? `${record.current_weight_pct.toFixed(1)}%`
                  : `${record.peak_weight_pct.toFixed(1)}%`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {keyDecisions.length > 0 && (
        <div className="border-t border-gray-100 px-5 py-3 sm:px-6 bg-gray-50/50">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2 font-medium">
            Decision Timeline
            {totalHeldQuarters > 0 && (
              <span className="text-gray-300 font-normal"> &middot; {totalHeldQuarters} quarters held unchanged</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {keyDecisions.map((entry, index) => (
              <DecisionChip key={index} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DecisionChip({ entry }: { entry: RuntimeTimelineEntry }) {
  const badge = getActionBadge(entry.action)
  const shareDeltaAbs = Math.abs(entry.share_delta)

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] ${badge.className}`}>
      <span className="font-bold">{badge.label}</span>
      <span className="opacity-70">{entry.quarter.replace('20', "'")}</span>
      {entry.shares > 0 && (
        <span className="opacity-60 font-mono">{formatShareCount(entry.shares)}sh</span>
      )}
      {shareDeltaAbs > 0 && entry.action !== 'NEW' && (
        <span className="opacity-60 font-mono">
          {entry.share_delta > 0 ? '+' : '-'}{formatShareCount(shareDeltaAbs)}
        </span>
      )}
      {entry.estimated_price != null && (
        <span className="opacity-60 font-mono">@~{formatPrice(entry.estimated_price)}</span>
      )}
      {entry.estimated_tx_cost != null && entry.action !== 'HELD' && (
        <span className="opacity-50 font-mono">({formatCost(entry.estimated_tx_cost)})</span>
      )}
    </div>
  )
}
