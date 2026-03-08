import fs from 'fs'
import path from 'path'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { loadInvestorPortfolio, formatValueFromThousands, formatShares } from '@/lib/portfolio-data'
import type { Holding, ChangeEntry } from '@/lib/portfolio-data'
import { AllocationPieChart } from '@/components/AllocationPieChart'

// ─── Types ───────────────────────────────────────────────────────────────────

interface InvestorScores {
  philosophy_alignment: number
  concentration: number
  rationality: number
  integrity: number
  track_record: number
  transparency: number
  relevance: number
  agi_awareness: number
  combined: number
}

interface RawInvestor {
  name: string
  firm: string
  background: string
  investment_philosophy: string
  portfolio_style: string
  track_record: string
  transparency: string
  integrity: string
  notable_holdings: string
  relevance_to_us: string
  scores: InvestorScores
  verdict: string
  one_line_summary: string
  group_id: string
  group_theme: string
}

// ─── Data Loading ────────────────────────────────────────────────────────────

function getJsonPath(): string {
  return path.resolve(process.cwd(), 'data', 'investors', 'all_investors_ranked.json')
}

function loadAllInvestors(): RawInvestor[] {
  const jsonPath = getJsonPath()
  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function findInvestorBySlug(slug: string): RawInvestor | undefined {
  const investors = loadAllInvestors()
  return investors.find((inv) => generateSlug(inv.name) === slug)
}

// ─── Static Params ───────────────────────────────────────────────────────────

export async function generateStaticParams() {
  const investors = loadAllInvestors()
  return investors.map((inv) => ({
    slug: generateSlug(inv.name),
  }))
}

// ─── Dynamic Metadata ────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const investor = findInvestorBySlug(slug)
  if (!investor) {
    return { title: 'Investor Not Found — SuperInvestors' }
  }
  return {
    title: `${investor.name} — SuperInvestors`,
    description: investor.one_line_summary,
  }
}

// ─── Score Helpers ───────────────────────────────────────────────────────────

const SCORE_DIMENSIONS: {
  key: keyof Omit<InvestorScores, 'combined'>
  label: string
  weight: string
}[] = [
  { key: 'philosophy_alignment', label: 'Philosophy Alignment', weight: '20%' },
  { key: 'concentration', label: 'Concentration', weight: '15%' },
  { key: 'rationality', label: 'Rationality', weight: '15%' },
  { key: 'integrity', label: 'Integrity', weight: '15%' },
  { key: 'track_record', label: 'Track Record', weight: '15%' },
  { key: 'transparency', label: 'Transparency', weight: '10%' },
  { key: 'relevance', label: 'Relevance', weight: '5%' },
  { key: 'agi_awareness', label: 'AGI Awareness', weight: '5%' },
]

function getScoreColor(score: number): string {
  if (score >= 8) return 'text-green-600'
  if (score >= 6) return 'text-blue-600'
  if (score >= 4) return 'text-yellow-600'
  return 'text-red-500'
}

function getCombinedScoreColor(score: number): string {
  if (score >= 8.0) return 'text-green-600'
  if (score >= 7.0) return 'text-blue-600'
  if (score >= 6.0) return 'text-yellow-600'
  if (score >= 5.0) return 'text-orange-500'
  return 'text-red-500'
}

function getCombinedScoreBgClass(score: number): string {
  if (score >= 8.0) return 'bg-green-50 border-green-200'
  if (score >= 7.0) return 'bg-blue-50 border-blue-200'
  if (score >= 6.0) return 'bg-yellow-50 border-yellow-200'
  if (score >= 5.0) return 'bg-orange-50 border-orange-200'
  return 'bg-red-50 border-red-200'
}

function getBarColor(score: number): string {
  if (score >= 8) return 'bg-green-500'
  if (score >= 6) return 'bg-blue-500'
  if (score >= 4) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getVerdictStyle(verdict: string): string {
  switch (verdict.toUpperCase()) {
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

// ─── Text formatting helper ──────────────────────────────────────────────────

function formatParagraphs(text: string): string[] {
  return text
    .split(/(?:\n\n|\n)/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

// ─── Portfolio weight styling ────────────────────────────────────────────────

function getWeightStyle(weight: number): string {
  if (weight >= 20) return 'text-red-600 font-bold'
  if (weight >= 10) return 'text-orange-600 font-bold'
  if (weight >= 5) return 'text-gray-900'
  return 'text-gray-400'
}

function getChangeBadge(changeType: string): { label: string; className: string } {
  switch (changeType?.toUpperCase()) {
    case 'NEW':
      return { label: 'NEW', className: 'bg-green-100 text-green-700 border border-green-300' }
    case 'INCREASED':
      return { label: 'INCREASED', className: 'bg-blue-100 text-blue-700 border border-blue-300' }
    case 'DECREASED':
      return { label: 'DECREASED', className: 'bg-orange-100 text-orange-700 border border-orange-300' }
    case 'SOLD_OUT':
      return { label: 'SOLD', className: 'bg-red-100 text-red-700 border border-red-300' }
    default:
      return { label: changeType, className: 'bg-gray-100 text-gray-700 border border-gray-300' }
  }
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default async function InvestorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const investor = findInvestorBySlug(slug)

  if (!investor) {
    notFound()
  }

  const { name, firm, scores, verdict, one_line_summary } = investor

  // Load portfolio data from 13F JSON files
  const portfolio = loadInvestorPortfolio(slug)

  // Get non-UNCHANGED changes for the recent changes section
  const recentChanges = portfolio?.changes?.changes?.filter(
    (c) => c.change_type !== 'UNCHANGED'
  ) || []

  return (
    <div className="space-y-8">
      {/* ── Breadcrumb ──────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-900 transition">
          Home
        </Link>
        <span className="text-gray-300">/</span>
        <Link href="/investors" className="hover:text-gray-900 transition">
          Investors
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900 font-medium">{name}</span>
      </nav>

      {/* ── Header Card ─────────────────────────────────────────────────── */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-8 sm:px-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                {name}
              </h1>
              <span
                className={`inline-block px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide ${getVerdictStyle(verdict)}`}
              >
                {verdict}
              </span>
            </div>
            <p className="mt-2 text-base text-gray-500">{firm}</p>
            <p className="mt-4 text-base text-gray-600 italic leading-relaxed max-w-3xl">
              {one_line_summary}
            </p>
            {investor.group_theme && (
              <p className="mt-3 text-xs text-gray-400 uppercase tracking-wide font-medium">
                {investor.group_theme}
              </p>
            )}
          </div>

          {/* Combined Score */}
          <div
            className={`flex-shrink-0 flex flex-col items-center justify-center w-32 h-32 rounded-2xl border ${getCombinedScoreBgClass(scores.combined)}`}
          >
            <span className={`text-4xl font-extrabold ${getCombinedScoreColor(scores.combined)}`}>
              {scores.combined.toFixed(1)}
            </span>
            <span className="text-xs text-gray-500 font-medium mt-1">/ 10</span>
            <span className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">
              Combined
            </span>
          </div>
        </div>
      </header>

      {/* ── Current Portfolio (from 13F data) ────────────────────────────── */}
      {portfolio && portfolio.top_holdings.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-6 sm:px-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Current Portfolio</h2>
              <p className="text-sm text-gray-500 mt-1">
                {portfolio.latest_quarter} &middot; {portfolio.latest_holdings_count} positions &middot; Filed {portfolio.latest_filing_date}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-2xl font-extrabold text-gray-900">
                {formatValueFromThousands(portfolio.latest_total_value_thousands)}
              </div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Total Value</div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Holdings Table */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="py-2 px-2 text-center w-12">#</th>
                    <th className="py-2 px-2 text-left">Ticker</th>
                    <th className="py-2 px-2 text-left hidden sm:table-cell">Company</th>
                    <th className="py-2 px-2 text-right">Value</th>
                    <th className="py-2 px-2 text-right hidden sm:table-cell">Shares</th>
                    <th className="py-2 px-2 text-right">Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {portfolio.top_holdings.map((holding, i) => (
                    <tr key={holding.cusip} className="hover:bg-gray-50 transition">
                      <td className="py-2.5 px-2 text-center text-gray-400 text-xs">{i + 1}</td>
                      <td className="py-2.5 px-2">
                        <span className="font-mono font-bold text-gray-900">
                          {/^\d{5,}/.test(holding.ticker) ? holding.name.split(' ').slice(0, 2).join(' ') : holding.ticker}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-gray-500 hidden sm:table-cell truncate max-w-[200px]">
                        {titleCase(holding.name)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-gray-700">
                        {formatValueFromThousands(holding.value_thousands)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-gray-500 hidden sm:table-cell">
                        {holding.shares.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span className={getWeightStyle(holding.weight_pct)}>
                          {holding.weight_pct.toFixed(1)}%
                        </span>
                        {holding.weight_pct >= 10 && (
                          <Link
                            href={`/convictions/${slug}-${(/^\d{5,}/.test(holding.ticker) ? holding.cusip : holding.ticker).toLowerCase()}`}
                            className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-200 transition"
                          >
                            Conviction
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pie Chart */}
            <div className="flex-shrink-0 flex flex-col items-center">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Allocation
              </h3>
              <AllocationPieChart holdings={portfolio.top_holdings} />
            </div>
          </div>
        </section>
      )}

      {/* ── Recent Changes ────────────────────────────────────────────────── */}
      {recentChanges.length > 0 && portfolio?.changes && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-6 sm:px-8">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Recent Changes</h2>
          <p className="text-sm text-gray-500 mb-4">
            {portfolio.changes.current_quarter} vs {portfolio.changes.previous_quarter}
            {portfolio.changes.portfolio_value_change_pct !== 0 && (
              <span className={portfolio.changes.portfolio_value_change_pct > 0 ? 'text-green-600 ml-2' : 'text-red-500 ml-2'}>
                Portfolio {portfolio.changes.portfolio_value_change_pct > 0 ? '+' : ''}{portfolio.changes.portfolio_value_change_pct.toFixed(1)}%
              </span>
            )}
          </p>

          {/* Summary badges */}
          <div className="flex flex-wrap gap-3 mb-4 text-xs">
            {portfolio.changes.summary.new > 0 && (
              <span className="px-2 py-1 rounded bg-green-100 text-green-700 font-semibold">
                {portfolio.changes.summary.new} New
              </span>
            )}
            {portfolio.changes.summary.increased > 0 && (
              <span className="px-2 py-1 rounded bg-blue-100 text-blue-700 font-semibold">
                {portfolio.changes.summary.increased} Increased
              </span>
            )}
            {portfolio.changes.summary.decreased > 0 && (
              <span className="px-2 py-1 rounded bg-orange-100 text-orange-700 font-semibold">
                {portfolio.changes.summary.decreased} Decreased
              </span>
            )}
            {portfolio.changes.summary.sold_out > 0 && (
              <span className="px-2 py-1 rounded bg-red-100 text-red-700 font-semibold">
                {portfolio.changes.summary.sold_out} Sold
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="py-2 px-2 text-left">Action</th>
                  <th className="py-2 px-2 text-left">Ticker</th>
                  <th className="py-2 px-2 text-left hidden sm:table-cell">Company</th>
                  <th className="py-2 px-2 text-right">Shares Change</th>
                  <th className="py-2 px-2 text-right">Value Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentChanges.map((change, i) => {
                  const badge = getChangeBadge(change.change_type)
                  return (
                    <tr key={i} className="hover:bg-gray-50 transition">
                      <td className="py-2.5 px-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="font-mono font-bold text-gray-900">
                          {/^\d{5,}/.test(change.ticker) ? change.name_of_issuer.split(' ').slice(0, 2).join(' ') : change.ticker}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-gray-500 hidden sm:table-cell truncate max-w-[200px]">
                        {titleCase(change.name_of_issuer)}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span className={change.share_delta > 0 ? 'text-green-600' : 'text-red-500'}>
                          {formatShares(change.share_delta)}
                        </span>
                        {change.share_change_pct != null && (
                          <span className="text-gray-400 text-xs ml-1">
                            ({change.share_change_pct > 0 ? '+' : ''}{change.share_change_pct.toFixed(0)}%)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span className={change.value_delta > 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                          {change.value_delta > 0 ? '+' : ''}{formatValueFromThousands(change.value_delta)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Scores Section ──────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-6 sm:px-8">
        <h2 className="text-lg font-bold text-gray-900 mb-6">Score Breakdown</h2>
        <div className="space-y-4">
          {SCORE_DIMENSIONS.map(({ key, label, weight }) => {
            const value = scores[key]
            return (
              <div key={key} className="flex items-center gap-4">
                {/* Label */}
                <div className="w-44 flex-shrink-0">
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                  <span className="ml-1.5 text-xs text-gray-400">({weight})</span>
                </div>
                {/* Bar */}
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getBarColor(value)}`}
                    style={{ width: `${(value / 10) * 100}%` }}
                  />
                </div>
                {/* Score Number */}
                <span
                  className={`w-10 text-right text-sm font-bold ${getScoreColor(value)}`}
                >
                  {value}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Philosophy & Portfolio Style ─────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-6 sm:px-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          Investment Philosophy & Portfolio Style
        </h2>
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Philosophy
            </h3>
            <div className="text-sm text-gray-700 leading-relaxed space-y-3">
              {formatParagraphs(investor.investment_philosophy).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
          <hr className="border-gray-100" />
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Portfolio Style
            </h3>
            <div className="text-sm text-gray-700 leading-relaxed space-y-3">
              {formatParagraphs(investor.portfolio_style).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Background ──────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-6 sm:px-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Background</h2>
        <div className="text-sm text-gray-700 leading-relaxed space-y-3">
          {formatParagraphs(investor.background).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      {/* ── Track Record ────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-6 sm:px-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Track Record</h2>
        <div className="text-sm text-gray-700 leading-relaxed space-y-3">
          {formatParagraphs(investor.track_record).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      {/* ── Notable Holdings ────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-6 sm:px-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Notable Holdings</h2>
        <div className="text-sm text-gray-700 leading-relaxed space-y-3">
          {formatParagraphs(investor.notable_holdings).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      {/* ── Transparency & Integrity ────────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-6 sm:px-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Transparency & Integrity</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Transparency
              <span className="ml-2 text-xs font-normal text-gray-400">
                (Score: {scores.transparency}/10)
              </span>
            </h3>
            <div className="text-sm text-gray-700 leading-relaxed space-y-3">
              {formatParagraphs(investor.transparency).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Integrity
              <span className="ml-2 text-xs font-normal text-gray-400">
                (Score: {scores.integrity}/10)
              </span>
            </h3>
            <div className="text-sm text-gray-700 leading-relaxed space-y-3">
              {formatParagraphs(investor.integrity).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Relevance to Us ─────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-6 sm:px-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Relevance to Us</h2>
        <div className="text-sm text-gray-700 leading-relaxed space-y-3">
          {formatParagraphs(investor.relevance_to_us).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      {/* ── Back to Investors ───────────────────────────────────────────── */}
      <div className="pt-4 pb-8">
        <Link
          href="/investors"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
              clipRule="evenodd"
            />
          </svg>
          Back to All Investors
        </Link>
      </div>
    </div>
  )
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
