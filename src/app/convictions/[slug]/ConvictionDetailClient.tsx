'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PortfolioWeightBadge from '@/components/PortfolioWeightBadge'
import { normalizeConviction, type NormalizedConviction } from '@/lib/conviction-normalize'
import { fetchStaticJson } from '@/lib/static-json'
import {
  getAdjustedWeightFromPayload,
  getCurrentPriceFromPayload,
  type AllPrices,
  type PortfolioAdjustment,
} from '@/lib/runtime-data'

/* eslint-disable @typescript-eslint/no-explicit-any */

interface NormalizedQuote {
  quote: string
  source?: string
  date?: string
  url?: string
}

interface NormalizedRisk {
  risk: string
  severity: string
  mitigation?: string
}

interface DetailState {
  data: NormalizedConviction | null
  prices: AllPrices | null
  adjustments: Record<string, PortfolioAdjustment> | null
  loading: boolean
  notFound: boolean
  error: string | null
}

function normalizeQuotes(raw: any): NormalizedQuote[] {
  if (!raw || !Array.isArray(raw)) return []
  return raw.map((item: any) => {
    if (typeof item === 'string') {
      return { quote: item }
    }
    return {
      quote: item.quote || String(item),
      source: item.source || item.attribution,
      date: item.date,
      url: item.url,
    }
  })
}

function normalizeRisks(raw: any): NormalizedRisk[] {
  if (!raw || !Array.isArray(raw)) return []
  return raw.map((item: any, i: number) => {
    if (typeof item === 'string') {
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

function normalizeKeyMetrics(raw: any): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const result: Record<string, string> = {}

  const priorities = [
    'revenue', 'net_income', 'market_cap', 'eps', 'operating_margin',
    'free_cash_flow', 'revenue_growth', 'profit_margin', 'gross_margin',
    'employees', 'brands', 'customer_accounts',
  ]

  const entries = Object.entries(raw)

  for (const pKey of priorities) {
    const match = entries.find(([k]) => k.toLowerCase().includes(pKey))
    if (match && Object.keys(result).length < 8) {
      result[match[0]] = String(match[1])
    }
  }

  for (const [k, v] of entries) {
    if (Object.keys(result).length >= 8) break
    if (!(k in result)) {
      result[k] = String(v)
    }
  }

  return result
}

function getThesisBullets(data: any): string[] {
  if (data.thesis_bullets && Array.isArray(data.thesis_bullets) && data.thesis_bullets.length > 0) {
    return data.thesis_bullets
  }
  if (data.thesis_summary && typeof data.thesis_summary === 'string') {
    const sentences = data.thesis_summary
      .split(/(?<=[.!?])\s+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 20)
    if (sentences.length <= 5) return sentences
    const perBullet = Math.ceil(sentences.length / 5)
    const bullets: string[] = []
    for (let i = 0; i < sentences.length; i += perBullet) {
      bullets.push(sentences.slice(i, i + perBullet).join(' '))
    }
    return bullets
  }
  return []
}

function getBusinessBullets(data: any): string[] {
  if (data.business_bullets && Array.isArray(data.business_bullets) && data.business_bullets.length > 0) {
    return data.business_bullets
  }
  if (data.company_brief && typeof data.company_brief === 'string') {
    const sentences = data.company_brief
      .split(/(?<=[.!?])\s+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 15)
    if (sentences.length <= 4) return sentences
    const perBullet = Math.ceil(sentences.length / 4)
    const bullets: string[] = []
    for (let i = 0; i < sentences.length; i += perBullet) {
      bullets.push(sentences.slice(i, i + perBullet).join(' '))
    }
    return bullets
  }
  return []
}

function getFinancialMetrics(data: any): Record<string, string> {
  const metrics: Record<string, string> = {}
  const km = normalizeKeyMetrics(data.key_metrics)
  Object.assign(metrics, km)

  const vm = data.valuation_math || {}
  const factualKeys: Record<string, string> = {}

  if (vm.current_revenue_millions && !Object.keys(metrics).some((k) => k.toLowerCase().includes('revenue'))) {
    factualKeys.Revenue = vm.current_revenue_millions >= 1000
      ? `$${(vm.current_revenue_millions / 1000).toFixed(1)}B`
      : `$${vm.current_revenue_millions}M`
  }
  if (vm.revenue_fy2025_billions && !Object.keys(metrics).some((k) => k.toLowerCase().includes('revenue'))) {
    factualKeys['Revenue (FY2025)'] = `$${vm.revenue_fy2025_billions}B`
  }
  if (vm.revenue_fy2024_millions && !Object.keys(metrics).some((k) => k.toLowerCase().includes('revenue'))) {
    factualKeys['Revenue (FY2024)'] = vm.revenue_fy2024_millions >= 1000
      ? `$${(vm.revenue_fy2024_millions / 1000).toFixed(1)}B`
      : `$${vm.revenue_fy2024_millions}M`
  }
  if (vm.operating_margin_pct && !Object.keys(metrics).some((k) => k.toLowerCase().includes('margin'))) {
    factualKeys['Operating Margin'] = `${vm.operating_margin_pct}%`
  }
  if (vm.current_net_income_millions && !Object.keys(metrics).some((k) => k.toLowerCase().includes('net_income'))) {
    factualKeys['Net Income'] = `$${vm.current_net_income_millions}M`
  }
  if (vm.free_cash_flow_millions && !Object.keys(metrics).some((k) => k.toLowerCase().includes('free_cash'))) {
    factualKeys['Free Cash Flow'] = `$${vm.free_cash_flow_millions}M`
  }

  for (const [key, value] of Object.entries(factualKeys)) {
    if (Object.keys(metrics).length >= 8) break
    metrics[key] = value
  }

  return metrics
}

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
    case 'medium-high':
      return {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-orange-700',
        dot: 'bg-orange-500',
      }
    case 'low':
    case 'low-medium':
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

export default function ConvictionDetailClient({ slug }: { slug: string }) {
  const [state, setState] = useState<DetailState>({
    data: null,
    prices: null,
    adjustments: null,
    loading: true,
    notFound: false,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const rawDetail = await fetchStaticJson<unknown>(`/conviction-data/details/${slug}.json`)
        const normalized = normalizeConviction(rawDetail)

        if (!normalized) {
          if (!cancelled) {
            setState({
              data: null,
              prices: null,
              adjustments: null,
              loading: false,
              notFound: true,
              error: null,
            })
          }
          return
        }

        const [prices, adjustments] = await Promise.all([
          fetchStaticJson<AllPrices>('/runtime-data/prices.json').catch(() => null),
          fetchStaticJson<Record<string, PortfolioAdjustment>>('/runtime-data/portfolio-adjustments.json').catch(() => null),
        ])

        if (!cancelled) {
          setState({
            data: normalized,
            prices,
            adjustments,
            loading: false,
            notFound: false,
            error: null,
          })
        }
      } catch (error) {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Failed to load conviction detail'
        const notFound = message.includes('404')
        setState({
          data: null,
          prices: null,
          adjustments: null,
          loading: false,
          notFound,
          error: notFound ? null : message,
        })
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [slug])

  if (state.loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
        Loading conviction research...
      </div>
    )
  }

  if (state.notFound || !state.data) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center">
        <h1 className="text-xl font-bold text-gray-900">Conviction thesis not found</h1>
        <Link href="/convictions" className="mt-4 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-800">
          Back to conviction bets
        </Link>
      </div>
    )
  }

  const data = state.data
  const quotes = normalizeQuotes(data.investor_in_their_own_words)
  const risks = normalizeRisks(data.risks)
  const bestQuote = quotes[0]
  const thesisBullets = getThesisBullets(data)
  const businessBullets = getBusinessBullets(data)
  const financialMetrics = getFinancialMetrics(data)
  const priceData = getCurrentPriceFromPayload(state.prices, data.ticker)
  const adjusted = getAdjustedWeightFromPayload(
    state.adjustments,
    typeof data.investor_key === 'string' ? data.investor_key : null,
    data.weight_pct ?? 0,
  )

  return (
    <div className="space-y-10 pb-8">
      <nav className="text-sm text-gray-400">
        <Link href="/convictions" className="hover:text-gray-600 transition">
          Conviction Bets
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-600">
          {data.investor_name} &times; {data.ticker}
        </span>
      </nav>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 sm:px-8 py-8 sm:py-10">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 leading-tight max-w-3xl">
            {data.thesis_headline}
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <PortfolioWeightBadge weight={adjusted.has_adjustment && adjusted.adjusted_pct !== null ? adjusted.adjusted_pct : (data.weight_pct ?? 0)} size="md" />
              <div>
                <p className="text-sm font-semibold text-gray-900">{data.investor_name}</p>
                <p className="text-xs text-gray-400">{data.firm_name}</p>
                {adjusted.has_adjustment && adjusted.adjusted_pct !== null ? (
                  <>
                    <p className="text-sm font-semibold text-gray-700">Est. ~{adjusted.adjusted_pct.toFixed(1)}% of total portfolio</p>
                    <p className="text-xs text-gray-400">({(data.weight_pct ?? 0).toFixed(1)}% of US 13F portfolio)</p>
                  </>
                ) : data.weight_pct != null ? (
                  <p className="text-sm font-semibold text-gray-700">{data.weight_pct.toFixed(1)}% of US 13F portfolio</p>
                ) : null}
              </div>
            </div>
            <div className="h-8 w-px bg-gray-200 hidden sm:block" />
            <div>
              <span className="font-mono text-xl font-extrabold text-gray-900">
                {data.ticker}
              </span>
              <span className="ml-2 text-sm text-gray-500">{data.company_name}</span>
              {priceData && (
                <span className="ml-3 font-mono text-lg text-gray-700">
                  ${priceData.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {priceData.prev_close > 0 && (
                    <span className={`ml-1 text-sm ${priceData.price >= priceData.prev_close ? 'text-green-600' : 'text-red-500'}`}>
                      {priceData.price >= priceData.prev_close ? '\u25B2' : '\u25BC'}
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="h-8 w-px bg-gray-200 hidden sm:block" />
            <div className="text-sm text-gray-500">
              Value: <span className="font-semibold text-gray-700">{formatValue(data.value_millions)}</span>
            </div>
          </div>

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

      {businessBullets.length > 0 && (
        <section className="bg-gray-50 rounded-xl border border-gray-200 px-6 sm:px-8 py-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">The Business</h2>
          <ul className="space-y-3">
            {businessBullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-600 leading-relaxed">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                {bullet}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(thesisBullets.length > 0 || bestQuote) && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 sm:px-8 py-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Why They Own It</h2>

          {bestQuote && (
            <blockquote className="mb-5 pl-4 border-l-4 border-purple-400 py-3 pr-4">
              <p className="text-base text-gray-700 italic leading-relaxed">
                &ldquo;{bestQuote.quote}&rdquo;
              </p>
              <footer className="mt-2 text-sm text-gray-400">
                &mdash; {data.investor_name}
                {bestQuote.source && <>, {bestQuote.source}</>}
                {bestQuote.date && <> ({bestQuote.date})</>}
              </footer>
            </blockquote>
          )}

          {thesisBullets.length > 0 && (
            <ul className="space-y-3">
              {thesisBullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-700 leading-relaxed">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                  {bullet}
                </li>
              ))}
            </ul>
          )}

          {data.why_this_price && (
            <div className="mt-5 p-4 bg-purple-50 rounded-lg border border-purple-100">
              <h3 className="text-sm font-semibold text-purple-800 mb-1">
                What the investor sees
              </h3>
              <p className="text-sm text-purple-700 leading-relaxed">{data.why_this_price}</p>
            </div>
          )}
        </section>
      )}

      {Object.keys(financialMetrics).length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">Financial Snapshot</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(financialMetrics).map(([key, value]) => (
              <div
                key={key}
                className="bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3 text-center"
              >
                <p className="text-base sm:text-lg font-extrabold text-gray-900 break-words">{value}</p>
                <p className="mt-1 text-xs text-gray-500 font-medium uppercase tracking-wide">
                  {key.replace(/_/g, ' ').replace(/fy\d{4}/i, (match) => match.toUpperCase())}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.moat_sources && data.moat_sources.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-5">
          <h2 className="text-lg font-bold text-gray-900 mb-3">The Moat</h2>
          <ul className="space-y-2">
            {data.moat_sources.map((moat: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
                {moat}
              </li>
            ))}
          </ul>
        </section>
      )}

      {risks.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">What Could Go Wrong</h2>
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

      {data.catalysts && data.catalysts.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-5">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Catalysts</h2>
          <ul className="space-y-2">
            {data.catalysts.map((catalyst: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                {catalyst}
              </li>
            ))}
          </ul>
        </section>
      )}

      {quotes.length > 1 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 sm:px-8 py-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">In Their Own Words</h2>
          <div className="space-y-5">
            {quotes.slice(1).map((quote, i) => (
              <blockquote
                key={i}
                className="pl-4 border-l-2 border-gray-200 py-1"
              >
                <p className="text-gray-600 italic leading-relaxed">
                  &ldquo;{quote.quote}&rdquo;
                </p>
                {(quote.source || quote.date || quote.url) && (
                  <footer className="mt-1 text-xs text-gray-400">
                    {quote.source && <>{quote.source}</>}
                    {quote.date && <> ({quote.date})</>}
                    {quote.url && (
                      <>
                        {' '}&mdash;{' '}
                        <a
                          href={quote.url}
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

      {state.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

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
