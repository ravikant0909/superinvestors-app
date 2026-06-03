import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  type HistoryView,
  type HistoryPosition,
  ACTION_META,
  fmtPrice,
  fmtValue,
  fmtShares,
  fmtPct,
  tidyTicker,
} from '@/lib/history-view'

// ---------------------------------------------------------------------------
// Sort columns. `get` returns a comparable number; nulls sink to the bottom.
// ---------------------------------------------------------------------------
type SortId =
  | 'pos' | 'status' | 'spark' | 'entry' | 'cost' | 'now'
  | 'ret' | 'ann' | 'vs' | 'peak' | 'cur' | 'hold'

interface ColDef {
  id: SortId
  label: string
  align: 'left' | 'center' | 'right'
  get: (p: HistoryPosition) => number | string
}

const NEG_INF = -1e12

const COLS: ColDef[] = [
  { id: 'pos', label: 'Position', align: 'left', get: (p) => p.ticker.toUpperCase() },
  { id: 'status', label: 'Status', align: 'center', get: (p) => (p.status === 'held' ? 1 : 0) },
  { id: 'spark', label: 'Weight path', align: 'center', get: (p) => p.peak_weight || 0 },
  { id: 'entry', label: 'Entry', align: 'right', get: (p) => p.entry_price ?? NEG_INF },
  { id: 'cost', label: 'Avg cost', align: 'right', get: (p) => p.avg_cost ?? NEG_INF },
  { id: 'now', label: 'Now / Exit', align: 'right', get: (p) => p.end_price ?? NEG_INF },
  { id: 'ret', label: 'Return', align: 'right', get: (p) => p.return_pct ?? NEG_INF },
  { id: 'ann', label: 'Ann. /yr', align: 'right', get: (p) => p.annualized_pct ?? NEG_INF },
  { id: 'vs', label: 'vs S&P /yr', align: 'right', get: (p) =>
      p.annualized_pct == null ? NEG_INF : p.annualized_pct - (p.spx_annual_pct ?? 0) },
  { id: 'peak', label: 'Peak wt', align: 'right', get: (p) => p.peak_weight || 0 },
  { id: 'cur', label: 'Cur wt', align: 'right', get: (p) => p.current_weight || 0 },
  { id: 'hold', label: 'Held', align: 'right', get: (p) => p.holding_years || 0 },
]

type FilterId = 'all' | 'held' | 'exited' | 'winners' | 'beat'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'held', label: 'Held' },
  { id: 'exited', label: 'Exited' },
  { id: 'winners', label: 'Winners' },
  { id: 'beat', label: 'Beat S&P' },
]

// ---------------------------------------------------------------------------
// Green->red diverging shade for the Return cell. Soft-clamped so a +448%
// outlier doesn't wash everything else out. Returns inline rgba bg + a text
// color that flips to white once the fill gets dark enough to read on.
// ---------------------------------------------------------------------------
function retShade(r: number | null): { bg: string; fg: string } {
  if (r == null) return { bg: 'transparent', fg: '#9ca3af' }
  const cap = 100
  const t = Math.max(-1, Math.min(1, r / cap))
  if (r >= 0) {
    const a = Math.min(1, 0.1 + 0.55 * t + 0.2 * Math.min(1, r / 300))
    return { bg: `rgba(22,163,74,${a.toFixed(3)})`, fg: a > 0.42 ? '#ffffff' : '#15803d' }
  }
  const a = Math.min(1, 0.1 + 0.55 * -t)
  return { bg: `rgba(220,38,38,${a.toFixed(3)})`, fg: a > 0.42 ? '#ffffff' : '#dc2626' }
}

// ---------------------------------------------------------------------------
// Inline weight-over-time sparkline. Area + line + last-point dot.
// ---------------------------------------------------------------------------
function Sparkline({
  points,
  status,
  w,
  h,
  big = false,
}: {
  points: HistoryPosition['points']
  status: HistoryPosition['status']
  w: number
  h: number
  big?: boolean
}) {
  if (!points.length) {
    return <span className="text-[10px] text-gray-300">—</span>
  }
  const pad = big ? 3 : 1.5
  const xs = points.map((p) => p.qi)
  const ws = points.map((p) => p.weight || 0)
  const minx = Math.min(...xs)
  const maxx = Math.max(...xs)
  const maxw = Math.max(0.0001, ...ws)
  const spanx = maxx - minx || 1
  const X = (qi: number) => pad + ((qi - minx) / spanx) * (w - 2 * pad)
  const Y = (wt: number) => h - pad - (wt / maxw) * (h - 2 * pad)

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.qi).toFixed(2)} ${Y(p.weight || 0).toFixed(2)}`)
    .join(' ')
  const yb = (h - pad).toFixed(2)
  const area =
    `M${X(minx).toFixed(2)} ${yb} ` +
    points.map((p) => `L${X(p.qi).toFixed(2)} ${Y(p.weight || 0).toFixed(2)}`).join(' ') +
    ` L${X(maxx).toFixed(2)} ${yb} Z`

  const stroke = status === 'held' ? '#4f46e5' : '#94a3b8'
  const fill = status === 'held' ? 'rgba(79,70,229,0.12)' : 'rgba(148,163,184,0.14)'
  const last = points[points.length - 1]

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block" aria-hidden="true">
      <path d={area} fill={fill} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={big ? 2 : 1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={X(last.qi).toFixed(2)}
        cy={Y(last.weight || 0).toFixed(2)}
        r={big ? 2.6 : 1.8}
        fill={stroke}
      />
    </svg>
  )
}

function fmtYears(y: number): string {
  if (y < 1) {
    const q = Math.round(y * 4)
    return `${q}q`
  }
  return `${y % 1 === 0 ? y.toFixed(0) : y.toFixed(1)}y`
}

// ---------------------------------------------------------------------------
// Expanded detail strip: big sparkline + fact grid + full event list.
// ---------------------------------------------------------------------------
function DetailStrip({ p }: { p: HistoryPosition }) {
  const facts: { l: string; v: string | number }[] = [
    { l: 'First seen', v: p.first_quarter },
    { l: 'Last seen', v: p.last_quarter },
    { l: 'Quarters held', v: p.holding_quarters },
    { l: 'Observations', v: p.n_quarters_observed },
    { l: 'Peak value', v: fmtValue(p.peak_value_thousands) },
    {
      l: p.status === 'held' ? 'Current value' : 'At exit',
      v: p.status === 'held' ? fmtValue(p.current_value_thousands) : fmtValue(p.peak_value_thousands),
    },
    { l: 'S&P /yr (same window)', v: fmtPct(p.spx_annual_pct) },
    { l: 'Prior stints', v: p.prior_stints },
  ]
  // newest event first
  const events = [...p.events].reverse()

  return (
    <div className="grid grid-cols-1 gap-4 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
            Portfolio weight over time
          </h4>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {p.first_quarter} → {p.last_quarter} · peak {fmtPct(p.peak_weight, false)}
          </p>
          <div className="mt-2 w-full overflow-x-auto">
            <Sparkline points={p.points} status={p.status} w={360} h={90} big />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
          {facts.map((f) => (
            <div key={f.l} className="rounded-md bg-gray-50 px-2.5 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-gray-400">{f.l}</div>
              <div className="text-[12px] font-semibold tabular-nums text-gray-800">{f.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
          Event history ({p.events.length})
        </h4>
        <div className="mt-2 space-y-1">
          {events.map((e, i) => {
            const meta = ACTION_META[e.type]
            const chgColor =
              e.chg_pct == null
                ? 'text-gray-400'
                : e.type === 'trim' || e.chg_pct < 0
                  ? 'text-red-600'
                  : 'text-green-700'
            return (
              <div
                key={`${e.qi}-${e.type}-${i}`}
                className="flex items-center gap-2 rounded-md border border-gray-100 bg-white px-2.5 py-1.5 text-[12px]"
              >
                <span className="w-14 shrink-0 font-mono text-[11px] text-gray-500">{e.label}</span>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${meta.bg} ${meta.text}`}
                >
                  <span aria-hidden="true">{meta.glyph}</span>
                  {meta.verb}
                </span>
                <span className="flex-1 truncate tabular-nums text-gray-600">
                  @ {fmtPrice(e.price)} · wt {fmtPct(e.weight, false)} · {fmtValue(e.value_thousands)}
                </span>
                <span className={`shrink-0 tabular-nums font-semibold ${chgColor}`}>
                  {e.chg_pct == null ? '' : fmtPct(e.chg_pct)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function LedgerView({ view, slug }: { view: HistoryView; slug: string }) {
  void slug // ticker links go to /stocks/<ticker>; slug is part of the contract
  const { positions, summary } = view

  const [sort, setSort] = useState<SortId>('cur')
  const [dir, setDir] = useState<1 | -1>(-1)
  const [filter, setFilter] = useState<FilterId>('all')
  const [hideTransient, setHideTransient] = useState(true)
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

  const transientCount = summary.counts.transient
  const biggestWeight = summary.aggregate.biggest_current?.weight ?? 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = positions.filter((p) => {
      if (hideTransient && p.transient) return false
      if (filter === 'held' && p.status !== 'held') return false
      if (filter === 'exited' && p.status !== 'exited') return false
      if (filter === 'winners' && !(p.return_pct != null && p.return_pct > 0)) return false
      if (filter === 'beat' && !p.beat_spx) return false
      if (q && !(p.ticker.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))) return false
      return true
    })
    const col = COLS.find((c) => c.id === sort) ?? COLS[0]
    rows = [...rows].sort((a, b) => {
      const av = col.get(a)
      const bv = col.get(b)
      let cmp: number
      if (typeof av === 'string' || typeof bv === 'string') {
        cmp = String(av).localeCompare(String(bv))
      } else {
        cmp = av - bv
      }
      return cmp * dir
    })
    return rows
  }, [positions, hideTransient, filter, query, sort, dir])

  function onSort(id: SortId) {
    if (sort === id) {
      setDir((d) => (d === 1 ? -1 : 1))
    } else {
      setSort(id)
      // text column defaults to ascending; numeric to descending
      setDir(id === 'pos' ? 1 : -1)
    }
  }

  const total = positions.length
  const alignClass = (a: ColDef['align']) =>
    a === 'left' ? 'text-left' : a === 'center' ? 'text-center' : 'text-right'

  return (
    <div className="space-y-3">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                filter === f.id
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setHideTransient((v) => !v)}
          aria-pressed={hideTransient}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
            hideTransient
              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <span
            className={`inline-block h-3 w-3 rounded-sm border ${
              hideTransient ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300 bg-white'
            }`}
          />
          Hide transient
        </button>

        <label className="relative ml-auto inline-flex items-center">
          <span className="pointer-events-none absolute left-2.5 text-gray-400" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter ticker / company…"
            autoComplete="off"
            className="w-44 rounded-lg border border-gray-200 bg-white py-1 pl-8 pr-2.5 text-xs text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200 sm:w-56"
          />
        </label>
      </div>

      {/* count line */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span>
          Showing <span className="font-semibold text-gray-700">{filtered.length}</span> of {total}{' '}
          positions
        </span>
        <span className="text-gray-300">·</span>
        <span>
          {summary.counts.held} held · {summary.counts.exited} exited
        </span>
        {transientCount > 0 && (
          <>
            <span className="text-gray-300">·</span>
            <button
              type="button"
              onClick={() => setHideTransient((v) => !v)}
              className="font-medium text-indigo-600 hover:text-indigo-800"
            >
              {hideTransient
                ? `${transientCount} transient hidden — show`
                : `hide ${transientCount} transient`}
            </button>
          </>
        )}
      </div>

      {/* table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-[920px] w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50/95 backdrop-blur">
              {COLS.map((c) => {
                const active = sort === c.id
                const arrow = active ? (dir === 1 ? '▲' : '▼') : ''
                return (
                  <th
                    key={c.id}
                    onClick={() => onSort(c.id)}
                    title={`Sort by ${c.label}`}
                    className={`cursor-pointer select-none border-b border-gray-200 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${alignClass(
                      c.align,
                    )} ${active ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    {c.label}
                    <span className={`ml-1 text-[9px] ${active ? 'opacity-100' : 'opacity-0'}`}>
                      {arrow || '▼'}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLS.length} className="px-4 py-10 text-center text-sm text-gray-400">
                  No positions match these filters.
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const key = `${p.ticker}-${p.first_qi}`
              const open = openKey === key
              const nowPrice = p.current_price != null ? p.current_price : p.end_price
              const rc = retShade(p.return_pct)
              const vsDelta =
                p.annualized_pct == null ? null : p.annualized_pct - (p.spx_annual_pct ?? 0)
              const curBarPct =
                biggestWeight > 0 ? Math.min(100, (p.current_weight / biggestWeight) * 100) : 0
              const heldAsOf = p.status === 'held' && !p.end_is_live

              return (
                <FragmentRow key={key}>
                  <tr
                    onClick={() => setOpenKey(open ? null : key)}
                    className={`cursor-pointer border-b border-gray-100 transition hover:bg-indigo-50/40 ${
                      open ? 'bg-indigo-50/60' : ''
                    }`}
                  >
                    {/* Position */}
                    <td className="px-2.5 py-1.5 text-left">
                      <div className="flex items-center gap-1.5">
                        {p.linkable ? (
                          <Link
                            href={`/stocks/${encodeURIComponent(p.ticker)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-[13px] font-bold text-indigo-600 hover:text-indigo-800"
                          >
                            {tidyTicker(p.ticker, p.name)}
                          </Link>
                        ) : (
                          <span className="font-mono text-[13px] font-bold text-gray-800">
                            {tidyTicker(p.ticker, p.name)}
                          </span>
                        )}
                        {p.prior_stints > 0 && (
                          <span
                            title={`${p.prior_stints} prior stint(s) before this one`}
                            className="rounded bg-amber-50 px-1 py-px text-[9px] font-bold text-amber-700"
                          >
                            ×{p.prior_stints + 1}
                          </span>
                        )}
                      </div>
                      <div className="max-w-[180px] truncate text-[10px] text-gray-400" title={p.name}>
                        {p.name}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-2.5 py-1.5 text-center">
                      {p.status === 'held' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          Held {fmtPct(p.current_weight, false)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                          Exited
                        </span>
                      )}
                    </td>

                    {/* Sparkline */}
                    <td className="px-2.5 py-1.5">
                      <div className="flex justify-center">
                        <Sparkline points={p.points} status={p.status} w={84} h={22} />
                      </div>
                    </td>

                    {/* Entry */}
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-gray-700">
                      {fmtPrice(p.entry_price)}
                    </td>

                    {/* Avg cost */}
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-gray-700">
                      {fmtPrice(p.avg_cost)}
                    </td>

                    {/* Now / Exit */}
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-gray-700">
                      <span>{fmtPrice(nowPrice)}</span>
                      {p.status === 'held' && p.end_is_live && (
                        <span className="ml-1 rounded bg-green-100 px-1 py-px text-[8px] font-bold text-green-700">
                          LIVE
                        </span>
                      )}
                      {heldAsOf && (
                        <div className="text-[9px] text-amber-600">as of {p.now_label}</div>
                      )}
                    </td>

                    {/* Return (shaded) */}
                    <td className="px-2.5 py-1.5 text-right">
                      <span
                        className="inline-block rounded px-1.5 py-0.5 text-[12px] font-bold tabular-nums"
                        style={{ backgroundColor: rc.bg, color: rc.fg }}
                      >
                        {fmtPct(p.return_pct)}
                      </span>
                    </td>

                    {/* Annualized /yr */}
                    <td
                      className={`px-2.5 py-1.5 text-right tabular-nums font-semibold ${
                        p.annualized_pct == null
                          ? 'text-gray-400'
                          : p.annualized_pct >= 0
                            ? 'text-green-700'
                            : 'text-red-600'
                      }`}
                    >
                      {fmtPct(p.annualized_pct)}
                    </td>

                    {/* vs S&P /yr */}
                    <td
                      className={`px-2.5 py-1.5 text-right tabular-nums font-semibold ${
                        vsDelta == null
                          ? 'text-gray-400'
                          : p.beat_spx
                            ? 'text-green-700'
                            : 'text-red-500'
                      }`}
                      title={
                        p.spx_annual_pct == null
                          ? undefined
                          : `S&P ${fmtPct(p.spx_annual_pct)}/yr over same window`
                      }
                    >
                      {vsDelta == null
                        ? '—'
                        : `${vsDelta >= 0 ? '+' : ''}${vsDelta.toFixed(0)} pp`}
                    </td>

                    {/* Peak wt */}
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-gray-500">
                      {fmtPct(p.peak_weight, false)}
                    </td>

                    {/* Cur wt (with mini bar) */}
                    <td className="px-2.5 py-1.5 text-right">
                      {p.current_weight > 0 ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="hidden h-1.5 w-10 overflow-hidden rounded-full bg-gray-100 sm:inline-block">
                            <span
                              className="block h-full rounded-full bg-indigo-500"
                              style={{ width: `${curBarPct.toFixed(1)}%` }}
                            />
                          </span>
                          <span className="tabular-nums text-gray-700">
                            {fmtPct(p.current_weight, false)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Held (period) */}
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-gray-600">
                      {fmtYears(p.holding_years)}
                    </td>
                  </tr>

                  {open && (
                    <tr className="border-b border-gray-200 bg-gray-50/50">
                      <td colSpan={COLS.length} className="p-0">
                        <DetailStrip p={p} />
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* methodology footnote */}
      <p className="text-[11px] leading-relaxed text-gray-400">
        Prices are 13F-estimated quarter-mean marks (value ÷ shares at the midpoint of adjacent
        quarter-end filings); exits are locked at the sell-quarter price. Return is the latest/exit
        price vs the share-weighted average cost of shares still held, annualized and benchmarked vs
        the S&amp;P 500 over the same window (S&amp;P {summary.spx_asof}). 13F = long US equity only,
        ~45-day delay. Not investment advice.
      </p>
    </div>
  )
}

// Wrapper so a row + its (conditional) detail row share one keyed parent
// without injecting an invalid extra element into <tbody>.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
