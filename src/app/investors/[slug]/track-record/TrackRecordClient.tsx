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

interface InvestorLite { name: string; slug: string; latest_report_date: string | null }
type RankMode = 'entry' | 'curr' | 'ret' | 'recent'

const EVENT_THRESHOLD = 4

function qIndex(q: string): number {
  const [y, qq] = q.split('-Q')
  return parseInt(y, 10) * 4 + (parseInt(qq, 10) - 1)
}
function qYear(qi: number): number { return Math.floor(qi / 4) }
function qLabel(qi: number): string { return `Q${(qi % 4) + 1} ${qYear(qi)}` }

interface Ev { qi: number; type: 'open' | 'add' | 'trim' | 'exit'; price: number | null; chgPct: number | null; weight: number }
interface Lane {
  tk: string; name: string; linkable: boolean
  status: 'held' | 'exited'
  firstQ: string; firstQi: number; nowQi: number
  years: number
  avgCost: number | null; endPrice: number | null; endIsLive: boolean
  currentWeight: number; currentValue: number | null; currentShares: number | null
  ret: number | null; annualized: number | null; spxAnnual: number | null
  priorStints: number; peakWeight: number
  points: { qi: number; w: number }[]
  events: Ev[]
}

const DOT_BG = { open: '#16a34a', add: '#2563eb', trim: '#ea580c', exit: '#dc2626' } as const
const GLYPH = { open: '●', add: '▲', trim: '▼', exit: '✕' } as const

function toLane(r: RuntimeInvestmentRecord): Lane {
  const segStart = qIndex(r.first_seen_quarter)
  const tl = r.timeline.filter((t) => qIndex(t.quarter) >= segStart)
  const points = tl.map((t) => ({ qi: qIndex(t.quarter), w: t.weight_pct }))
  const events: Ev[] = []
  tl.forEach((t) => {
    const qi = qIndex(t.quarter)
    if (t.action === 'NEW') {
      events.push({ qi, type: 'open', price: t.estimated_price, chgPct: null, weight: t.weight_pct })
    } else if (t.action === 'INCREASED' || t.action === 'DECREASED') {
      const prev = t.shares - t.share_delta
      const pct = prev > 0 ? (t.share_delta / prev) * 100 : null
      if (pct != null && Math.abs(pct) >= EVENT_THRESHOLD) {
        events.push({ qi, type: t.action === 'INCREASED' ? 'add' : 'trim', price: t.estimated_price, chgPct: pct, weight: t.weight_pct })
      }
    }
  })
  const lastT = tl[tl.length - 1]
  const lastQi = lastT ? qIndex(lastT.quarter) : segStart
  let nowQi = lastQi
  if (!r.is_current) {
    nowQi = lastQi + 1
    events.push({ qi: nowQi, type: 'exit', price: r.exit_price, chgPct: null, weight: 0 })
    points.push({ qi: nowQi, w: 0 })
  }
  const endIsLive = !!(r.is_current && r.current_price != null)
  const endPrice = r.is_current ? (r.current_price ?? lastT?.estimated_price ?? null) : r.exit_price
  return {
    tk: r.ticker,
    name: r.company_name,
    linkable: /^[A-Za-z][A-Za-z.\-]{0,5}$/.test(r.ticker),
    status: r.is_current ? 'held' : 'exited',
    firstQ: r.first_seen_quarter,
    firstQi: segStart,
    nowQi,
    years: Math.max(r.holding_period_quarters / 4, 0.25),
    avgCost: r.weighted_avg_entry_price ?? r.estimated_entry_price,
    endPrice,
    endIsLive,
    currentWeight: r.current_weight_pct ?? 0,
    currentValue: r.current_value_thousands,
    currentShares: lastT?.shares ?? null,
    ret: r.price_return_pct,
    annualized: r.annualized_return_pct,
    spxAnnual: spxAnnualized(r.first_seen_quarter, r.is_current ? SPX_LATEST : spxClose(r.last_seen_quarter), Math.max(r.holding_period_quarters / 4, 0.25)),
    priorStints: r.prior_stints,
    peakWeight: Math.max(1, ...points.map((p) => p.w)),
    points,
    events,
  }
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
function fmtPct(p: number | null): string {
  if (p == null) return '--'
  return `${p >= 0 ? '+' : ''}${Math.abs(p) >= 100 ? p.toFixed(0) : p.toFixed(1)}%`
}
function tidyTicker(tk: string, name: string): string {
  if (!tk || /^\d{4,}/.test(tk)) return name.split(' ').slice(0, 2).join(' ')
  return tk
}

const LANE_H = 56, A_TOP = 6, A_BOT = 50  // svg area coords; +18px label band above, +14px axis below

export default function TrackRecordClient({ slug }: { slug: string }) {
  const [investor, setInvestor] = useState<InvestorLite | null>(null)
  const [lanes, setLanes] = useState<Lane[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [rankMode, setRankMode] = useState<RankMode>('entry')
  const [showAll, setShowAll] = useState(false)

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

  if (loading) return <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">Loading position history...</div>
  if (notFound || !investor) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center">
        <h1 className="text-xl font-bold text-gray-900">Investor not found</h1>
        <Link href="/investors" className="mt-4 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-800">Back to investors</Link>
      </div>
    )
  }

  const LIMIT = 12
  const shown = showAll ? ranked : ranked.slice(0, LIMIT)

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
        <p className="mt-1 text-sm text-gray-500">Each position over time, left → right. The shaded shape is the position&rsquo;s % of the portfolio; dots mark buys and sells at the average cost that quarter.</p>
      </div>

      <div className="flex gap-2">
        <Link href={`/investors/${slug}`} className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-white text-gray-600 border border-gray-200 hover:bg-gray-50">Overview</Link>
        <span className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-gray-900 text-white border border-gray-900">History</span>
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-[13px] text-indigo-900">
        <b>Reading the chart:</b> height = % of portfolio over time; <span style={{ color: DOT_BG.open }}>●</span> opened · <span style={{ color: DOT_BG.add }}>▲</span> added · <span style={{ color: DOT_BG.trim }}>▼</span> trimmed · <span style={{ color: DOT_BG.exit }}>✕</span> exited; the <b>$ above each dot is the avg cost that quarter</b> (hover for full detail). Return is the latest price vs the share-weighted cost of shares still held, annualized and benchmarked vs the S&amp;P 500 over the same window (S&amp;P {SPX_ASOF}).
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
        {shown.map((l) => <LaneCard key={l.tk + l.firstQ} l={l} slug={slug} />)}
      </div>

      {ranked.length > LIMIT && (
        <div className="text-center">
          <button onClick={() => setShowAll((v) => !v)} className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">
            {showAll ? `Show top ${LIMIT}` : `Show all ${ranked.length} positions`}
          </button>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Adds/trims under {EVENT_THRESHOLD}% of the position are folded into the line. Prices are quarter-end 13F snapshots (value ÷ shares), not actual fills. 13F = long US equity only, ~45-day delay. Not investment advice.
      </p>
    </div>
  )
}

function LaneCard({ l, slug }: { l: Lane; slug: string }) {
  const span = Math.max(l.nowQi - l.firstQi, 1)
  const x = (qi: number) => l.nowQi === l.firstQi ? 50 : ((qi - l.firstQi) / span) * 100
  const yArea = (w: number) => A_BOT - (w / l.peakWeight) * (A_BOT - A_TOP)
  const col = l.status === 'exited' ? '100,116,139' : '79,70,229'
  const gid = `hg-${l.tk}-${l.firstQi}`.replace(/[^a-zA-Z0-9_-]/g, '')

  let area = '', line = ''
  if (l.points.length >= 2) {
    area = `M ${x(l.points[0].qi)} ${A_BOT} `
    l.points.forEach((p, i) => { area += `L ${x(p.qi)} ${yArea(p.w)} `; line += `${i ? 'L' : 'M'} ${x(p.qi)} ${yArea(p.w)} ` })
    area += `L ${x(l.points[l.points.length - 1].qi)} ${A_BOT} Z`
  }

  // year ticks
  const ticks: { y: number; left: number }[] = []
  for (let yy = Math.ceil(l.firstQi / 4); yy <= qYear(l.nowQi); yy++) ticks.push({ y: yy, left: x(yy * 4) })

  const retCls = (l.ret ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
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
          {l.priorStints > 0 && (
            <p className="text-[10px] text-amber-600 mt-0.5">Re-opened {l.firstQ} · held &amp; exited {l.priorStints}× before</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`text-xl font-extrabold ${retCls}`}>{fmtPct(l.ret)}</div>
          <div className="text-[11px] text-gray-500">
            {l.status === 'held' ? 'vs avg cost' : 'on exit'} {fmtPrice(l.avgCost)} &rarr; {fmtPrice(l.endPrice)}
            {l.status === 'held' && !l.endIsLive && <span className="text-amber-600"> (as of {qLabel(l.nowQi)})</span>}
          </div>
          {l.annualized != null && (
            <div className="text-[11px] mt-0.5">
              <span className="font-semibold text-gray-700">{fmtPct(l.annualized)}/yr</span>
              {l.spxAnnual != null && <span className="text-gray-400"> · S&amp;P {fmtPct(l.spxAnnual)}/yr</span>}
            </div>
          )}
        </div>
      </div>

      {/* horizontal time graphic */}
      <div className="relative mt-3" style={{ height: LANE_H + 18 + 14 }}>
        {/* avg-cost labels band */}
        {l.events.map((e, i) => e.price != null && (
          <span key={`lab${i}`} className="absolute text-[9px] font-semibold text-gray-500 whitespace-nowrap -translate-x-1/2"
            style={{ left: `${Math.min(Math.max(x(e.qi), 4), 96)}%`, top: 0 }}>{fmtPrice(e.price)}</span>
        ))}
        {/* area */}
        <div className="absolute left-0 right-0" style={{ top: 18, height: LANE_H }}>
          {ticks.map((t) => <span key={`g${t.y}`} className="absolute top-0 bottom-0 w-px bg-gray-50" style={{ left: `${t.left}%` }} />)}
          <svg viewBox={`0 0 100 ${LANE_H}`} preserveAspectRatio="none" width="100%" height={LANE_H} style={{ display: 'block' }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={`rgba(${col},.45)`} /><stop offset="1" stopColor={`rgba(${col},.04)`} />
              </linearGradient>
            </defs>
            {area && <path d={area} fill={`url(#${gid})`} />}
            {line && <path d={line} fill="none" stroke={`rgba(${col},.9)`} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          </svg>
          <span className="absolute top-0 bottom-0 right-0 w-px bg-gray-200" />
          {/* event dots */}
          {l.events.map((e, i) => (
            <span key={`d${i}`}
              title={`${qLabel(e.qi)} · ${e.type}${e.chgPct != null ? ` ${fmtPct(e.chgPct)} shares` : ''}${e.weight ? ` → ${e.weight.toFixed(1)}% of portfolio` : ''}${e.price != null ? ` @ ${fmtPrice(e.price)}` : ''}`}
              style={{ position: 'absolute', left: `${x(e.qi)}%`, top: `${e.type === 'exit' ? A_BOT : yArea(e.weight)}px`, transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: DOT_BG[e.type], color: '#fff', fontSize: 7, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 1.5px #fff', zIndex: 2, cursor: 'help' }}>{GLYPH[e.type]}</span>
          ))}
          {/* now marker */}
          {l.status === 'held' && (
            <span title={`Now · ${l.currentWeight.toFixed(1)}% of portfolio · ${fmtPrice(l.endPrice)}`}
              style={{ position: 'absolute', left: '100%', top: `${yArea(l.currentWeight)}px`, transform: 'translate(-50%,-50%)', width: 10, height: 10, borderRadius: '50%', background: '#4f46e5', boxShadow: '0 0 0 1.5px #fff', zIndex: 2 }} />
          )}
        </div>
        {/* year axis */}
        {ticks.map((t) => (
          <span key={`y${t.y}`} className="absolute text-[9px] text-gray-400 -translate-x-1/2" style={{ left: `${t.left}%`, bottom: 0 }}>{t.y}</span>
        ))}
        <span className="absolute text-[9px] text-gray-400 -translate-x-full" style={{ left: '100%', bottom: 0 }}>now</span>
      </div>

      {/* compact now line */}
      {l.status === 'held' && (
        <p className="text-[11px] text-gray-500 mt-1">Now: {fmtShares(l.currentShares)} sh · {l.currentWeight.toFixed(1)}% of portfolio · {fmtValue(l.currentValue)}</p>
      )}
    </div>
  )
}
