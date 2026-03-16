'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchApiJson, fetchPriceMap } from '@/lib/api'
import { getConvictionHref } from '@/lib/conviction-index'

interface HolderInfo {
  investor_name: string
  investor_slug: string
  investor_firm: string
  verdict_follow: string | null
  investor_score: number | null
  weight_pct: number
  value_thousands: number
}

interface RecentActivity {
  investor_name: string
  investor_slug: string
  change_type: 'NEW' | 'INCREASED'
  shares_change_pct: number | null
  quarter: string
}

interface BestIdea {
  security_id: number
  ticker: string
  name: string
  security_slug: string
  sector: string | null
  holder_count: number
  avg_weight: number
  total_value: number
  avg_investor_score: number
  composite_score: number
  holders: HolderInfo[]
  recent_activity: RecentActivity[]
}

const INDEX_ETFS = new Set([
  'QQQ', 'SPY', 'IVV', 'VOO', 'VTI', 'IWM', 'DIA', 'EFA', 'VEA',
  'VWO', 'EEM', 'AGG', 'BND', 'TLT', 'GLD', 'SLV', 'XLF', 'XLK',
  'XLE', 'XLV', 'XLI', 'XLP', 'XLU', 'XLY', 'XLB', 'XLRE', 'XLC',
  'ARKK', 'ARKW', 'ARKG', 'ARKF', 'ARKQ', 'VIG', 'VYM', 'SCHD',
  'IEFA', 'IEMG', 'IJR', 'IJH', 'MDY', 'RSP',
])

function isNoiseTicker(ticker: string): boolean {
  if (INDEX_ETFS.has(ticker)) return true
  if (/-P[A-Z]?$/.test(ticker) || /-WT$/.test(ticker)) return true
  if (/\/P[A-Z]?$/.test(ticker) || /\/WT$/.test(ticker)) return true
  if (/^\d{5,}/.test(ticker)) return true
  if (/^\w?\d{6,}/.test(ticker)) return true
  if (/^[A-Z]\d{4,}[A-Z]?\d*$/.test(ticker)) return true
  return false
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}B`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}M`
  return `$${value.toFixed(0)}K`
}

function formatQuarter(quarter: string): string {
  const parts = quarter.split('-')
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`
  return quarter
}

function ScoreBar({ value, max = 1, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function BestIdeasClient() {
  const [ideas, setIdeas] = useState<BestIdea[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await fetchApiJson<BestIdea[]>('/api/best-ideas')
        const filtered = data.filter((idea) => !isNoiseTicker(idea.ticker))
        if (cancelled) return
        setIdeas(filtered)
        const priceMap = await fetchPriceMap(filtered.map((idea) => idea.ticker))
        if (!cancelled) {
          setPrices(priceMap)
        }
      } finally {
        if (!cancelled) {
          setLoaded(true)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  const summary = useMemo(() => {
    const totalUniqueInvestors = new Set(ideas.flatMap((idea) => idea.holders.map((holder) => holder.investor_slug))).size
    return {
      totalUniqueInvestors,
      topScore: ideas[0]?.composite_score ?? 0,
      withRecentActivity: ideas.filter((idea) => idea.recent_activity.length > 0).length,
    }
  }, [ideas])

  if (!loaded) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-8 text-center text-sm text-gray-400">
        Loading best ideas...
      </div>
    )
  }

  if (ideas.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
        No runtime best-ideas data is available yet.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard value={ideas.length.toString()} label="Best Ideas" />
        <StatCard value={summary.totalUniqueInvestors.toString()} label="Investors" />
        <StatCard value={summary.topScore.toFixed(1)} label="Top Score" valueClass="text-indigo-600" />
        <StatCard value={summary.withRecentActivity.toString()} label="Recent Activity" />
      </section>

      <div className="grid gap-5">
        {ideas.map((idea, index) => (
          <div key={idea.security_id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
                <div className="flex items-start gap-3">
                  <span className={`flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold flex-shrink-0 ${
                    index < 3 ? 'bg-indigo-600 text-white' : index < 10 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {index + 1}
                  </span>
                  <div>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xl font-bold font-mono text-gray-900">{idea.ticker}</span>
                      <span className="text-sm text-gray-500">{idea.name}</span>
                    </div>
                    {prices[idea.ticker] != null && (
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="font-mono text-sm font-medium text-gray-800">{prices[idea.ticker].toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="text-2xl font-extrabold text-indigo-600">{idea.composite_score.toFixed(1)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Score</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-[11px]">
                <div>
                  <div className="flex justify-between text-gray-500 mb-0.5">
                    <span>Holders</span>
                    <span className="font-medium text-gray-700">{idea.holder_count}</span>
                  </div>
                  <ScoreBar value={idea.holder_count} max={Math.max(idea.holder_count, 10)} color="bg-indigo-500" />
                </div>
                <div>
                  <div className="flex justify-between text-gray-500 mb-0.5">
                    <span>Avg Weight</span>
                    <span className="font-medium text-gray-700">{idea.avg_weight.toFixed(1)}%</span>
                  </div>
                  <ScoreBar value={idea.avg_weight} max={Math.max(idea.avg_weight, 20)} color="bg-blue-500" />
                </div>
                <div>
                  <div className="flex justify-between text-gray-500 mb-0.5">
                    <span>Avg Quality</span>
                    <span className="font-medium text-gray-700">{idea.avg_investor_score.toFixed(1)}</span>
                  </div>
                  <ScoreBar value={idea.avg_investor_score} max={10} color="bg-emerald-500" />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 px-5 py-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">
                Holders ({idea.holder_count}) &middot; Avg Weight {idea.avg_weight.toFixed(1)}% &middot; Total Value {formatValue(idea.total_value)}
              </div>
              <div className="space-y-2">
                {idea.holders.map((holder) => {
                  const maxWeight = Math.max(...idea.holders.map((candidate) => candidate.weight_pct))
                  const barPct = maxWeight > 0 ? (holder.weight_pct / maxWeight) * 100 : 0
                  const convictionHref = getConvictionHref(holder.investor_slug, idea.ticker)

                  return (
                    <div key={`${idea.security_id}-${holder.investor_slug}`} className="flex items-center gap-3">
                      <Link href={`/investors/${holder.investor_slug}`} className="text-sm font-medium text-gray-800 hover:text-indigo-600 transition w-36 sm:w-44 truncate flex-shrink-0">
                        {holder.investor_name}
                      </Link>
                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        <div className="flex-1 h-2 bg-gray-50 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              holder.weight_pct >= 10 ? 'bg-indigo-500' : holder.weight_pct >= 5 ? 'bg-indigo-400' : 'bg-indigo-200'
                            }`}
                            style={{ width: `${Math.min(barPct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-gray-600 w-12 text-right flex-shrink-0">
                          {holder.weight_pct.toFixed(1)}%
                        </span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                          (holder.investor_score ?? 0) >= 8 ? 'bg-green-50 text-green-700' :
                          (holder.investor_score ?? 0) >= 7 ? 'bg-blue-50 text-blue-700' :
                          (holder.investor_score ?? 0) >= 6 ? 'bg-yellow-50 text-yellow-700' :
                          'bg-gray-50 text-gray-500'
                        }`}>
                          {(holder.investor_score ?? 0).toFixed(1)}
                        </span>
                        {convictionHref && (
                          <Link href={convictionHref} className="text-[10px] font-medium text-purple-700 hover:text-purple-900">
                            Deep dive
                          </Link>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {idea.recent_activity.length > 0 && (
              <div className="border-t border-gray-100 px-5 py-3 flex flex-wrap items-center gap-2">
                {idea.recent_activity.map((activity, activityIndex) => (
                  <span
                    key={`${idea.security_id}-${activity.investor_slug}-${activityIndex}`}
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                      activity.change_type === 'NEW' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${activity.change_type === 'NEW' ? 'bg-green-500' : 'bg-blue-500'}`} />
                    {activity.investor_name}{' '}
                    {activity.change_type === 'NEW'
                      ? 'added'
                      : activity.shares_change_pct != null
                      ? `increased ${Math.abs(activity.shares_change_pct).toFixed(0)}%`
                      : 'increased'}
                    {' in '}
                    {formatQuarter(activity.quarter)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-5">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Methodology</h3>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          The runtime version ranks ideas using current holder overlap, average portfolio weight, and average investor quality from the D1-backed API.
          We filter out obvious index ETFs, preferred shares, warrants, and unresolved CUSIP-style tickers.
        </p>
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 text-center">
      <p className={`text-2xl sm:text-3xl font-extrabold text-gray-900 ${valueClass ?? ''}`}>{value}</p>
      <p className="mt-1 text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-wide">{label}</p>
    </div>
  )
}
