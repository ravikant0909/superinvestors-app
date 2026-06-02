'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchApiJson } from '@/lib/api'
import { STOCK_REPORTS } from '@/lib/static-reports'

const REPORT_SET = new Set(STOCK_REPORTS.map((r) => r.ticker.toUpperCase()))

interface StockRow {
  security_id: number
  ticker: string | null
  name: string
  security_slug: string | null
  sector: string | null
  cusip: string | null
  holder_count: number
  total_value: number | null
  avg_weight: number | null
  max_weight: number | null
  latest_report_date: string | null
  hasReport?: boolean
}

type SortKey = 'holders' | 'value' | 'weight' | 'ticker'

function fmtValue(value: number | null): string {
  if (!value) return '—'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}B`
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}M`
  return `$${value.toFixed(0)}K`
}

function titleCase(text: string): string {
  return text.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function isNoiseTicker(ticker: string | null): boolean {
  if (!ticker) return true
  return /^\d{4,}/.test(ticker) // CUSIP-like / numeric pseudo-tickers
}

const PAGE_SIZE = 40

export default function StocksClient() {
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('holders')
  const [reportOnly, setReportOnly] = useState(false)
  const [visible, setVisible] = useState(PAGE_SIZE)

  useEffect(() => {
    let cancelled = false
    fetchApiJson<StockRow[]>('/api/stocks')
      .then((data) => { if (!cancelled) { setStocks(data); setLoaded(true) } })
      .catch(() => { if (!cancelled) { setFailed(true); setLoaded(true) } })
    return () => { cancelled = true }
  }, [])

  // Combined universe: held stocks (tagged with hasReport) plus report-only
  // tickers that no tracked investor holds, so the full research corpus is browsable.
  const combined = useMemo(() => {
    const held = stocks
      .filter((s) => !isNoiseTicker(s.ticker))
      .map((s) => ({ ...s, hasReport: REPORT_SET.has((s.ticker ?? '').toUpperCase()) }))
    const heldTickers = new Set(held.map((s) => (s.ticker ?? '').toUpperCase()))
    const reportOnlyRows: StockRow[] = STOCK_REPORTS
      .filter((r) => !heldTickers.has(r.ticker.toUpperCase()))
      .map((r, i) => ({
        security_id: -1 - i,
        ticker: r.ticker,
        name: r.name,
        security_slug: null,
        sector: r.sector,
        cusip: null,
        holder_count: 0,
        total_value: 0,
        avg_weight: null,
        max_weight: null,
        latest_report_date: null,
        hasReport: true,
      }))
    return [...held, ...reportOnlyRows]
  }, [stocks])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = combined
    if (reportOnly) rows = rows.filter((s) => s.hasReport)
    if (q) {
      rows = rows.filter((s) =>
        (s.ticker ?? '').toLowerCase().includes(q) ||
        (s.name ?? '').toLowerCase().includes(q),
      )
    }
    const sorted = [...rows]
    sorted.sort((a, b) => {
      switch (sort) {
        case 'value': return (b.total_value ?? 0) - (a.total_value ?? 0)
        case 'weight': return (b.avg_weight ?? 0) - (a.avg_weight ?? 0)
        case 'ticker': return (a.ticker ?? '').localeCompare(b.ticker ?? '')
        default: return (b.holder_count - a.holder_count) || ((b.total_value ?? 0) - (a.total_value ?? 0))
      }
    })
    return sorted
  }, [combined, query, sort, reportOnly])

  useEffect(() => { setVisible(PAGE_SIZE) }, [query, sort, reportOnly])

  if (!loaded) {
    return <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center text-sm text-gray-400">Loading stocks…</div>
  }
  if (failed || stocks.length === 0) {
    return <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">Stock data is unavailable right now.</div>
  }

  const maxHolders = filtered.reduce((m, s) => Math.max(m, s.holder_count), 1)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ticker or company…"
          className="w-full sm:max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <div className="flex gap-2 flex-wrap">
          {([['holders', 'Most held'], ['value', 'Total value'], ['weight', 'Avg weight'], ['ticker', 'A–Z']] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                sort === key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setReportOnly((v) => !v)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
              reportOnly ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'
            }`}
          >
            📄 Deep-dive only
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        {filtered.length.toLocaleString()} stocks{reportOnly ? ' with a deep-dive report' : ` · ${REPORT_SET.size} have a deep-dive report`}
      </p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="px-4 py-3">Ticker</th>
              <th className="px-4 py-3 hidden sm:table-cell">Company</th>
              <th className="px-4 py-3 text-right">Holders</th>
              <th className="px-4 py-3 text-right hidden sm:table-cell">Total value</th>
              <th className="px-4 py-3 text-right">Avg wt</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, visible).map((s) => (
              <tr key={s.security_id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1">
                    <Link href={`/stocks/${encodeURIComponent(s.ticker as string)}`} className="font-mono font-bold text-indigo-600 hover:text-indigo-800">
                      {s.ticker}
                    </Link>
                    {s.hasReport && <span title="Has a deep-dive research report" aria-label="Has deep-dive report">📄</span>}
                  </span>
                  <div className="sm:hidden text-[11px] text-gray-400 truncate max-w-[160px]">{titleCase(s.name)}</div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-gray-600 truncate max-w-[260px]">{titleCase(s.name)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden sm:block w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-indigo-400" style={{ width: `${Math.max(6, (s.holder_count / maxHolders) * 100)}%` }} />
                    </div>
                    <span className="font-semibold text-gray-900 tabular-nums">{s.holder_count}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right hidden sm:table-cell font-mono text-gray-700">{fmtValue(s.total_value)}</td>
                <td className="px-4 py-3 text-right font-mono text-gray-700">{s.avg_weight != null ? `${s.avg_weight.toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible < filtered.length && (
        <div className="text-center">
          <button
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  )
}
