'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchApiJson } from '@/lib/api'

interface OverlapStock {
  security_id: number
  ticker: string
  name: string
  security_slug: string | null
  sector: string | null
  holder_count: number
  total_value: number | null
}
interface OverlapInvestor {
  slug: string
  name: string
  score: number | null
  holdings: number
}
interface OverlapCell {
  security_id: number
  investor_slug: string
  weight: number | null
}
interface OverlapData {
  stocks: OverlapStock[]
  investors: OverlapInvestor[]
  cells: OverlapCell[]
}

const STOCK_COLS = 28 // keep the matrix readable

function cellStyle(weight: number | null): React.CSSProperties {
  if (weight == null || weight <= 0) return { background: '#fafafa' }
  const intensity = Math.min(weight / 20, 1) // full color by ~20% weight
  return {
    background: `rgba(79, 70, 229, ${0.12 + intensity * 0.85})`,
    color: intensity > 0.45 ? '#fff' : '#3730a3',
  }
}

export default function OverlapClient() {
  const [data, setData] = useState<OverlapData | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchApiJson<OverlapData>('/api/overlap?limit=40')
      .then((d) => { if (!cancelled) { setData(d); setLoaded(true) } })
      .catch(() => { if (!cancelled) { setFailed(true); setLoaded(true) } })
    return () => { cancelled = true }
  }, [])

  const view = useMemo(() => {
    if (!data) return null
    const stocks = data.stocks.slice(0, STOCK_COLS)
    const stockIds = new Set(stocks.map((s) => s.security_id))
    const cellMap = new Map<string, number>()
    for (const c of data.cells) {
      if (stockIds.has(c.security_id) && c.weight != null) {
        cellMap.set(`${c.investor_slug}|${c.security_id}`, c.weight)
      }
    }
    // count how many of the shown stocks each investor holds; keep those with >=2
    const investors = data.investors
      .map((inv) => ({
        ...inv,
        shown: stocks.reduce((n, s) => n + (cellMap.has(`${inv.slug}|${s.security_id}`) ? 1 : 0), 0),
      }))
      .filter((inv) => inv.shown >= 2)
      .sort((a, b) => (b.shown - a.shown) || ((b.score ?? 0) - (a.score ?? 0)))
    return { stocks, investors, cellMap }
  }, [data])

  if (!loaded) {
    return <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center text-sm text-gray-400">Loading overlap…</div>
  }
  if (failed || !view || view.stocks.length === 0) {
    return <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">Overlap data is unavailable right now.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>Less</span>
        <div className="flex">
          {[0.12, 0.35, 0.55, 0.75, 0.97].map((a, i) => (
            <span key={i} className="w-6 h-3 inline-block" style={{ background: `rgba(79,70,229,${a})` }} />
          ))}
        </div>
        <span>More conviction</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 min-w-[150px]">
                Investor
              </th>
              {view.stocks.map((s) => (
                <th key={s.security_id} className="px-1 py-2 border-b border-gray-100 align-bottom">
                  <Link href={`/stocks/${encodeURIComponent(s.ticker)}`} className="block text-indigo-600 hover:text-indigo-800 font-mono font-semibold whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: '78px' }}>
                    {s.ticker}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.investors.map((inv) => (
              <tr key={inv.slug}>
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-b border-gray-50 min-w-[150px]">
                  <Link href={`/investors/${inv.slug}`} className="font-medium text-gray-800 hover:text-indigo-600 whitespace-nowrap">
                    {inv.name}
                  </Link>
                </td>
                {view.stocks.map((s) => {
                  const w = view.cellMap.get(`${inv.slug}|${s.security_id}`) ?? null
                  return (
                    <td key={s.security_id} className="text-center border border-gray-50 tabular-nums" style={{ ...cellStyle(w), minWidth: '34px', height: '26px' }} title={w != null ? `${inv.name} · ${s.ticker} · ${w.toFixed(1)}%` : `${inv.name} does not hold ${s.ticker}`}>
                      {w != null && w >= 1 ? Math.round(w) : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Showing the {view.stocks.length} most-held stocks and the {view.investors.length} investors who own at least two of them. Numbers are position weight (% of portfolio). Scroll horizontally to see all stocks.
      </p>
    </div>
  )
}
