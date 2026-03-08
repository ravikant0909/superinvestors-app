'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

// ─── Types (mirrored from server) ───────────────────────────────────────────

interface ScoredChange {
  investor_key: string
  investor_name: string
  investor_slug: string
  investor_firm: string
  ticker: string
  security_name: string
  change_type: string
  value_delta: number
  share_delta: number
  current_value: number
  previous_value: number
  current_quarter: string
  previous_quarter: string
  combined_score: number
  verdict: string
  weight_impact: number
  importance_score: number
}

interface CurrentPriceData {
  price: number
  prev_close: number
}

type TabView = 'top' | 'by-investor'
type ChangeFilter = 'ALL' | 'NEW' | 'INCREASED' | 'DECREASED' | 'SOLD_OUT'

// ─── Style Helpers ──────────────────────────────────────────────────────────

function changeBadgeClass(changeType: string): string {
  switch (changeType?.toUpperCase()) {
    case 'NEW':
      return 'bg-green-100 text-green-700 border border-green-300'
    case 'INCREASED':
      return 'bg-blue-100 text-blue-700 border border-blue-300'
    case 'DECREASED':
      return 'bg-orange-100 text-orange-700 border border-orange-300'
    case 'SOLD_OUT':
      return 'bg-red-100 text-red-700 border border-red-300'
    default:
      return 'bg-gray-100 text-gray-700 border border-gray-300'
  }
}

function changeLabel(changeType: string): string {
  switch (changeType?.toUpperCase()) {
    case 'NEW': return 'NEW'
    case 'INCREASED': return 'INCREASED'
    case 'DECREASED': return 'DECREASED'
    case 'SOLD_OUT': return 'SOLD'
    default: return changeType?.toUpperCase() ?? ''
  }
}

function verdictBadgeClass(verdict: string): string {
  switch (verdict) {
    case 'FOLLOW': return 'bg-green-100 text-green-700 border border-green-300'
    case 'WATCH': return 'bg-yellow-100 text-yellow-700 border border-yellow-300'
    case 'SKIP': return 'bg-red-100 text-red-700 border border-red-300'
    default: return 'bg-gray-100 text-gray-700 border border-gray-300'
  }
}

function scoreColorClass(score: number): string {
  if (score >= 8) return 'text-green-600'
  if (score >= 7) return 'text-blue-600'
  if (score >= 6) return 'text-yellow-600'
  if (score >= 5) return 'text-orange-500'
  return 'text-red-500'
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatValueFromThousands(thousands: number): string {
  if (thousands == null) return '--'
  const abs = Math.abs(thousands)
  if (abs >= 1_000_000_000) return `$${(thousands / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `$${(thousands / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(thousands / 1_000).toFixed(1)}K`
  return `$${thousands}`
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ChangesClient({
  changes,
  currentPrices,
}: {
  changes: ScoredChange[]
  currentPrices: Record<string, CurrentPriceData>
}) {
  const [tab, setTab] = useState<TabView>('top')
  const [filter, setFilter] = useState<ChangeFilter>('ALL')
  const [expandedInvestors, setExpandedInvestors] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    if (filter === 'ALL') return changes
    return changes.filter(c => c.change_type === filter)
  }, [changes, filter])

  // Group by investor for "By Investor" tab, sorted by combined_score
  const byInvestor = useMemo(() => {
    const map = new Map<string, { name: string; slug: string; firm: string; score: number; verdict: string; changes: ScoredChange[] }>()
    for (const c of filtered) {
      const existing = map.get(c.investor_slug)
      if (existing) {
        existing.changes.push(c)
      } else {
        map.set(c.investor_slug, {
          name: c.investor_name,
          slug: c.investor_slug,
          firm: c.investor_firm,
          score: c.combined_score,
          verdict: c.verdict,
          changes: [c],
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.score - a.score)
  }, [filtered])

  const filterCounts = useMemo(() => ({
    ALL: changes.length,
    NEW: changes.filter(c => c.change_type === 'NEW').length,
    INCREASED: changes.filter(c => c.change_type === 'INCREASED').length,
    DECREASED: changes.filter(c => c.change_type === 'DECREASED').length,
    SOLD_OUT: changes.filter(c => c.change_type === 'SOLD_OUT').length,
  }), [changes])

  const filterPills: { key: ChangeFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'NEW', label: 'New' },
    { key: 'INCREASED', label: 'Increased' },
    { key: 'DECREASED', label: 'Decreased' },
    { key: 'SOLD_OUT', label: 'Sold' },
  ]

  function toggleInvestor(slug: string) {
    setExpandedInvestors(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  const pillStyle = (key: ChangeFilter) => {
    const active = filter === key
    const base = 'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer'
    if (active) {
      switch (key) {
        case 'NEW': return `${base} bg-green-100 text-green-800 border border-green-300`
        case 'INCREASED': return `${base} bg-blue-100 text-blue-800 border border-blue-300`
        case 'DECREASED': return `${base} bg-orange-100 text-orange-800 border border-orange-300`
        case 'SOLD_OUT': return `${base} bg-red-100 text-red-800 border border-red-300`
        default: return `${base} bg-gray-900 text-white`
      }
    }
    return `${base} bg-white text-gray-600 border border-gray-200 hover:bg-gray-50`
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('top')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${
            tab === 'top' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Top Changes
        </button>
        <button
          onClick={() => setTab('by-investor')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${
            tab === 'by-investor' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          By Investor
        </button>
      </div>

      {/* Filter Pills */}
      <div className="flex gap-2 flex-wrap">
        {filterPills.map(pill => (
          <button
            key={pill.key}
            onClick={() => setFilter(pill.key)}
            className={pillStyle(pill.key)}
          >
            {pill.label} <span className="ml-1 opacity-70">({filterCounts[pill.key]})</span>
          </button>
        ))}
      </div>

      {/* Results Count */}
      {filtered.length !== changes.length && (
        <p className="text-sm text-gray-400">
          Showing {filtered.length} of {changes.length} changes
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">No changes match your filter.</p>
          <p className="mt-1 text-sm">Try selecting a different filter.</p>
        </div>
      ) : tab === 'top' ? (
        /* ─── Top Changes View ─────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((change, idx) => (
            <div
              key={`${change.investor_key}-${change.ticker}-${idx}`}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              {/* Header: Investor name + score + verdict */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Link
                    href={`/investors/${change.investor_slug}`}
                    className="text-sm font-semibold text-gray-900 hover:text-blue-700 truncate"
                  >
                    {change.investor_name}
                  </Link>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${verdictBadgeClass(change.verdict)}`}>
                    {change.verdict}
                  </span>
                </div>
                <span className={`text-sm font-bold tabular-nums ${scoreColorClass(change.combined_score)}`}>
                  {change.combined_score.toFixed(1)}
                </span>
              </div>

              {/* Ticker + Change Type */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${changeBadgeClass(change.change_type)}`}>
                  {changeLabel(change.change_type)}
                </span>
                <span className="font-mono font-bold text-base text-gray-800">
                  {/^\d{5,}/.test(change.ticker) ? titleCase(change.security_name).split(' ').slice(0, 3).join(' ') : change.ticker}
                </span>
                {(() => {
                  const p = currentPrices[change.ticker]
                  if (!p) return null
                  return (
                    <span className="font-mono text-sm text-gray-700">
                      ${p.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {p.prev_close > 0 && (
                        <span className={`ml-0.5 text-xs ${p.price >= p.prev_close ? 'text-green-600' : 'text-red-500'}`}>
                          {p.price >= p.prev_close ? '\u25B2' : '\u25BC'}
                        </span>
                      )}
                    </span>
                  )
                })()}
              </div>

              {/* Security Name */}
              <p className="text-xs text-gray-400 mb-3 truncate">
                {titleCase(change.security_name)}
              </p>

              {/* Value Delta + Weight Impact */}
              <div className="flex items-end justify-between">
                <div>
                  <span className={`text-lg font-bold ${change.value_delta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {change.value_delta > 0 ? '+' : ''}{formatValueFromThousands(change.value_delta)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-400">Weight Impact</span>
                  <p className="text-sm font-semibold text-gray-700">
                    {(change.weight_impact * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ─── By Investor View (Accordion) ─────────────────────── */
        <div className="space-y-3">
          {byInvestor.map(investor => {
            const isExpanded = expandedInvestors.has(investor.slug)
            return (
              <div
                key={investor.slug}
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
              >
                {/* Accordion Header */}
                <button
                  onClick={() => toggleInvestor(investor.slug)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-lg font-bold tabular-nums ${scoreColorClass(investor.score)}`}>
                      {investor.score.toFixed(1)}
                    </span>
                    <div className="text-left min-w-0">
                      <span className="text-sm font-semibold text-gray-900 truncate block">
                        {investor.name}
                      </span>
                      <span className="text-xs text-gray-400">{investor.firm}</span>
                    </div>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${verdictBadgeClass(investor.verdict)}`}>
                      {investor.verdict}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400">
                      {investor.changes.length} change{investor.changes.length !== 1 ? 's' : ''}
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <ul className="border-t border-gray-100 divide-y divide-gray-50">
                    {investor.changes.map((change, idx) => (
                      <li
                        key={`${change.ticker}-${idx}`}
                        className="px-5 py-3 hover:bg-gray-50 transition"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${changeBadgeClass(change.change_type)}`}>
                              {changeLabel(change.change_type)}
                            </span>
                            <span className="font-mono font-bold text-sm text-gray-800">
                              {/^\d{5,}/.test(change.ticker) ? titleCase(change.security_name).split(' ').slice(0, 3).join(' ') : change.ticker}
                            </span>
                            {(() => {
                              const p = currentPrices[change.ticker]
                              if (!p) return null
                              return (
                                <span className="font-mono text-xs text-gray-600 hidden sm:inline">
                                  ${p.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  {p.prev_close > 0 && (
                                    <span className={`ml-0.5 ${p.price >= p.prev_close ? 'text-green-600' : 'text-red-500'}`}>
                                      {p.price >= p.prev_close ? '\u25B2' : '\u25BC'}
                                    </span>
                                  )}
                                </span>
                              )
                            })()}
                            <span className="text-xs text-gray-400 truncate hidden sm:inline">
                              {titleCase(change.security_name)}
                            </span>
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-3">
                            <span className="text-xs text-gray-400">
                              {(change.weight_impact * 100).toFixed(1)}%
                            </span>
                            <span className={`text-sm font-semibold ${change.value_delta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {change.value_delta > 0 ? '+' : ''}{formatValueFromThousands(change.value_delta)}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
