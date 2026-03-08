'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { InvestorCard } from './page'

type VerdictFilter = 'ALL' | 'FOLLOW' | 'WATCH' | 'SKIP'
type SortOption = 'score' | 'name'

const SCORE_DIMENSION_LABELS: Record<string, string> = {
  philosophy_alignment: 'Philosophy',
  concentration: 'Concentration',
  rationality: 'Rationality',
  integrity: 'Integrity',
  track_record: 'Track Record',
  transparency: 'Transparency',
  relevance: 'Relevance',
  agi_awareness: 'AGI Awareness',
}

function getScoreColorClass(score: number): string {
  if (score >= 8.0) return 'text-green-600'
  if (score >= 7.0) return 'text-blue-600'
  if (score >= 6.0) return 'text-yellow-600'
  if (score >= 5.0) return 'text-orange-500'
  return 'text-red-500'
}

function getScoreBgClass(score: number): string {
  if (score >= 8.0) return 'bg-green-50 text-green-700 border-green-200'
  if (score >= 7.0) return 'bg-blue-50 text-blue-700 border-blue-200'
  if (score >= 6.0) return 'bg-yellow-50 text-yellow-700 border-yellow-200'
  if (score >= 5.0) return 'bg-orange-50 text-orange-700 border-orange-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

function getVerdictStyle(verdict: string): string {
  switch (verdict) {
    case 'FOLLOW':
      return 'bg-green-100 text-green-700 border border-green-300'
    case 'WATCH':
      return 'bg-yellow-100 text-yellow-700 border border-yellow-300'
    case 'SKIP':
      return 'bg-red-100 text-red-700 border border-red-300'
    default:
      return 'bg-gray-100 text-gray-700 border border-gray-300'
  }
}

function getTopDimensions(
  scores: InvestorCard['scores'],
  count: number = 3
): { key: string; label: string; value: number }[] {
  return Object.entries(scores)
    .map(([key, value]) => ({
      key,
      label: SCORE_DIMENSION_LABELS[key] || key,
      value,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trimEnd() + '...'
}

export default function InvestorsClient({
  investors,
}: {
  investors: InvestorCard[]
}) {
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>('ALL')
  const [sortOption, setSortOption] = useState<SortOption>('score')
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = useMemo(() => {
    let result = [...investors]

    // Filter by verdict
    if (verdictFilter !== 'ALL') {
      result = result.filter((inv) => inv.verdict === verdictFilter)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (inv) =>
          inv.name.toLowerCase().includes(q) ||
          inv.firm.toLowerCase().includes(q)
      )
    }

    // Sort
    if (sortOption === 'score') {
      result.sort((a, b) => b.combined - a.combined)
    } else {
      result.sort((a, b) => a.name.localeCompare(b.name))
    }

    return result
  }, [investors, verdictFilter, sortOption, searchQuery])

  const counts = useMemo(() => {
    const base = searchQuery.trim()
      ? investors.filter((inv) => {
          const q = searchQuery.toLowerCase().trim()
          return (
            inv.name.toLowerCase().includes(q) ||
            inv.firm.toLowerCase().includes(q)
          )
        })
      : investors

    return {
      ALL: base.length,
      FOLLOW: base.filter((i) => i.verdict === 'FOLLOW').length,
      WATCH: base.filter((i) => i.verdict === 'WATCH').length,
      SKIP: base.filter((i) => i.verdict === 'SKIP').length,
    }
  }, [investors, searchQuery])

  const filterTabs: { key: VerdictFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'FOLLOW', label: 'Follow' },
    { key: 'WATCH', label: 'Watch' },
    { key: 'SKIP', label: 'Skip' },
  ]

  const tabStyle = (key: VerdictFilter) => {
    const active = verdictFilter === key
    const base =
      'px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer'
    if (active) {
      switch (key) {
        case 'FOLLOW':
          return `${base} bg-green-100 text-green-800 border border-green-300`
        case 'WATCH':
          return `${base} bg-yellow-100 text-yellow-800 border border-yellow-300`
        case 'SKIP':
          return `${base} bg-red-100 text-red-800 border border-red-300`
        default:
          return `${base} bg-gray-900 text-white`
      }
    }
    return `${base} bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:text-gray-900`
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          All Investors ({investors.length})
        </h1>
        <p className="mt-2 text-gray-500 text-sm">
          Ranked by combined score across philosophy alignment, concentration,
          rationality, integrity, track record, transparency, relevance, and AGI
          awareness.
        </p>
      </div>

      {/* Controls Bar */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setVerdictFilter(tab.key)}
              className={tabStyle(tab.key)}
            >
              {tab.label}{' '}
              <span className="ml-1 opacity-70">({counts[tab.key]})</span>
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Sort + Search */}
        <div className="flex gap-3 items-center">
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            <option value="score">Sort: Score</option>
            <option value="name">Sort: Name</option>
          </select>
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search name or firm..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2 bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 w-56"
            />
          </div>
        </div>
      </div>

      {/* Results Count */}
      {filtered.length !== investors.length && (
        <p className="text-sm text-gray-400 mb-4">
          Showing {filtered.length} of {investors.length} investors
        </p>
      )}

      {/* Card Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">No investors match your filters.</p>
          <p className="mt-1 text-sm">Try adjusting your search or filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((inv) => {
            const topDims = getTopDimensions(inv.scores, 3)
            return (
              <Link
                key={inv.slug}
                href={`/investors/${inv.slug}`}
                className="block bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-gray-300 transition-all group"
              >
                {/* Top Row: Name + Score */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors truncate">
                      {inv.name}
                    </h2>
                    <p className="text-sm text-gray-500 truncate">{inv.firm}</p>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span
                      className={`text-2xl font-bold tabular-nums ${getScoreColorClass(inv.combined)}`}
                    >
                      {inv.combined.toFixed(1)}
                    </span>
                  </div>
                </div>

                {/* Verdict Badge */}
                <div className="mb-3">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${getVerdictStyle(inv.verdict)}`}
                  >
                    {inv.verdict}
                  </span>
                </div>

                {/* Summary */}
                <p className="text-sm text-gray-600 leading-relaxed mb-4 line-clamp-2">
                  {truncate(inv.one_line_summary, 160)}
                </p>

                {/* Top Score Dimensions */}
                <div className="flex flex-wrap gap-1.5">
                  {topDims.map((dim) => (
                    <span
                      key={dim.key}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getScoreBgClass(dim.value)}`}
                    >
                      {dim.label}
                      <span className="font-bold">{dim.value}</span>
                    </span>
                  ))}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
