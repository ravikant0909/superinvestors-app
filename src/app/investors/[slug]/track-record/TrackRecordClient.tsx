'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchApiJson, fetchPriceMap } from '@/lib/api'
import type { TrackRecordApiGroup } from '@/lib/track-record'
import { buildHistoryView, type HistoryView } from '@/lib/history-view'
import { SPX_ASOF } from '@/lib/spx'
import LedgerView from './LedgerView'
import TradeTapeView from './TradeTapeView'
import TimelineBoxesView from './TimelineBoxesView'

interface InvestorLite { name: string; slug: string; latest_report_date: string | null }
type Tab = 'ledger' | 'tape' | 'timeline'

const TABS: { key: Tab; label: string; blurb: string }[] = [
  { key: 'ledger', label: 'Ledger', blurb: 'Every position in one sortable table' },
  { key: 'tape', label: 'Trade Tape', blurb: 'Every move, newest first, by quarter' },
  { key: 'timeline', label: 'Timeline', blurb: 'One row per stock, a box per change' },
]

export default function TrackRecordClient({ slug }: { slug: string }) {
  const [investor, setInvestor] = useState<InvestorLite | null>(null)
  const [view, setView] = useState<HistoryView | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<Tab>('ledger')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const inv = await fetchApiJson<InvestorLite>(`/api/investor/${slug}`)
        const groups = await fetchApiJson<TrackRecordApiGroup[]>(`/api/investor/${slug}/track-record`)
        const symbols = Array.from(
          new Set(groups.map((g) => g.ticker).filter((t): t is string => Boolean(t) && !/^\d{5,}/.test(t!))),
        )
        const prices = await fetchPriceMap(symbols)
        const built = buildHistoryView(groups, prices)
        if (!cancelled) {
          setInvestor(inv)
          setView(built)
          setLoading(false)
        }
      } catch (err) {
        if (cancelled) return
        const m = err instanceof Error ? err.message.toLowerCase() : ''
        setNotFound(m.includes('404') || m.includes('not found'))
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [slug])

  const counts = useMemo(() => view?.summary.counts, [view])

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
        Loading position history...
      </div>
    )
  }
  if (notFound || !investor || !view) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center">
        <h1 className="text-xl font-bold text-gray-900">Investor not found</h1>
        <Link href="/investors" className="mt-4 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-800">
          Back to investors
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-900">Home</Link>
        <span className="text-gray-300">/</span>
        <Link href="/investors" className="hover:text-gray-900">Investors</Link>
        <span className="text-gray-300">/</span>
        <Link href={`/investors/${slug}`} className="hover:text-gray-900">{investor.name}</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900 font-medium">History</span>
      </nav>

      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          {investor.name} &mdash; Position History
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {counts?.total} positions · {counts?.held} held now · {counts?.exited} exited
          {investor.latest_report_date ? <> · 13F as of {investor.latest_report_date}</> : null}. Three ways
          to read the same record — pick the lens that fits.
        </p>
      </div>

      <div className="flex gap-2">
        <Link href={`/investors/${slug}`} className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-white text-gray-600 border border-gray-200 hover:bg-gray-50">Overview</Link>
        <span className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-gray-900 text-white border border-gray-900">History</span>
      </div>

      {/* three-view switcher */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex flex-col items-start px-4 py-2 rounded-xl border text-left transition-colors ${
              tab === t.key
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <span className="text-sm font-bold">{t.label}</span>
            <span className={`text-[11px] ${tab === t.key ? 'text-indigo-100' : 'text-gray-400'}`}>{t.blurb}</span>
          </button>
        ))}
      </div>

      {tab === 'ledger' && <LedgerView view={view} slug={slug} />}
      {tab === 'tape' && <TradeTapeView view={view} slug={slug} />}
      {tab === 'timeline' && <TimelineBoxesView view={view} slug={slug} />}

      <p className="text-[11px] text-gray-400">
        Prices are 13F-estimated quarter-mean marks (midpoint of consecutive quarter-end value÷shares);
        exits are locked at the sell-quarter mark. Returns are benchmarked vs the S&amp;P 500 over the same
        window (S&amp;P {SPX_ASOF}). 13F = long US equity only, ~45-day delay. Not investment advice.
      </p>
    </div>
  )
}
