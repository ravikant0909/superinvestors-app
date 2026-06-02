'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchApiJson, fetchPriceMap } from '@/lib/api'
import { getConvictionHref } from '@/lib/conviction-index'
import { getStockReport, type StockReport } from '@/lib/static-reports'

interface Holder {
  investor_name: string
  investor_slug: string
  investor_firm: string
  verdict_follow: string | null
  investor_score: number | null
  shares: number
  value: number
  pct_of_portfolio: number | null
  position_rank: number | null
  report_date: string | null
}

interface StockChange {
  change_type: 'NEW' | 'INCREASED' | 'DECREASED' | 'SOLD_OUT'
  shares_change: number
  value_change: number
  shares_change_pct: number | null
  pct_of_portfolio_before: number | null
  pct_of_portfolio_after: number | null
  year: number
  quarter: number
  report_date: string
  investor_name: string
  investor_slug: string
}

interface StockDetail {
  id: number
  ticker: string
  name: string
  slug: string | null
  sector: string | null
  industry: string | null
  cusip: string | null
  holder_count: number
  total_value: number
  avg_weight: number
  holders: Holder[]
  recent_changes: StockChange[]
}

function titleCase(text: string): string {
  return text.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
function fmtValue(value: number | null): string {
  if (!value) return '—'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}B`
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}M`
  return `$${value.toFixed(0)}K`
}
function fmtShares(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return value.toLocaleString()
}
function fmtPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function changeBadge(type: string): string {
  switch (type) {
    case 'NEW': return 'bg-green-100 text-green-700 border-green-300'
    case 'INCREASED': return 'bg-blue-100 text-blue-700 border-blue-300'
    case 'DECREASED': return 'bg-orange-100 text-orange-700 border-orange-300'
    case 'SOLD_OUT': return 'bg-red-100 text-red-700 border-red-300'
    default: return 'bg-gray-100 text-gray-700 border-gray-300'
  }
}
function changeVerb(type: string): string {
  switch (type) {
    case 'NEW': return 'NEW'
    case 'INCREASED': return 'ADDED'
    case 'DECREASED': return 'TRIMMED'
    case 'SOLD_OUT': return 'EXIT'
    default: return type
  }
}

export default function StockDetailClient({ ticker }: { ticker: string }) {
  const [stock, setStock] = useState<StockDetail | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await fetchApiJson<StockDetail>(`/api/stocks/${encodeURIComponent(ticker)}`)
        if (cancelled) return
        setStock(data)
        setLoaded(true)
        const priceMap = await fetchPriceMap([ticker])
        if (!cancelled && priceMap[ticker] != null) setPrice(priceMap[ticker])
      } catch {
        if (!cancelled) { setNotFound(true); setLoaded(true) }
      }
    }
    load()
    return () => { cancelled = true }
  }, [ticker])

  const report = getStockReport(ticker)

  if (!loaded) {
    return <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center text-sm text-gray-400">Loading {ticker}…</div>
  }
  if (notFound || !stock) {
    return (
      <div className="space-y-4">
        <nav className="text-sm text-gray-500">
          <Link href="/stocks" className="hover:text-gray-700">Stocks</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{ticker}</span>
        </nav>
        {report && (
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 font-mono mb-1">{ticker}</h1>
            <p className="text-gray-600 mb-4">{report.name}</p>
            <DeepDiveCard report={report} />
          </div>
        )}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          {report
            ? <>Not currently held by any tracked investor — but we have the deep-dive research report above.</>
            : <>No tracked investor reports holding <span className="font-mono font-semibold">{ticker}</span> in the latest 13F data.</>}
        </div>
      </div>
    )
  }

  const maxWeight = stock.holders.reduce((m, h) => Math.max(m, h.pct_of_portfolio ?? 0), 0) || 1

  return (
    <div className="space-y-8">
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-700">Home</Link>
        <span className="mx-2">/</span>
        <Link href="/stocks" className="hover:text-gray-700">Stocks</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">{stock.ticker}</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-extrabold text-gray-900 font-mono">{stock.ticker}</h1>
          {price != null && <span className="text-xl font-mono text-gray-500">{fmtPrice(price)}</span>}
        </div>
        <p className="mt-1 text-lg text-gray-600">{titleCase(stock.name)}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {stock.sector && <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{stock.sector}</span>}
          {stock.industry && <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{stock.industry}</span>}
          {stock.cusip && <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 font-mono">CUSIP {stock.cusip}</span>}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label="Owned by" value={`${stock.holder_count}`} sub="tracked investors" />
          <Stat label="Total held" value={fmtValue(stock.total_value)} sub="across investors" />
          <Stat label="Avg weight" value={`${stock.avg_weight.toFixed(1)}%`} sub="of portfolio" />
        </div>
      </div>

      {report && <DeepDiveCard report={report} />}

      {/* Who owns it */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-3">Who owns {stock.ticker}</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-4 py-3">Investor</th>
                <th className="px-4 py-3 hidden sm:table-cell">Firm</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">Shares</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right">% Port</th>
              </tr>
            </thead>
            <tbody>
              {stock.holders.map((h) => {
                const convictionHref = getConvictionHref(h.investor_slug, stock.ticker)
                return (
                  <tr key={h.investor_slug} className="border-b border-gray-50 hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/investors/${h.investor_slug}`} className="font-semibold text-gray-900 hover:text-indigo-600">
                          {h.investor_name}
                        </Link>
                        {h.investor_score != null && (
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold ${
                            h.investor_score >= 8 ? 'bg-green-100 text-green-700' :
                            h.investor_score >= 7 ? 'bg-blue-100 text-blue-700' :
                            h.investor_score >= 6 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                          }`}>{h.investor_score.toFixed(1)}</span>
                        )}
                      </div>
                      {convictionHref && (
                        <Link href={convictionHref} className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium">Conviction &rarr;</Link>
                      )}
                      <div className="sm:hidden text-[11px] text-gray-400">{h.investor_firm}</div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-500 truncate max-w-[200px]">{h.investor_firm}</td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell font-mono text-gray-700">{fmtShares(h.shares)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{fmtValue(h.value)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden sm:block w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full bg-indigo-400" style={{ width: `${Math.max(4, ((h.pct_of_portfolio ?? 0) / maxWeight) * 100)}%` }} />
                        </div>
                        <span className="font-mono font-semibold text-gray-900 tabular-nums">{(h.pct_of_portfolio ?? 0).toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent changes */}
      {stock.recent_changes.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Recent moves in {stock.ticker}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {stock.recent_changes.slice(0, 12).map((c, i) => (
              <div key={`${c.investor_slug}-${i}`} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/investors/${c.investor_slug}`} className="text-sm font-semibold text-gray-900 hover:text-indigo-600 truncate">
                    {c.investor_name}
                  </Link>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${changeBadge(c.change_type)}`}>
                    {changeVerb(c.change_type)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span><span className="text-gray-400">{c.value_change > 0 ? 'Added' : 'Reduced'}: </span><span className={`font-mono font-semibold ${c.value_change > 0 ? 'text-green-600' : 'text-red-500'}`}>{c.value_change > 0 ? '+' : ''}{fmtValue(c.value_change)}</span></span>
                  <span><span className="text-gray-400">Qtr: </span><span className="font-mono font-semibold text-gray-700">{c.year}-Q{c.quarter}</span></span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-gray-400 leading-relaxed">
        Based on the latest loaded SEC 13F filings (long US equity only, ~45-day delay). Not investment advice.
      </p>
    </div>
  )
}

function DeepDiveCard({ report }: { report: StockReport }) {
  return (
    <a
      href={report.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-indigo-50 border border-indigo-200 rounded-xl p-4 hover:bg-indigo-100 transition"
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>📄</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-indigo-900">
            Deep-dive research report{report.version === 'V2' ? ' · facts-only (V2)' : ''} &rarr;
          </div>
          <div className="text-sm text-indigo-700">
            Future demand vs supply, and the price you pay now — plain-English, money-in/money-out. Opens in a new tab.
          </div>
        </div>
      </div>
    </a>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-xl font-bold text-gray-900 tabular-nums">{value}</div>
      <div className="text-[11px] text-gray-400">{sub}</div>
    </div>
  )
}
