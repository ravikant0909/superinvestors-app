import Link from 'next/link'
import type { Metadata } from 'next'
import { getBestIdeasFromFiles, formatValueFromThousands, getCurrentPrice, loadPortfolioAdjustments } from '@/lib/portfolio-data'
import type { BestIdeaData } from '@/lib/portfolio-data'

export const metadata: Metadata = {
  title: 'Best Ideas — Top Stock Picks from Super Investors',
  description:
    'Stocks ranked by how many top investors hold them, weighted by investor quality. Discover the highest-conviction picks across legendary value investors.',
  keywords: [
    'best stock ideas',
    'super investor picks',
    'top holdings',
    '13F overlap',
    'value investing ideas',
  ],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function whyInteresting(idea: BestIdeaData, rank: number): string {
  if (rank <= 3 && idea.holder_count >= 10) {
    return `Held by ${idea.holder_count} top investors with an average ${idea.avg_weight.toFixed(1)}% portfolio weight -- a strong consensus pick.`
  }
  if (idea.avg_weight >= 8) {
    return `High-conviction holding: investors who own it allocate ${idea.avg_weight.toFixed(1)}% on average.`
  }
  if (idea.holder_count >= 8) {
    return `Broad agreement across ${idea.holder_count} different investment styles and philosophies.`
  }
  return `Picked by ${idea.holder_count} super investors with an average weight of ${idea.avg_weight.toFixed(1)}%.`
}

// ─── Data Loading ────────────────────────────────────────────────────────────

function loadData() {
  const ideas = getBestIdeasFromFiles()
  return { ideas, hasData: ideas.length > 0 }
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function BestIdeasPage() {
  const data = loadData()
  const ideas = data.ideas

  // Compute aggregate stats
  const totalHolders = new Set(
    ideas.flatMap((idea) => idea.holders.map((h) => h.name))
  ).size
  const avgHolderCount =
    ideas.length > 0
      ? (ideas.reduce((sum, idea) => sum + idea.holder_count, 0) / ideas.length).toFixed(1)
      : '0'

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-700">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">Best Ideas</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
          Best Ideas &mdash; Top Stock Picks from Super Investors
        </h1>
        <p className="mt-3 text-base sm:text-lg text-gray-500 max-w-3xl leading-relaxed">
          Stocks ranked by how many top investors hold them, weighted by investor quality and
          conviction. When multiple legendary investors independently arrive at the same idea, it
          deserves attention.
        </p>
      </div>

      {/* Data source banner */}
      {!data.hasData && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          No 13F data available yet. Run the data pipeline to fetch filings.
        </div>
      )}

      {/* Summary Stats */}
      {data.hasData && (
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 text-center">
            <p className="text-2xl sm:text-3xl font-extrabold text-gray-900">{ideas.length}</p>
            <p className="mt-1 text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-wide">
              Stocks Tracked
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 text-center">
            <p className="text-2xl sm:text-3xl font-extrabold text-gray-900">{totalHolders}</p>
            <p className="mt-1 text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-wide">
              Unique Investors
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 text-center">
            <p className="text-2xl sm:text-3xl font-extrabold text-gray-900">{avgHolderCount}</p>
            <p className="mt-1 text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-wide">
              Avg Holders Per Stock
            </p>
          </div>
        </section>
      )}

      {/* Ranked List */}
      {ideas.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Table Header */}
          <div className="hidden sm:grid sm:grid-cols-12 gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <div className="col-span-1 text-center">Rank</div>
            <div className="col-span-4">Stock</div>
            <div className="col-span-2">Holders</div>
            <div className="col-span-2 text-center">Avg Weight</div>
            <div className="col-span-3">Total Value</div>
          </div>

          <div className="divide-y divide-gray-100">
            {ideas.map((idea, i) => (
              <div key={idea.ticker} className="px-5 py-5 hover:bg-gray-50 transition">
                {/* Main row */}
                <div className="flex items-start gap-4">
                  {/* Rank badge */}
                  <span
                    className={`flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold flex-shrink-0 ${
                      i < 3
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {i + 1}
                  </span>

                  {/* Stock info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
                      <div className="min-w-0">
                        <div className="text-base font-bold text-gray-900">
                          <span className="font-mono">{idea.ticker}</span>
                          <span className="ml-2 text-gray-500 font-normal">{idea.name}</span>
                          {(() => {
                            const p = getCurrentPrice(idea.ticker)
                            if (!p) return null
                            return (
                              <span className="ml-3 font-mono text-sm text-gray-700 font-normal">
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
                      </div>

                      {/* Stats cluster */}
                      <div className="flex items-center gap-5 flex-shrink-0">
                        <div className="text-center">
                          <div className="text-lg font-bold text-gray-900">
                            {idea.holder_count}
                          </div>
                          <div className="text-xs text-gray-400">holders</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-gray-900">
                            {idea.avg_weight?.toFixed(1)}%
                          </div>
                          <div className="text-xs text-gray-400">avg weight</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-gray-900">
                            {formatValueFromThousands(idea.total_value)}
                          </div>
                          <div className="text-xs text-gray-400">total value</div>
                        </div>
                      </div>
                    </div>

                    {/* Holders list */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {idea.holders.map((holder) => (
                        <Link
                          key={holder.slug}
                          href={`/investors/${holder.slug}`}
                          className="inline-block px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-600 font-medium transition"
                        >
                          {holder.name}
                          <span className="text-gray-400 ml-1">({holder.weight.toFixed(1)}%)</span>
                        </Link>
                      ))}
                    </div>

                    {/* Why interesting */}
                    <p className="mt-2 text-sm text-gray-400 italic">
                      {whyInteresting(idea, i + 1)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Methodology note */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-5">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Methodology</h3>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          Stocks are ranked by the number of tracked super investors who hold them, based on the
          most recent 13F filings. Average portfolio weight reflects how much each holder allocates
          to the position. This is not investment advice &mdash; it is a tool for identifying ideas
          that multiple independent, high-quality minds have converged on.
        </p>
        <p className="mt-2 text-xs text-gray-400 italic leading-relaxed">
          Note: 13F filings only cover US-listed securities. Some investors (e.g., Fundsmith, Gardner Russo, TCI Fund, Fairfax Financial)
          hold significant non-US positions not reflected here. Actual portfolio weights may be lower than shown for these investors.
          See individual investor pages for estimated non-US holdings.
        </p>
      </div>
    </div>
  )
}
