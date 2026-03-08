import fs from 'fs'
import path from 'path'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ValuationWaterfall from '@/components/ValuationWaterfall'
import ValuationFlow from '@/components/ValuationFlow'
import PortfolioWeightBadge from '@/components/PortfolioWeightBadge'

// ─── Types ────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

interface NormalizedQuote {
  quote: string
  source?: string
  date?: string
  url?: string
}

interface ValuationStep {
  label: string
  value: string
  note?: string
}

interface NormalizedRisk {
  risk: string
  severity: string
  mitigation?: string
}

// ─── Data Loading ─────────────────────────────────────────────────────────────

function getConvictionDataDir(): string {
  return path.resolve(process.cwd(), 'conviction_data')
}

function loadAllConvictionFiles(): any[] {
  const dataDir = getConvictionDataDir()
  if (!fs.existsSync(dataDir)) return []

  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json') && f !== 'index.json')
  const results: any[] = []

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'))
      if (raw.investor_slug && raw.ticker) {
        results.push(raw)
      }
    } catch {
      // Skip malformed files
    }
  }
  return results
}

function findConviction(slug: string): any | null {
  const all = loadAllConvictionFiles()
  return all.find((d: any) => `${d.investor_slug}-${d.ticker}` === slug) || null
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function normalizeQuotes(raw: any): NormalizedQuote[] {
  if (!raw) return []
  if (!Array.isArray(raw)) return []
  return raw.map((item: any) => {
    if (typeof item === 'string') {
      return { quote: item }
    }
    return {
      quote: item.quote || String(item),
      source: item.source,
      date: item.date,
      url: item.url,
    }
  })
}

function normalizeRisks(raw: any): NormalizedRisk[] {
  if (!raw) return []
  if (!Array.isArray(raw)) return []
  return raw.map((item: any, i: number) => {
    if (typeof item === 'string') {
      // Assign severity based on position (first risks tend to be most important)
      const severity = i < 2 ? 'high' : i < 4 ? 'medium' : 'low'
      return { risk: item, severity }
    }
    return {
      risk: item.risk || String(item),
      severity: item.severity || 'medium',
      mitigation: item.mitigation,
    }
  })
}

function normalizeValuationSteps(valMath: any): ValuationStep[] {
  if (!valMath) return []

  // If the spec format with steps array exists, use it directly
  if (valMath.steps && Array.isArray(valMath.steps)) {
    return valMath.steps.map((s: any) => ({
      label: s.label || '',
      value: String(s.value || ''),
      note: s.note,
    }))
  }

  // Otherwise, build steps from the raw financial fields
  const steps: ValuationStep[] = []

  if (valMath.current_revenue_millions) {
    steps.push({
      label: 'Revenue',
      value: `$${(valMath.current_revenue_millions / 1000).toFixed(1)}B`,
      note: valMath.revenue_growth_pct ? `Growing ${valMath.revenue_growth_pct}% YoY` : undefined,
    })
  }
  if (valMath.operating_margin_pct) {
    steps.push({
      label: 'Operating Margin',
      value: `${valMath.operating_margin_pct}%`,
    })
  }
  if (valMath.current_net_income_millions) {
    steps.push({
      label: 'Net Income',
      value: `$${valMath.current_net_income_millions}M`,
    })
  }
  if (valMath.current_eps) {
    steps.push({
      label: 'Current EPS',
      value: `$${valMath.current_eps}`,
    })
  }
  if (valMath.free_cash_flow_millions) {
    steps.push({
      label: 'Free Cash Flow',
      value: `$${valMath.free_cash_flow_millions}M`,
    })
  }
  if (valMath.projected_2030_eps || valMath.projected_normalized_eps_2026) {
    const projEps = valMath.projected_2030_eps || valMath.projected_normalized_eps_2026
    const label = valMath.projected_2030_eps ? 'Projected 2030 EPS' : 'Projected 2026 EPS'
    steps.push({
      label,
      value: typeof projEps === 'number' ? `$${projEps}` : String(projEps),
    })
  }
  if (valMath.target_pe || valMath.target_2030_pe) {
    steps.push({
      label: 'Target P/E',
      value: String(valMath.target_pe || valMath.target_2030_pe),
    })
  }
  if (valMath.implied_2030_price || valMath.implied_2028_price) {
    steps.push({
      label: 'Implied Price',
      value: String(valMath.implied_2030_price || valMath.implied_2028_price),
    })
  }
  if (valMath.implied_irr_pct) {
    steps.push({
      label: 'Implied IRR',
      value: String(valMath.implied_irr_pct) + (String(valMath.implied_irr_pct).includes('%') ? '' : '%'),
    })
  }

  return steps
}

function normalizeKeyMetrics(raw: any): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const result: Record<string, string> = {}

  // Pick the most interesting metrics, limited to ~8 for display
  const priorities = [
    'revenue', 'net_income', 'market_cap', 'eps', 'operating_margin',
    'free_cash_flow', 'revenue_growth', 'profit_margin', 'gross_margin',
    'employees', 'brands', 'customer_accounts',
  ]

  const entries = Object.entries(raw)

  // Try priority keys first
  for (const pKey of priorities) {
    const match = entries.find(([k]) => k.toLowerCase().includes(pKey))
    if (match && Object.keys(result).length < 8) {
      result[match[0]] = String(match[1])
    }
  }

  // Fill remaining up to 8 with other entries
  for (const [k, v] of entries) {
    if (Object.keys(result).length >= 8) break
    if (!(k in result)) {
      result[k] = String(v)
    }
  }

  return result
}

// ─── Static Params ────────────────────────────────────────────────────────────

export function generateStaticParams() {
  const all = loadAllConvictionFiles()
  return all.map((d: any) => ({
    slug: `${d.investor_slug}-${d.ticker}`,
  }))
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const data = findConviction(params.slug)
  if (!data) {
    return { title: 'Conviction Bet — SuperInvestors' }
  }
  return {
    title: `${data.investor_name} × ${data.ticker} — Conviction Bet`,
    description: data.thesis_headline,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatValue(millions: number): string {
  if (millions == null || millions === 0) return '--'
  if (millions >= 1000) return `$${(millions / 1000).toFixed(1)}B`
  return `$${millions.toFixed(0)}M`
}

function severityColor(severity: string): {
  bg: string
  border: string
  text: string
  dot: string
} {
  switch (severity?.toLowerCase()) {
    case 'high':
      return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500' }
    case 'medium':
      return {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-orange-700',
        dot: 'bg-orange-500',
      }
    case 'low':
      return {
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-700',
        dot: 'bg-green-500',
      }
    default:
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        text: 'text-gray-700',
        dot: 'bg-gray-500',
      }
  }
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function ConvictionDetailPage({ params }: { params: { slug: string } }) {
  const data = findConviction(params.slug)

  if (!data) {
    notFound()
  }

  // Normalize all data formats
  const quotes = normalizeQuotes(data.investor_in_their_own_words)
  const risks = normalizeRisks(data.risks)
  const valuationSteps = normalizeValuationSteps(data.valuation_math)
  const keyMetrics = normalizeKeyMetrics(data.key_metrics)
  const bestQuote = quotes[0]

  // Extract valuation meta
  const valMath = data.valuation_math || {}
  const methodology = valMath.methodology || valMath.approach || ''
  const targetPrice = valMath.target_price || valMath.implied_2030_price || valMath.implied_2028_price
  const currentPrice = valMath.current_price
  const impliedReturn = valMath.implied_return || (valMath.implied_irr_pct ? `IRR: ${valMath.implied_irr_pct}` : undefined)
  const timeHorizon = valMath.time_horizon

  return (
    <div className="space-y-10 pb-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-400">
        <Link href="/convictions" className="hover:text-gray-600 transition">
          Conviction Bets
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-600">
          {data.investor_name} &times; {data.ticker}
        </span>
      </nav>

      {/* ── Hero: Thesis Front and Center ──────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 sm:px-8 py-8 sm:py-10">
          {/* Thesis headline */}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 leading-tight max-w-3xl">
            {data.thesis_headline}
          </h1>

          {/* Meta row */}
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <PortfolioWeightBadge weight={data.weight_pct} size="md" />
              <div>
                <p className="text-sm font-semibold text-gray-900">{data.investor_name}</p>
                <p className="text-xs text-gray-400">{data.firm_name}</p>
              </div>
            </div>
            <div className="h-8 w-px bg-gray-200 hidden sm:block" />
            <div>
              <span className="font-mono text-xl font-extrabold text-gray-900">
                {data.ticker}
              </span>
              <span className="ml-2 text-sm text-gray-500">{data.company_name}</span>
            </div>
            <div className="h-8 w-px bg-gray-200 hidden sm:block" />
            <div className="text-sm text-gray-500">
              Value: <span className="font-semibold text-gray-700">{formatValue(data.value_millions)}</span>
            </div>
          </div>

          {/* Featured quote */}
          {bestQuote && (
            <blockquote className="mt-6 pl-4 border-l-4 border-purple-300 bg-purple-50/50 rounded-r-lg py-4 pr-4">
              <p className="text-base sm:text-lg text-gray-700 italic leading-relaxed">
                &ldquo;{bestQuote.quote}&rdquo;
              </p>
              <footer className="mt-2 text-sm text-gray-400">
                &mdash; {data.investor_name}
                {bestQuote.source && <>, {bestQuote.source}</>}
                {bestQuote.date && <> ({bestQuote.date})</>}
              </footer>
            </blockquote>
          )}
        </div>
      </section>

      {/* ── Thesis Summary ─────────────────────────────────────────────── */}
      {data.thesis_summary && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 sm:px-8 py-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3">The Thesis</h2>
          <div className="text-gray-600 leading-relaxed whitespace-pre-line text-sm sm:text-base">
            {data.thesis_summary}
          </div>
          {data.why_this_price && (
            <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-100">
              <h3 className="text-sm font-semibold text-purple-800 mb-1">
                What the investor sees at current prices
              </h3>
              <p className="text-sm text-purple-700 leading-relaxed">{data.why_this_price}</p>
            </div>
          )}
        </section>
      )}

      {/* ── Valuation Math (SVG Diagrams) ──────────────────────────────── */}
      {valuationSteps.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 sm:px-8 py-6">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-lg font-bold text-gray-900">Valuation Math</h2>
            {methodology && (
              <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700">
                {methodology}
              </span>
            )}
          </div>
          {timeHorizon && (
            <p className="text-sm text-gray-400 mb-4">
              Time horizon: {timeHorizon}
            </p>
          )}

          {/* Waterfall chart */}
          <div className="overflow-x-auto -mx-2 px-2">
            <ValuationWaterfall
              steps={valuationSteps}
              targetPrice={targetPrice}
              currentPrice={currentPrice}
              impliedReturn={impliedReturn}
              timeHorizon={timeHorizon}
            />
          </div>

          {/* Valuation notes from raw data */}
          {valMath.notes && (
            <p className="mt-4 text-xs text-gray-400 leading-relaxed">{valMath.notes}</p>
          )}

          {/* Also show flow chart if enough steps */}
          {valuationSteps.length >= 4 && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Logic Flow
              </h3>
              <div className="overflow-x-auto -mx-2 px-2">
                <ValuationFlow
                  steps={valuationSteps}
                  targetPrice={targetPrice}
                  currentPrice={currentPrice}
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Key Metrics ────────────────────────────────────────────────── */}
      {Object.keys(keyMetrics).length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">Key Metrics</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(keyMetrics).map(([key, value]) => (
              <div
                key={key}
                className="bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3 text-center"
              >
                <p className="text-base sm:text-lg font-extrabold text-gray-900 break-words">{value}</p>
                <p className="mt-1 text-xs text-gray-500 font-medium uppercase tracking-wide">
                  {key.replace(/_/g, ' ').replace(/fy\d{4}/i, (m) => m.toUpperCase())}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Investor Quotes ────────────────────────────────────────────── */}
      {quotes.length > 1 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 sm:px-8 py-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">In Their Own Words</h2>
          <div className="space-y-5">
            {quotes.slice(1).map((q, i) => (
              <blockquote
                key={i}
                className="pl-4 border-l-2 border-gray-200 py-1"
              >
                <p className="text-gray-600 italic leading-relaxed">
                  &ldquo;{q.quote}&rdquo;
                </p>
                {(q.source || q.date || q.url) && (
                  <footer className="mt-1 text-xs text-gray-400">
                    {q.source && <>{q.source}</>}
                    {q.date && <> ({q.date})</>}
                    {q.url && (
                      <>
                        {' '}&mdash;{' '}
                        <a
                          href={q.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-600 hover:underline"
                        >
                          Source
                        </a>
                      </>
                    )}
                  </footer>
                )}
              </blockquote>
            ))}
          </div>
        </section>
      )}

      {/* ── Moat & Catalysts (side by side) ────────────────────────────── */}
      {((data.moat_sources && data.moat_sources.length > 0) ||
        (data.catalysts && data.catalysts.length > 0)) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Moat */}
          {data.moat_sources && data.moat_sources.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-5">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Competitive Moat</h2>
              <ul className="space-y-2">
                {data.moat_sources.map((moat: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
                    {moat}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Catalysts */}
          {data.catalysts && data.catalysts.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-5">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Catalysts</h2>
              <ul className="space-y-2">
                {data.catalysts.map((cat: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    {cat}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Risks ──────────────────────────────────────────────────────── */}
      {risks.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">Risks</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {risks.map((risk, i) => {
              const colors = severityColor(risk.severity)
              return (
                <div
                  key={i}
                  className={`rounded-xl border ${colors.border} ${colors.bg} px-5 py-4`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    <span className={`text-xs font-bold uppercase tracking-wide ${colors.text}`}>
                      {risk.severity}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800">{risk.risk}</p>
                  {risk.mitigation && (
                    <p className="mt-1 text-xs text-gray-500">{risk.mitigation}</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Company Overview (secondary, at bottom) ────────────────────── */}
      {data.company_brief && (
        <section className="bg-gray-50 rounded-xl border border-gray-200 px-6 sm:px-8 py-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Company Overview
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
            {data.company_brief}
          </p>
        </section>
      )}

      {/* Back link */}
      <div className="pt-4">
        <Link
          href="/convictions"
          className="text-sm text-purple-600 hover:text-purple-800 font-medium"
        >
          &larr; Back to all conviction bets
        </Link>
      </div>
    </div>
  )
}
