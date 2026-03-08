import Link from 'next/link'
import fs from 'fs'
import path from 'path'
import {
  loadAllPortfolios,
  getAllChanges,
  getBestIdeasFromFiles,
  formatValueFromThousands,
  formatShares,
  getCurrentPrice,
} from '@/lib/portfolio-data'
import type { AggregatedChange, BestIdeaData } from '@/lib/portfolio-data'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawInvestor {
  name: string
  firm: string
  scores: { combined: number }
  verdict: string
}

// ─── Data Loading ────────────────────────────────────────────────────────────

function loadInvestorList(): RawInvestor[] {
  try {
    const jsonPath = path.resolve(process.cwd(), 'data', 'investors', 'all_investors_ranked.json')
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  } catch {
    return []
  }
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

interface PageData {
  totalInvestors: number
  portfoliosWithData: number
  totalPositions: number
  uniqueStocks: number
  changes: AggregatedChange[]
  bestIdeas: BestIdeaData[]
  spotlight: { name: string; slug: string; firm: string; verdict: string; score: number; topHoldings: string[] } | null
  hasData: boolean
}

function loadPageData(): PageData {
  const investors = loadInvestorList()
  const portfolios = loadAllPortfolios()
  const changes = getAllChanges().slice(0, 10) // Top 10 for home page
  const bestIdeas = getBestIdeasFromFiles().slice(0, 5) // Top 5 for home page

  const totalPositions = portfolios.reduce((sum, p) => sum + (p.latest_holdings_count || 0), 0)
  const uniqueStocks = new Set(
    portfolios.flatMap(p => p.top_holdings.map(h => h.ticker).filter(t => !/^\d{5,}/.test(t)))
  ).size

  // Pick a spotlight investor (first FOLLOW with portfolio data)
  let spotlight: PageData['spotlight'] = null
  const followInvestors = investors.filter(inv =>
    inv.verdict?.toUpperCase() === 'FOLLOW' && inv.scores?.combined >= 8.0
  )
  if (followInvestors.length > 0) {
    // Use deterministic selection (not random to avoid hydration issues in static export)
    const inv = followInvestors[0]
    const slug = generateSlug(inv.name)
    spotlight = {
      name: inv.name,
      slug,
      firm: inv.firm,
      verdict: inv.verdict,
      score: inv.scores.combined,
      topHoldings: [],
    }
  }

  return {
    totalInvestors: investors.length,
    portfoliosWithData: portfolios.length,
    totalPositions,
    uniqueStocks,
    changes,
    bestIdeas,
    spotlight,
    hasData: portfolios.length > 0,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function changeLabel(changeType: string): string {
  switch (changeType?.toUpperCase()) {
    case 'NEW': return 'NEW'
    case 'INCREASED': return 'INCREASED'
    case 'DECREASED': return 'DECREASED'
    case 'SOLD_OUT': return 'SOLD'
    default: return changeType?.toUpperCase() ?? ''
  }
}

function changeBadgeClass(changeType: string): string {
  switch (changeType?.toUpperCase()) {
    case 'NEW': return 'px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-300'
    case 'INCREASED': return 'px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-300'
    case 'DECREASED': return 'px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-300'
    case 'SOLD_OUT': return 'px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-300'
    default: return 'px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-300'
  }
}

function verdictBadgeClass(verdict: string): string {
  switch (verdict?.toUpperCase()) {
    case 'FOLLOW': case 'STRONG_FOLLOW':
      return 'inline-block px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700 border border-green-300'
    case 'WATCH':
      return 'inline-block px-2 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-700 border border-yellow-300'
    default:
      return 'inline-block px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 border border-red-300'
  }
}

function scoreColorClass(score: number): string {
  if (score >= 8.0) return 'text-green-600'
  if (score >= 7.0) return 'text-blue-600'
  if (score >= 6.0) return 'text-yellow-600'
  if (score >= 5.0) return 'text-orange-500'
  return 'text-red-500'
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '--'
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function HomePage() {
  const data = loadPageData()

  return (
    <div className="space-y-10">
      {/* ── Hero Section ─────────────────────────────────────────────────── */}
      <section className="text-center py-12 sm:py-16">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
          Track the World&apos;s Greatest Investors
        </h1>
        <p className="mt-4 text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
          Follow the 13F filings of {data.totalInvestors} legendary value investors.
          See what they&apos;re buying, selling, and holding &mdash; updated every quarter.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/investors"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition shadow"
          >
            Browse Investors
          </Link>
          <Link
            href="/changes"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-white text-gray-900 text-sm font-semibold border border-gray-300 hover:bg-gray-50 transition shadow-sm"
          >
            Latest Changes
          </Link>
        </div>
      </section>

      {/* ── Stats Bar ────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Investors Tracked" value={data.totalInvestors.toString()} />
        <StatCard
          label="Portfolios Loaded"
          value={data.portfoliosWithData.toString()}
        />
        <StatCard
          label="Total Positions"
          value={data.totalPositions > 0 ? data.totalPositions.toLocaleString() : '--'}
        />
        <StatCard
          label="Unique Stocks"
          value={data.uniqueStocks > 0 ? data.uniqueStocks.toLocaleString() : '--'}
        />
      </section>

      {/* ── Two-Column Layout: Changes + Top Ideas ───────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Latest Changes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Latest Changes</h2>
            <Link href="/changes" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              View all &rarr;
            </Link>
          </div>
          {data.changes.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {data.changes.map((change, idx) => (
                <li key={`${change.investor_key}-${change.ticker}-${idx}`} className="px-5 py-3 hover:bg-gray-50 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/investors/${change.investor_slug}`}
                          className="text-sm font-semibold text-gray-900 hover:text-blue-700 truncate"
                        >
                          {change.investor_name}
                        </Link>
                        <span className={changeBadgeClass(change.change_type)}>
                          {changeLabel(change.change_type)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-sm">
                        <span className="font-mono font-bold text-gray-700">
                          {/^\d{5,}/.test(change.ticker) ? titleCase(change.security_name).split(' ').slice(0, 2).join(' ') : change.ticker}
                        </span>
                        {(() => {
                          const p = getCurrentPrice(change.ticker)
                          if (!p) return null
                          return (
                            <span className="font-mono text-xs text-gray-600">
                              ${p.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {p.prev_close > 0 && (
                                <span className={`ml-0.5 ${p.price >= p.prev_close ? 'text-green-600' : 'text-red-500'}`}>
                                  {p.price >= p.prev_close ? '\u25B2' : '\u25BC'}
                                </span>
                              )}
                            </span>
                          )
                        })()}
                        <span className="text-gray-400 truncate">{titleCase(change.security_name)}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span
                        className={`text-sm font-semibold ${
                          change.value_delta > 0 ? 'text-green-600' : 'text-red-500'
                        }`}
                      >
                        {change.value_delta > 0 ? '+' : ''}
                        {formatValueFromThousands(change.value_delta)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              No changes data available yet. Run the data pipeline to fetch 13F filings.
            </div>
          )}
        </div>

        {/* Right: Top Ideas */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Top Ideas</h2>
            <Link href="/best-ideas" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              View all &rarr;
            </Link>
          </div>
          {data.bestIdeas.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {data.bestIdeas.map((idea, i) => (
                <div key={idea.ticker} className="px-5 py-4 hover:bg-gray-50 transition">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-bold text-gray-500 flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-gray-900">
                          <span className="font-mono">{idea.ticker}</span>
                          <span className="ml-2 text-gray-500 font-normal">{idea.name}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-gray-900">
                        {idea.holder_count} holders
                      </div>
                      <div className="text-xs text-gray-400">
                        avg {idea.avg_weight?.toFixed(1)}% weight
                      </div>
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400 pl-11 truncate">
                    {idea.holders.map(h => h.name).join(', ')}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              No holdings data available yet. Run the data pipeline to fetch 13F filings.
            </div>
          )}
        </div>
      </section>

      {/* ── Featured Investor Spotlight ───────────────────────────────────── */}
      {data.spotlight && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Investor Spotlight</h2>
          </div>
          <div className="px-6 py-6 sm:flex items-start gap-8">
            <div className="sm:flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <Link
                  href={`/investors/${data.spotlight.slug}`}
                  className="text-xl font-bold text-gray-900 hover:text-blue-700"
                >
                  {data.spotlight.name}
                </Link>
                <span className={verdictBadgeClass(data.spotlight.verdict)}>
                  {data.spotlight.verdict?.toUpperCase()}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">{data.spotlight.firm}</p>

              {data.spotlight.score > 0 && (
                <div className="mt-4">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-extrabold ${scoreColorClass(data.spotlight.score)}`}>
                      {data.spotlight.score.toFixed(1)}
                    </span>
                    <span className="text-sm text-gray-400">/ 10</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Combined Score</p>
                  <div className="mt-2 w-full max-w-xs h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${(data.spotlight.score / 10) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 sm:mt-0 sm:flex-shrink-0 flex flex-col items-start sm:items-end gap-3">
              <Link
                href={`/investors/${data.spotlight.slug}`}
                className="inline-flex items-center px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition shadow"
              >
                View Full Profile &rarr;
              </Link>
              <p className="text-xs text-gray-400 max-w-[200px] text-left sm:text-right">
                Explore their complete portfolio, position changes, and investment thesis.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 text-center">
      <p className="text-2xl sm:text-3xl font-extrabold text-gray-900">{value}</p>
      <p className="mt-1 text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-wide">
        {label}
      </p>
    </div>
  )
}
