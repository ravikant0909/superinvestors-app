'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchApiJson, fetchPriceMap } from '@/lib/api'
import {
  buildRuntimeTrackRecords,
  type RuntimeInvestmentRecord,
  type TrackRecordApiGroup,
} from '@/lib/track-record'

interface InvestorLite {
  name: string
  slug: string
  latest_report_date: string | null
}

type RankMode = 'entry' | 'curr' | 'ret' | 'recent'

// quarter index = year*4 + (quarter-1)
function qIndex(q: string): number {
  const [y, qq] = q.split('-Q')
  return parseInt(y, 10) * 4 + (parseInt(qq, 10) - 1)
}
function qYear(qi: number): number { return Math.floor(qi / 4) }
function qLabel(qi: number): string { return `Q${(qi % 4) + 1} ${qYear(qi)}` }

interface Ev { qi: number; type: 'new' | 'add' | 'trim' | 'exit'; label: string }
interface Pt { qi: number; w: number }
interface Lane {
  tk: string
  name: string
  entryPrice: number | null
  entryQ: string
  entryWeight: number
  ret: number | null
  status: 'held' | 'exited'
  now: number | null
  currentWeight: number
  firstQi: number
  pts: Pt[]
  events: Ev[]
}

const GLYPH = { new: '●', add: '▲', trim: '▼', exit: '✕' } as const
const DOT_BG = { new: '#16a34a', add: '#2563eb', trim: '#ea580c', exit: '#dc2626' } as const
const LABEL_THRESHOLD = 4 // only label adds/trims >= 4% of the position, to avoid clutter

function toLane(r: RuntimeInvestmentRecord): Lane {
  const tl = r.timeline
  const pts: Pt[] = tl.map((t) => ({ qi: qIndex(t.quarter), w: t.weight_pct }))
  const events: Ev[] = []
  tl.forEach((t) => {
    const qi = qIndex(t.quarter)
    if (t.action === 'NEW') {
      events.push({ qi, type: 'new', label: `${t.weight_pct.toFixed(0)}%` })
    } else if (t.action === 'INCREASED' || t.action === 'DECREASED') {
      const prev = t.shares - t.share_delta
      const pct = prev > 0 ? (t.share_delta / prev) * 100 : null
      if (pct != null && Math.abs(pct) >= LABEL_THRESHOLD) {
        events.push({ qi, type: t.action === 'INCREASED' ? 'add' : 'trim', label: `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%` })
      }
    }
  })
  if (!r.is_current && tl.length) {
    const lastQi = qIndex(r.last_seen_quarter)
    events.push({ qi: lastQi + 1, type: 'exit', label: 'sold' })
    pts.push({ qi: lastQi + 1, w: 0 })
  }
  return {
    tk: r.ticker,
    name: r.company_name,
    entryPrice: r.estimated_entry_price,
    entryQ: r.first_seen_quarter,
    entryWeight: tl[0]?.weight_pct ?? 0,
    ret: r.price_return_pct,
    status: r.is_current ? 'held' : 'exited',
    now: r.current_price,
    currentWeight: r.current_weight_pct ?? 0,
    firstQi: qIndex(r.first_seen_quarter),
    pts,
    events,
  }
}

function fmtPrice(p: number | null): string {
  if (p == null) return '--'
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  return `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function tidyTicker(tk: string, name: string): string {
  if (!tk || /^\d{4,}/.test(tk)) return name.split(' ').slice(0, 2).join(' ')
  return tk
}

const H = 48, TOP = 6, BOT = 42

export default function TrackRecordClient({ slug }: { slug: string }) {
  const [investor, setInvestor] = useState<InvestorLite | null>(null)
  const [lanes, setLanes] = useState<Lane[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [rankMode, setRankMode] = useState<RankMode>('entry')
  const [windowYears, setWindowYears] = useState(0)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const inv = await fetchApiJson<InvestorLite>(`/api/investor/${slug}`)
        const groups = await fetchApiJson<TrackRecordApiGroup[]>(`/api/investor/${slug}/track-record`)
        const symbols = Array.from(new Set(
          groups.map((g) => g.ticker).filter((t): t is string => Boolean(t) && !/^\d{5,}/.test(t!)),
        ))
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

  const axis = useMemo(() => {
    if (lanes.length === 0) return null
    const allQi = lanes.flatMap((l) => l.pts.map((p) => p.qi))
    const globalMin = Math.min(...allQi)
    const now = Math.max(...allQi)
    const min = windowYears ? Math.max(globalMin, now - windowYears * 4) : globalMin
    const maxW = Math.max(10, ...lanes.flatMap((l) => l.pts.map((p) => p.w)))
    return { min, now, maxW }
  }, [lanes, windowYears])

  const ranked = useMemo(() => {
    const list = [...lanes]
    if (rankMode === 'entry') list.sort((a, b) => b.entryWeight - a.entryWeight)
    if (rankMode === 'curr') list.sort((a, b) => (b.status === 'held' ? b.currentWeight : -1) - (a.status === 'held' ? a.currentWeight : -1))
    if (rankMode === 'ret') list.sort((a, b) => (b.ret ?? -999) - (a.ret ?? -999))
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
  const shown = showAll ? ranked : ranked.slice(0, LIMIT)

  const yearTicks: { y: number; left: number }[] = []
  if (axis) {
    for (let y = Math.ceil(axis.min / 4); y <= qYear(axis.now); y++) {
      yearTicks.push({ y, left: ((y * 4 - axis.min) / (axis.now - axis.min || 1)) * 100 })
    }
  }
  const xPct = (qi: number) => axis ? ((qi - axis.min) / (axis.now - axis.min || 1)) * 100 : 0
  const yU = (w: number) => axis ? BOT - (w / axis.maxW) * (BOT - TOP) : BOT

  function spark(l: Lane) {
    const pts = l.pts.filter((p) => axis && p.qi >= axis.min)
    const pre = l.pts.some((p) => axis && p.qi < axis.min)
    const col = l.status === 'exited' ? '100,116,139' : '79,70,229'
    if (pts.length === 0) return { area: '', line: '', col, pre, single: false, sx: 0, sy: 0 }
    if (pts.length === 1) return { area: '', line: '', col, pre, single: true, sx: xPct(pts[0].qi), sy: yU(pts[0].w) }
    let area = `M ${xPct(pts[0].qi)} ${BOT} `
    let line = ''
    pts.forEach((p, i) => { area += `L ${xPct(p.qi)} ${yU(p.w)} `; line += `${i ? 'L' : 'M'} ${xPct(p.qi)} ${yU(p.w)} ` })
    area += `L ${xPct(pts[pts.length - 1].qi)} ${BOT} Z`
    return { area, line, col, pre, single: false, sx: 0, sy: 0 }
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
        <p className="mt-1 text-sm text-gray-500">The arc of every position over time. Height = % of portfolio; markers flag the moves.</p>
      </div>

      <div className="flex gap-2">
        <Link href={`/investors/${slug}`} className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-white text-gray-600 border border-gray-200 hover:bg-gray-50">Overview</Link>
        <span className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-gray-900 text-white border border-gray-900">History</span>
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-[13px] text-indigo-900">
        <b>How the estimated entry price is calculated:</b> the position&apos;s reported 13F value &divide; shares in the quarter it was first bought
        (for adds, &Delta;value &divide; &Delta;shares that quarter). It&apos;s an estimate &mdash; 13F is a quarter-end snapshot with no actual trade prices &mdash; and is used consistently across the site.
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-gray-500">Rank:</span>
            {([['entry', '% at purchase'], ['curr', 'Current weight'], ['ret', 'Return'], ['recent', 'Most recent']] as [RankMode, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setRankMode(k)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${rankMode === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-gray-500">Window:</span>
            {([[5, '5y'], [10, '10y'], [0, 'All']] as [number, string][]).map(([y, label]) => (
              <button key={label} onClick={() => setWindowYears(y)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${windowYears === y ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{label}</button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 mb-2">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-6 h-3 rounded-sm" style={{ background: 'linear-gradient(180deg,rgba(79,70,229,.8),rgba(79,70,229,.12))' }} /> height = % of portfolio</span>
          <LegendItem t="new" label="opened" />
          <LegendItem t="add" label="added" />
          <LegendItem t="trim" label="trimmed" />
          <LegendItem t="exit" label="exited" />
        </div>

        <p className="text-xs text-gray-400 mb-1">
          Showing {shown.length} of {ranked.length} positions{windowYears ? ` · last ${windowYears}y` : ' · full history'}
        </p>

        <div className="relative h-4 ml-[150px] mr-[112px] hidden sm:block">
          {yearTicks.map((t) => (
            <span key={t.y} className="absolute top-0 text-[10px] text-gray-400 -translate-x-1/2" style={{ left: `${t.left}%` }}>{t.y}</span>
          ))}
          <span className="absolute top-0 text-[10px] text-gray-400 -translate-x-full" style={{ left: '100%' }}>now</span>
        </div>

        <div>
          {shown.map((l) => {
            const sp = spark(l)
            const retCls = (l.ret ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'
            const gid = `g-${l.tk}-${l.firstQi}`.replace(/[^a-zA-Z0-9_-]/g, '')
            return (
              <div key={l.tk + l.entryQ} className="flex items-center border-t border-gray-100 first:border-t-0 py-1.5">
                <div className="w-[110px] sm:w-[150px] flex-shrink-0 pr-2">
                  {/^[A-Za-z][A-Za-z.\-]{0,5}$/.test(l.tk) ? (
                    <Link href={`/stocks/${encodeURIComponent(l.tk)}`} className="font-mono font-extrabold text-[14px] text-indigo-600 hover:text-indigo-800">{tidyTicker(l.tk, l.name)}</Link>
                  ) : (
                    <span className="font-mono font-extrabold text-[14px] text-gray-800">{tidyTicker(l.tk, l.name)}</span>
                  )}
                  <div className="text-[10px] text-gray-400 truncate hidden sm:block">{l.name}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5" title={`Estimated entry = 13F value ÷ shares in ${l.entryQ}. An estimate from a quarter-end snapshot, not an actual fill.`}>
                    <span className="border-b border-dotted border-indigo-300 text-indigo-700">{fmtPrice(l.entryPrice)} &middot; {l.entryQ}</span>
                  </div>
                </div>
                <div className="relative flex-1 min-w-0" style={{ height: H }}>
                  {yearTicks.map((t) => (
                    <span key={t.y} className="absolute top-0 bottom-0 w-px bg-gray-50" style={{ left: `${t.left}%` }} />
                  ))}
                  <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: 'block' }}>
                    <defs>
                      <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor={`rgba(${sp.col},.5)`} />
                        <stop offset="1" stopColor={`rgba(${sp.col},.05)`} />
                      </linearGradient>
                    </defs>
                    {sp.single && <line x1={sp.sx} y1={BOT} x2={sp.sx} y2={sp.sy} stroke={`rgba(${sp.col},.6)`} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
                    {sp.area && <path d={sp.area} fill={`url(#${gid})`} />}
                    {sp.line && <path d={sp.line} fill="none" stroke={`rgba(${sp.col},.95)`} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
                  </svg>
                  <span className="absolute top-0 bottom-0 right-0 w-px bg-gray-200" />
                  {sp.pre && <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-400" title={`Opened ${l.entryQ}, before this window`}>&#9664;</span>}
                  {l.events.filter((e) => axis && e.qi >= axis.min).map((e, i) => {
                    const left = xPct(e.qi)
                    const top = e.type === 'exit' ? BOT : yU(l.pts.find((p) => p.qi === e.qi)?.w ?? 0)
                    const below = e.type === 'trim' || e.type === 'exit'
                    return (
                      <span key={i}>
                        <span title={`${qLabel(e.qi)} · ${e.type} ${e.label}`} style={{
                          position: 'absolute', left: `${left}%`, top: `${top}px`, transform: 'translate(-50%,-50%)',
                          width: 13, height: 13, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: 8, fontWeight: 800, boxShadow: '0 0 0 1.5px #fff', background: DOT_BG[e.type], zIndex: 2,
                        }}>{GLYPH[e.type]}</span>
                        <span style={{
                          position: 'absolute', left: `${Math.min(Math.max(left, 5), 95)}%`,
                          top: below ? `${top + 7}px` : `${top - 15}px`, transform: 'translateX(-50%)',
                          fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap',
                          color: e.type === 'add' ? '#2563eb' : e.type === 'trim' ? '#ea580c' : '#64748b',
                        }}>{e.label}</span>
                      </span>
                    )
                  })}
                </div>
                <div className="w-[100px] sm:w-[112px] flex-shrink-0 text-right pl-2">
                  <div className={`font-extrabold text-[14px] ${retCls}`}>{l.ret != null ? `${l.ret >= 0 ? '+' : ''}${l.ret.toFixed(0)}%` : '--'}</div>
                  <div className="text-[10px] text-gray-400">{l.status === 'exited' ? 'on exit (est.)' : `now ${fmtPrice(l.now)}`}</div>
                  <span className={`inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${l.status === 'held' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {l.status === 'held' ? `held · ${l.currentWeight.toFixed(0)}%` : 'exited'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {ranked.length > LIMIT && (
          <div className="text-center pt-3">
            <button onClick={() => setShowAll((v) => !v)} className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">
              {showAll ? `Show top ${LIMIT}` : `Show all ${ranked.length} positions`}
            </button>
          </div>
        )}

        <p className="text-[11px] text-gray-400 mt-4 pt-3 border-t border-gray-100">
          Time runs left &rarr; right (shared axis); area height = % of portfolio (shared scale). Adds/trims under 4% of the position are folded into the line, not labelled. Returns use the entry-price method above vs. the latest price. 13F = long US equity only, ~45-day delay. Not investment advice.
        </p>
      </div>
    </div>
  )
}

function LegendItem({ t, label }: { t: 'new' | 'add' | 'trim' | 'exit'; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center justify-center rounded-full text-white" style={{ width: 14, height: 14, background: DOT_BG[t], fontSize: 7, fontWeight: 800 }}>{GLYPH[t]}</span>
      {label}
    </span>
  )
}
