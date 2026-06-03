'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchApiJson, fetchPriceMap } from '@/lib/api'
import {
  buildRuntimeTrackRecords,
  type RuntimeInvestmentRecord,
  type TrackRecordApiGroup,
} from '@/lib/track-record'
import { spxAnnualized, spxClose, SPX_LATEST, SPX_ASOF } from '@/lib/spx'

interface InvestorLite {
  name: string
  slug: string
  latest_report_date: string | null
}

type RankMode = 'entry' | 'curr' | 'ret' | 'recent'

const EVENT_THRESHOLD = 4 // only show adds/trims that move the position >= 4% (shares)

interface Ev {
  type: 'open' | 'add' | 'trim' | 'exit'
  quarter: string
  chgPct: number | null   // share change %
  weight: number          // resulting % of portfolio
  price: number | null    // avg cost that quarter
  value: number           // position $ value (thousands) that quarter
}

interface Lane {
  tk: string
  name: string
  linkable: boolean
  status: 'held' | 'exited'
  firstQ: string
  firstQi: number
  years: number
  avgCost: number | null
  currentOrExitPrice: number | null
  currentWeight: number
  currentValue: number | null
  currentShares: number | null
  ret: number | null          // vs avg cost
  annualized: number | null
  spxAnnual: number | null
  events: Ev[]
}

function qIndex(q: string): number {
  const [y, qq] = q.split('-Q')
  return parseInt(y, 10) * 4 + (parseInt(qq, 10) - 1)
}
function nextQuarter(q: string): string {
  const i = qIndex(q) + 1
  return `${Math.floor(i / 4)}-Q${(i % 4) + 1}`
}

function fmtPrice(p: number | null): string {
  if (p == null) return '--'
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  return `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtValue(v: number | null): string {
  if (v == null) return '--'
  const a = Math.abs(v)
  if (a >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}B`
  if (a >= 1_000) return `$${(v / 1_000).toFixed(0)}M`
  return `$${v.toFixed(0)}K`
}
function fmtShares(s: number | null): string {
  if (s == null) return '--'
  const a = Math.abs(s)
  if (a >= 1_000_000) return `${(s / 1_000_000).toFixed(1)}M`
  if (a >= 1_000) return `${(s / 1_000).toFixed(0)}K`
  return s.toLocaleString()
}
function fmtPct(p: number | null, withSign = true): string {
  if (p == null) return '--'
  return `${withSign && p >= 0 ? '+' : ''}${p.toFixed(p >= 100 || p <= -100 ? 0 : 1)}%`
}
function tidyTicker(tk: string, name: string): string {
  if (!tk || /^\d{4,}/.test(tk)) return name.split(' ').slice(0, 2).join(' ')
  return tk
}

function toLane(r: RuntimeInvestmentRecord): Lane {
  const tl = r.timeline
  const events: Ev[] = []
  tl.forEach((t) => {
    if (t.action === 'NEW') {
      events.push({ type: 'open', quarter: t.quarter, chgPct: null, weight: t.weight_pct, price: t.estimated_price, value: t.value_thousands })
    } else if (t.action === 'INCREASED' || t.action === 'DECREASED') {
      const prev = t.shares - t.share_delta
      const pct = prev > 0 ? (t.share_delta / prev) * 100 : null
      if (pct != null && Math.abs(pct) >= EVENT_THRESHOLD) {
        events.push({ type: t.action === 'INCREASED' ? 'add' : 'trim', quarter: t.quarter, chgPct: pct, weight: t.weight_pct, price: t.estimated_price, value: t.value_thousands })
      }
    }
  })
  if (!r.is_current && tl.length) {
    events.push({ type: 'exit', quarter: nextQuarter(r.last_seen_quarter), chgPct: null, weight: 0, price: r.exit_price, value: 0 })
  }
  const years = Math.max(r.holding_period_quarters / 4, 0.25)
  const endClose = r.is_current ? SPX_LATEST : spxClose(r.last_seen_quarter)
  return {
    tk: r.ticker,
    name: r.company_name,
    linkable: /^[A-Za-z][A-Za-z.\-]{0,5}$/.test(r.ticker),
    status: r.is_current ? 'held' : 'exited',
    firstQ: r.first_seen_quarter,
    firstQi: qIndex(r.first_seen_quarter),
    years,
    avgCost: r.weighted_avg_entry_price ?? r.estimated_entry_price,
    currentOrExitPrice: r.is_current ? r.current_price : r.exit_price,
    currentWeight: r.current_weight_pct ?? 0,
    currentValue: r.current_value_thousands,
    currentShares: r.timeline[r.timeline.length - 1]?.shares ?? null,
    ret: r.price_return_pct,
    annualized: r.annualized_return_pct,
    spxAnnual: spxAnnualized(r.first_seen_quarter, endClose, years),
    events,
  }
}

const EV_META: Record<Ev['type'], { dot: string; label: string }> = {
  open: { dot: '#16a34a', label: 'Opened' },
  add: { dot: '#2563eb', label: 'Added' },
  trim: { dot: '#ea580c', label: 'Trimmed' },
  exit: { dot: '#dc2626', label: 'Exited' },
}

export default function TrackRecordClient({ slug }: { slug: string }) {
  const [investor, setInvestor] = useState<InvestorLite | null>(null)
  const [lanes, setLanes] = useState<Lane[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [rankMode, setRankMode] = useState<RankMode>('entry')
  const [showAllPos, setShowAllPos] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const inv = await fetchApiJson<InvestorLite>(`/api/investor/${slug}`)
        const groups = await fetchApiJson<TrackRecordApiGroup[]>(`/api/investor/${slug}/track-record`)
        const symbols = Array.from(new Set(groups.map((g) => g.ticker).filter((t): t is string => Boolean(t) && !/^\d{5,}/.test(t!))))
        const prices = await fetchPriceMap(symbols)
        const records = buildRuntimeTrackRecords(groups, prices)
        if (!cancelled) {
          setInvestor(inv)
          setLanes(records.filter((r) => r.timeline.length > 0).map(toLane))
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
    return () => { cancelled = true }
  }, [slug])

  const ranked = useMemo(() => {
    const list = [...lanes]
    if (rankMode === 'entry') list.sort((a, b) => (b.events[0]?.weight ?? 0) - (a.events[0]?.weight ?? 0))
    if (rankMode === 'curr') list.sort((a, b) => (b.status === 'held' ? b.currentWeight : -1) - (a.status === 'held' ? a.currentWeight : -1))
    if (rankMode === 'ret') list.sort((a, b) => (b.ret ?? -1e9) - (a.ret ?? -1e9))
    if (rankMode === 'recent') list.sort((a, b) => b.firstQi - a.firstQi)
    return list
  }, [lanes, rankMode])

  if (loading) {
    return <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">Loading position history...</div>
  }
  if (notFound || !investor) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center">
        <h1 className="text-xl font-bold text-gray-900">Investor not found</h1>
        <Link href="/investors" className="mt-4 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-800">Back to investors</Link>
      </div>
    )
  }

  const LIMIT = 12
  const shown = showAllPos ? ranked : ranked.slice(0, LIMIT)

  function toggle(tk: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(tk) ? n.delete(tk) : n.add(tk); return n })
  }

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-900">Home</Link><span className="text-gray-300">/</span>
        <Link href="/investors" className="hover:text-gray-900">Investors</Link><span className="text-gray-300">/</span>
        <Link href={`/investors/${slug}`} className="hover:text-gray-900">{investor.name}</Link><span className="text-gray-300">/</span>
        <span className="text-gray-900 font-medium">History</span>
      </nav>

      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">{investor.name} &mdash; Position History</h1>
        <p className="mt-1 text-sm text-gray-500">Every position laid out over time: opened, added to, trimmed, exited — at the average cost each quarter, sized as a share of the portfolio.</p>
      </div>

      <div className="flex gap-2">
        <Link href={`/investors/${slug}`} className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-white text-gray-600 border border-gray-200 hover:bg-gray-50">Overview</Link>
        <span className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-gray-900 text-white border border-gray-900">History</span>
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-[13px] text-indigo-900">
        <b>Returns &amp; cost basis:</b> &ldquo;avg cost&rdquo; is the share-weighted average of every buy (each quarter&rsquo;s 13F value &divide; shares). Return is the latest price (or exit price) vs that avg cost; annualized over the holding period and benchmarked against the S&amp;P 500 over the same window (S&amp;P as of {SPX_ASOF}). All estimates from quarter-end 13F snapshots — not actual fills.
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-bold text-gray-500">Rank:</span>
        {([['entry', '% at purchase'], ['curr', 'Current weight'], ['ret', 'Return'], ['recent', 'Most recent']] as [RankMode, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setRankMode(k)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${rankMode === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{label}</button>
        ))}
        <span className="ml-auto text-xs text-gray-400">Showing {shown.length} of {ranked.length}</span>
      </div>

      <div className="space-y-3">
        {shown.map((l) => {
          const isOpen = expanded.has(l.tk)
          const evs = isOpen || l.events.length <= 6 ? l.events : [...l.events.slice(0, 4), ...l.events.slice(-1)]
          const hiddenCount = l.events.length - evs.length
          const retCls = (l.ret ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'
          return (
            <div key={l.tk + l.firstQ} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              {/* header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {l.linkable
                      ? <Link href={`/stocks/${encodeURIComponent(l.tk)}`} className="font-mono font-extrabold text-base text-indigo-600 hover:text-indigo-800">{tidyTicker(l.tk, l.name)}</Link>
                      : <span className="font-mono font-extrabold text-base text-gray-800">{tidyTicker(l.tk, l.name)}</span>}
                    <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${l.status === 'held' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {l.status === 'held' ? `held · ${l.currentWeight.toFixed(0)}%` : 'exited'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 truncate">{l.name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-xl font-extrabold ${retCls}`}>{fmtPct(l.ret)}</div>
                  <div className="text-[11px] text-gray-500">{l.status === 'held' ? 'vs avg cost' : 'on exit'} {fmtPrice(l.avgCost)} &rarr; {fmtPrice(l.currentOrExitPrice)}</div>
                  {l.annualized != null && (
                    <div className="text-[11px] mt-0.5">
                      <span className="font-semibold text-gray-700">{fmtPct(l.annualized)}/yr</span>
                      {l.spxAnnual != null && (
                        <span className="text-gray-400"> · S&amp;P {fmtPct(l.spxAnnual)}/yr</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* event log */}
              <ol className="mt-3 space-y-1.5 border-l border-gray-100 pl-3">
                {evs.map((e, i) => {
                  const meta = EV_META[e.type]
                  return (
                    <li key={i} className="relative text-[13px] leading-snug">
                      <span className="absolute -left-[15px] top-1.5 w-2 h-2 rounded-full ring-2 ring-white" style={{ background: meta.dot }} />
                      <span className="font-semibold text-gray-800">{meta.label}</span>
                      <span className="text-gray-400"> {e.quarter}</span>
                      {e.type === 'open' && (
                        <span className="text-gray-600"> — {e.weight.toFixed(1)}% of portfolio ({fmtValue(e.value)}) @ avg {fmtPrice(e.price)}</span>
                      )}
                      {(e.type === 'add' || e.type === 'trim') && (
                        <span className="text-gray-600"> — <span className={e.type === 'add' ? 'text-blue-600 font-semibold' : 'text-orange-600 font-semibold'}>{fmtPct(e.chgPct)} shares</span> → {e.weight.toFixed(1)}% of portfolio @ avg {fmtPrice(e.price)}</span>
                      )}
                      {e.type === 'exit' && (
                        <span className="text-gray-600"> — sold out, est. @ {fmtPrice(e.price)}</span>
                      )}
                    </li>
                  )
                })}
                {hiddenCount > 0 && (
                  <li className="relative text-[12px]">
                    <button onClick={() => toggle(l.tk)} className="text-indigo-600 hover:text-indigo-800 font-semibold">… show {hiddenCount} more move{hiddenCount > 1 ? 's' : ''}</button>
                  </li>
                )}
                {isOpen && l.events.length > 6 && (
                  <li className="relative text-[12px]">
                    <button onClick={() => toggle(l.tk)} className="text-gray-400 hover:text-gray-600 font-semibold">collapse</button>
                  </li>
                )}
                {l.status === 'held' && (
                  <li className="relative text-[13px] leading-snug">
                    <span className="absolute -left-[15px] top-1.5 w-2 h-2 rounded-full ring-2 ring-white bg-indigo-600" />
                    <span className="font-semibold text-indigo-900">Now</span>
                    <span className="text-gray-600"> — {fmtShares(l.currentShares)} sh · {l.currentWeight.toFixed(1)}% of portfolio · {fmtValue(l.currentValue)} @ {fmtPrice(l.currentOrExitPrice)}</span>
                  </li>
                )}
              </ol>
            </div>
          )
        })}
      </div>

      {ranked.length > LIMIT && (
        <div className="text-center">
          <button onClick={() => setShowAllPos((v) => !v)} className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">
            {showAllPos ? `Show top ${LIMIT}` : `Show all ${ranked.length} positions`}
          </button>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Adds/trims that moved the position less than {EVENT_THRESHOLD}% (shares) are folded in to keep the log readable — expand a position to see them. 13F = long US equity only, ~45-day delay. Not investment advice.
      </p>
    </div>
  )
}
