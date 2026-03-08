import Link from 'next/link'
import type { Metadata } from 'next'
import { getAllChanges, formatValueFromThousands, formatShares } from '@/lib/portfolio-data'
import type { AggregatedChange } from '@/lib/portfolio-data'

export const metadata: Metadata = {
  title: 'Latest Position Changes — SuperInvestors',
  description:
    'Track quarter-over-quarter 13F filing changes from the world\'s best investors. See new positions, increases, decreases, and exits in real time.',
  keywords: [
    '13F filings',
    'position changes',
    'super investors',
    'portfolio changes',
    'value investing',
  ],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function changeLabel(changeType: string): string {
  switch (changeType?.toUpperCase()) {
    case 'NEW':
      return 'NEW'
    case 'INCREASED':
      return 'INCREASED'
    case 'DECREASED':
      return 'DECREASED'
    case 'SOLD_OUT':
      return 'SOLD'
    default:
      return changeType?.toUpperCase() ?? ''
  }
}

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

function quarterFromData(q: string): string {
  // Already formatted like "2025-Q4"
  return q || 'Unknown Quarter'
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ─── Data Loading ────────────────────────────────────────────────────────────

function loadData() {
  const changes = getAllChanges()
  return { changes, hasData: changes.length > 0 }
}

// ─── Group changes by quarter ────────────────────────────────────────────────

function groupByQuarter(changes: AggregatedChange[]): Map<string, AggregatedChange[]> {
  const groups = new Map<string, AggregatedChange[]>()
  for (const change of changes) {
    const key = quarterFromData(change.current_quarter)
    const list = groups.get(key) ?? []
    list.push(change)
    groups.set(key, list)
  }
  return groups
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function ChangesPage() {
  const data = loadData()
  const changes = data.changes
  const grouped = groupByQuarter(changes)

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-700">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">Changes</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
          Latest Position Changes
        </h1>
        <p className="mt-3 text-base sm:text-lg text-gray-500 max-w-3xl leading-relaxed">
          Quarter-over-quarter changes from 13F filings. Every time a super investor buys a new
          stock, increases a position, trims a holding, or exits entirely, it shows up here.
        </p>
      </div>

      {/* Data source banner */}
      {!data.hasData && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          No 13F data available yet. Run the data pipeline to fetch filings.
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className={`px-2 py-0.5 rounded font-bold ${changeBadgeClass('NEW')}`}>NEW</span>
        <span className={`px-2 py-0.5 rounded font-bold ${changeBadgeClass('INCREASED')}`}>INCREASED</span>
        <span className={`px-2 py-0.5 rounded font-bold ${changeBadgeClass('DECREASED')}`}>DECREASED</span>
        <span className={`px-2 py-0.5 rounded font-bold ${changeBadgeClass('SOLD_OUT')}`}>SOLD</span>
        <span className="text-gray-400 ml-1 self-center">
          &mdash; position action types from 13F filings
        </span>
      </div>

      {/* Summary Stats */}
      {data.hasData && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard
            label="New Positions"
            value={changes.filter((c) => c.change_type === 'NEW').length.toString()}
            color="text-green-600"
          />
          <SummaryCard
            label="Increases"
            value={changes.filter((c) => c.change_type === 'INCREASED').length.toString()}
            color="text-blue-600"
          />
          <SummaryCard
            label="Decreases"
            value={changes.filter((c) => c.change_type === 'DECREASED').length.toString()}
            color="text-orange-500"
          />
          <SummaryCard
            label="Full Exits"
            value={changes.filter((c) => c.change_type === 'SOLD_OUT').length.toString()}
            color="text-red-500"
          />
        </section>
      )}

      {/* Changes grouped by quarter */}
      {Array.from(grouped.entries()).map(([quarter, quarterChanges]) => (
        <section key={quarter}>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-900">{quarter}</h2>
            <span className="text-sm text-gray-400">
              {quarterChanges.length} change{quarterChanges.length !== 1 ? 's' : ''}
            </span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {quarterChanges.map((change, idx) => (
                <li key={`${change.investor_key}-${change.ticker}-${idx}`} className="px-5 py-4 hover:bg-gray-50 transition">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left side: investor + stock info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/investors/${change.investor_slug}`}
                          className="text-sm font-semibold text-gray-900 hover:text-blue-700 truncate"
                        >
                          {change.investor_name}
                        </Link>
                        <span className="text-gray-300">&middot;</span>
                        <span className="text-xs text-gray-400">{change.investor_firm}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${changeBadgeClass(change.change_type)}`}>
                          {changeLabel(change.change_type)}
                        </span>
                        <span className="font-mono font-bold text-sm text-gray-700">
                          {/^\d{5,}/.test(change.ticker) ? titleCase(change.security_name).split(' ').slice(0, 3).join(' ') : change.ticker}
                        </span>
                        <span className="text-sm text-gray-400 truncate">
                          {titleCase(change.security_name)}
                        </span>
                      </div>
                    </div>

                    {/* Right side: value and share changes */}
                    <div className="text-right flex-shrink-0">
                      <span
                        className={`text-sm font-semibold ${
                          change.value_delta > 0 ? 'text-green-600' : 'text-red-500'
                        }`}
                      >
                        {change.value_delta > 0 ? '+' : ''}
                        {formatValueFromThousands(change.value_delta)}
                      </span>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {formatShares(change.share_delta)} shares
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 text-center">
      <p className={`text-2xl sm:text-3xl font-extrabold ${color}`}>{value}</p>
      <p className="mt-1 text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-wide">
        {label}
      </p>
    </div>
  )
}
