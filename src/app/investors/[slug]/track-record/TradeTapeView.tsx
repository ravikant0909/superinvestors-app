import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  type HistoryView,
  type HistoryPosition,
  type HistoryEvent,
  type ActionType,
  ACTION_META,
  fmtPrice,
  fmtShares,
  fmtPct,
  tidyTicker,
} from '@/lib/history-view'

// One flattened trade = a position event carrying its parent-position context.
interface Trade {
  qi: number
  year: number
  q: number
  label: string // "Q2 2023"
  quarter: string // "2023-Q2"
  type: ActionType
  price: number | null
  chg_pct: number | null
  shares_delta: number
  weight: number
  value_thousands: number
  // parent-position context
  ticker: string
  name: string
  linkable: boolean
  transient: boolean
  status: 'held' | 'exited'
  // realized-outcome fields (meaningful only on exit rows)
  ret: number | null
  ann: number | null
  spx: number | null
  beat: boolean
  holdY: number
}

interface QuarterBucket {
  qi: number
  year: number
  q: number
  label: string
  trades: Trade[]
}

const TYPE_ORDER: Record<ActionType, number> = { open: 0, add: 1, trim: 2, exit: 3 }
const FILTERS: { key: ActionType; label: string }[] = [
  { key: 'open', label: 'Opens' },
  { key: 'add', label: 'Adds' },
  { key: 'trim', label: 'Trims' },
  { key: 'exit', label: 'Exits' },
]
const COLLAPSE_AT = 9 // rows shown before a "+N more this quarter" cut

// magnitude used to rank events within a quarter (dollar move, fall back to share count)
function mag(t: Trade): number {
  const v = Math.abs(t.value_thousands)
  if (v > 0) return v
  return Math.abs(t.shares_delta)
}

function flatten(positions: HistoryPosition[]): Trade[] {
  const out: Trade[] = []
  for (const p of positions) {
    for (const e of p.events) {
      out.push({
        qi: e.qi,
        year: e.year,
        q: e.q,
        label: e.label,
        quarter: e.quarter,
        type: e.type,
        price: e.price,
        chg_pct: e.chg_pct,
        shares_delta: e.shares_delta,
        weight: e.weight,
        value_thousands: e.value_thousands,
        ticker: p.ticker,
        name: p.name,
        linkable: p.linkable,
        transient: p.transient,
        status: p.status,
        ret: p.return_pct,
        ann: p.annualized_pct,
        spx: p.spx_annual_pct,
        beat: p.beat_spx,
        holdY: p.holding_years,
      })
    }
  }
  return out
}

// star standout: biggest open, else biggest add, else biggest exit by |return|, else deepest trim
function standout(trades: Trade[]): React.ReactNode | null {
  const opens = trades.filter((t) => t.type === 'open').sort((a, b) => (b.weight || 0) - (a.weight || 0))
  if (opens.length)
    return (
      <>
        opened <b className="text-gray-900">{tidyTicker(opens[0].ticker, opens[0].name)}</b> {opens[0].weight.toFixed(1)}%
      </>
    )
  const adds = trades.filter((t) => t.type === 'add' && t.chg_pct != null).sort((a, b) => (b.chg_pct || 0) - (a.chg_pct || 0))
  if (adds.length && adds[0].chg_pct != null)
    return (
      <>
        piled into <b className="text-gray-900">{tidyTicker(adds[0].ticker, adds[0].name)}</b> +{Math.round(adds[0].chg_pct)}%
      </>
    )
  const exits = trades.filter((t) => t.type === 'exit' && t.ret != null).sort((a, b) => Math.abs(b.ret!) - Math.abs(a.ret!))
  if (exits.length)
    return (
      <>
        exited <b className="text-gray-900">{tidyTicker(exits[0].ticker, exits[0].name)}</b> {fmtPct(exits[0].ret)}
      </>
    )
  const trims = trades.filter((t) => t.type === 'trim' && t.chg_pct != null).sort((a, b) => (a.chg_pct || 0) - (b.chg_pct || 0))
  if (trims.length && trims[0].chg_pct != null)
    return (
      <>
        cut <b className="text-gray-900">{tidyTicker(trims[0].ticker, trims[0].name)}</b> {Math.round(trims[0].chg_pct)}%
      </>
    )
  return null
}

export default function TradeTapeView({ view, slug: _slug }: { view: HistoryView; slug: string }) {
  const [active, setActive] = useState<Set<ActionType>>(new Set())
  const [hideTransient, setHideTransient] = useState(true)
  const [expandedQ, setExpandedQ] = useState<Set<number>>(new Set())
  const [collapsedQ, setCollapsedQ] = useState<Set<number>>(new Set())

  const all = useMemo(() => flatten(view.positions), [view.positions])

  // total counts per type (over the whole tape, ignoring filters) for the chips
  const totalByType = useMemo(() => {
    const c: Record<ActionType, number> = { open: 0, add: 0, trim: 0, exit: 0 }
    for (const t of all) c[t.type]++
    return c
  }, [all])

  const transientCount = useMemo(() => all.filter((t) => t.transient).length, [all])

  // apply filters, then group by quarter (newest first), ordering within a quarter
  const quarters = useMemo<QuarterBucket[]>(() => {
    const filtered = all.filter((t) => {
      if (active.size && !active.has(t.type)) return false
      if (hideTransient && t.transient) return false
      return true
    })
    const map = new Map<number, QuarterBucket>()
    for (const t of filtered) {
      let b = map.get(t.qi)
      if (!b) {
        b = { qi: t.qi, year: t.year, q: t.q, label: t.label, trades: [] }
        map.set(t.qi, b)
      }
      b.trades.push(t)
    }
    const buckets = Array.from(map.values()).sort((a, b) => b.qi - a.qi)
    for (const b of buckets) {
      b.trades.sort((x, y) => {
        if (TYPE_ORDER[x.type] !== TYPE_ORDER[y.type]) return TYPE_ORDER[x.type] - TYPE_ORDER[y.type]
        return mag(y) - mag(x)
      })
    }
    return buckets
  }, [all, active, hideTransient])

  const shownTrades = useMemo(() => quarters.reduce((n, b) => n + b.trades.length, 0), [quarters])

  function toggleFilter(k: ActionType) {
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }
  function toggleCollapse(qi: number) {
    setCollapsedQ((prev) => {
      const next = new Set(prev)
      if (next.has(qi)) next.delete(qi)
      else next.add(qi)
      return next
    })
  }
  function expandQuarter(qi: number) {
    setExpandedQ((prev) => new Set(prev).add(qi))
  }

  const filterLabel = active.size
    ? FILTERS.filter((f) => active.has(f.key))
        .map((f) => f.label.toLowerCase())
        .join(' + ')
    : 'all trade types'

  return (
    <div className="space-y-4">
      {/* ---------- controls ---------- */}
      <div className="sticky top-0 z-30 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/95 px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80">
        <div className="flex flex-wrap items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setActive(new Set())}
            className={`whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
              active.size === 0
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            All
          </button>
          {FILTERS.map((f) => {
            const on = active.has(f.key)
            const meta = ACTION_META[f.key]
            return (
              <button
                key={f.key}
                onClick={() => toggleFilter(f.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                  on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: meta.dot }} />
                {f.label}
                <span className={on ? 'text-white/60' : 'text-gray-400'}>{totalByType[f.key]}</span>
              </button>
            )
          })}
        </div>

        <button
          onClick={() => setHideTransient((v) => !v)}
          aria-pressed={hideTransient}
          className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
        >
          <span
            className={`relative inline-block h-4 w-7 flex-none rounded-full transition ${
              hideTransient ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                hideTransient ? 'left-3.5' : 'left-0.5'
              }`}
            />
          </span>
          Hide transient
        </button>

        <div className="ml-auto hidden text-xs text-gray-400 sm:block">
          <b className="text-gray-600">{shownTrades}</b> trades · <b className="text-gray-600">{quarters.length}</b> quarters · {filterLabel}
          {hideTransient && transientCount > 0 && (
            <>
              {' · '}
              <b className="text-gray-600">{transientCount}</b> transient hidden
            </>
          )}
        </div>
      </div>

      {/* transient hint on mobile (where meta line is hidden) */}
      {hideTransient && transientCount > 0 && (
        <p className="-mt-2 text-[11px] text-gray-400 sm:hidden">
          {transientCount} transient (1-quarter ~0% noise) hidden —{' '}
          <button onClick={() => setHideTransient(false)} className="font-semibold text-indigo-600 hover:text-indigo-800">
            show
          </button>
        </p>
      )}

      {/* ---------- timeline ---------- */}
      {quarters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-400">
          No trades match this filter.
        </div>
      ) : (
        <div className="relative pl-7 sm:pl-9">
          {/* spine */}
          <span className="pointer-events-none absolute bottom-2 left-[7px] top-2 w-0.5 bg-gradient-to-b from-gray-200 via-gray-200 to-transparent sm:left-[11px]" />
          <div className="space-y-3.5">
            {quarters.map((b, idx) => (
              <QuarterSection
                key={b.qi}
                bucket={b}
                newest={idx === 0}
                collapsed={collapsedQ.has(b.qi)}
                expanded={expandedQ.has(b.qi)}
                onToggleCollapse={() => toggleCollapse(b.qi)}
                onExpand={() => expandQuarter(b.qi)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ---------- methodology footnote ---------- */}
      <p className="border-t border-gray-200 pt-3 text-[11px] leading-relaxed text-gray-400">
        <b className="text-gray-500">Reading this tape:</b> each row is one quarter-over-quarter change inferred from consecutive
        13F filings — opens, share adds/trims, and full exits. Share-count change and resulting portfolio weight come from the
        filings; an exit&rsquo;s realized return compares the running average cost to the locked sell mark and is benchmarked vs the
        S&amp;P 500 over the same window. Prices are 13F-estimated quarter-mean marks; exits are locked at the sell-quarter price;
        long US equity only, ~45-day reporting delay. Transient positions are 1-quarter, ~0% holdings (filing noise), hidden by
        default. Not investment advice.
      </p>
    </div>
  )
}

function QuarterSection({
  bucket,
  newest,
  collapsed,
  expanded,
  onToggleCollapse,
  onExpand,
}: {
  bucket: QuarterBucket
  newest: boolean
  collapsed: boolean
  expanded: boolean
  onToggleCollapse: () => void
  onExpand: () => void
}) {
  const counts: Record<ActionType, number> = { open: 0, add: 0, trim: 0, exit: 0 }
  for (const t of bucket.trades) counts[t.type]++

  const summaryParts = (
    [
      { type: 'open', n: counts.open, verb: 'new' },
      { type: 'add', n: counts.add, verb: 'added' },
      { type: 'trim', n: counts.trim, verb: 'trimmed' },
      { type: 'exit', n: counts.exit, verb: 'exited' },
    ] as { type: ActionType; n: number; verb: string }[]
  ).filter((p) => p.n > 0)

  const maxC = Math.max(counts.open, counts.add, counts.trim, counts.exit, 1)
  const so = standout(bucket.trades)

  const visible = expanded ? bucket.trades : bucket.trades.slice(0, COLLAPSE_AT)
  const hiddenCount = bucket.trades.length - visible.length

  return (
    <div className="relative">
      {/* node on the spine */}
      <span
        className={`absolute -left-[26px] top-3.5 z-10 h-3.5 w-3.5 rounded-full border-[3px] bg-white sm:-left-[30px] ${
          newest ? 'border-indigo-500 ring-4 ring-indigo-100' : 'border-gray-400'
        }`}
      />
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* quarter header */}
        <button
          onClick={onToggleCollapse}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-gray-50 sm:gap-3 sm:px-4"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 flex-none text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span className="whitespace-nowrap text-sm font-extrabold tracking-tight text-gray-900">{bucket.label}</span>
          {newest && (
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
              Latest
            </span>
          )}
          {/* mini composition bar */}
          <span className="flex flex-none items-end gap-0.5">
            {(['open', 'add', 'trim', 'exit'] as ActionType[]).map((t) =>
              counts[t] ? (
                <span
                  key={t}
                  className="block w-1 rounded-sm"
                  style={{ height: `${Math.max(5, Math.round((counts[t] / maxC) * 16))}px`, background: ACTION_META[t].dot }}
                />
              ) : null,
            )}
          </span>
          {/* one-line summary */}
          <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
            {summaryParts.map((p) => (
              <span key={p.type} className="mr-2.5 font-semibold">
                <b style={{ color: ACTION_META[p.type].dot }}>{p.n}</b> {p.verb}
              </span>
            ))}
          </span>
          {/* standout */}
          {so && (
            <span className="hidden whitespace-nowrap rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-gray-700 md:inline-flex">
              <span className="mr-1 text-amber-500">★</span>
              {so}
            </span>
          )}
        </button>

        {/* events */}
        {!collapsed && (
          <div className="border-t border-gray-100">
            {visible.map((t, i) => (
              <EventRow key={`${t.ticker}-${t.qi}-${t.type}-${i}`} t={t} />
            ))}
            {hiddenCount > 0 && (
              <div className="flex justify-center border-t border-gray-100 px-3 py-2">
                <button
                  onClick={onExpand}
                  className="rounded-lg px-3 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50"
                >
                  +{hiddenCount} more this quarter ↓
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EventRow({ t }: { t: Trade }) {
  const meta = ACTION_META[t.type]
  const priceLabel = t.type === 'exit' ? 'Exit mark' : t.type === 'open' ? 'Entry mark' : 'Mark'

  return (
    <div
      className={`grid grid-cols-[28px_1fr_auto] items-center gap-x-2.5 gap-y-1 border-t border-gray-100 px-3 py-2.5 first:border-t-0 hover:bg-gray-50 sm:grid-cols-[30px_minmax(140px,176px)_1fr_96px_auto] sm:gap-x-3 sm:gap-y-0 ${
        t.transient ? 'opacity-60' : ''
      }`}
    >
      {/* action glyph */}
      <span
        className={`row-span-3 flex h-7 w-7 flex-none items-center justify-center self-start rounded-lg text-sm font-bold sm:row-span-1 sm:self-center ${meta.bg} ${meta.text}`}
      >
        {meta.glyph}
      </span>

      {/* ticker + company */}
      <div className="col-start-2 min-w-0 sm:col-start-2">
        <div className="flex items-center gap-1.5">
          {t.linkable ? (
            <Link
              href={`/stocks/${encodeURIComponent(t.ticker)}`}
              className="text-sm font-extrabold tracking-tight text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              {tidyTicker(t.ticker, t.name)}
            </Link>
          ) : (
            <span className="text-sm font-extrabold tracking-tight text-gray-800">{tidyTicker(t.ticker, t.name)}</span>
          )}
          {t.status === 'held' && (
            <span className="rounded bg-gray-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-gray-500">
              held
            </span>
          )}
        </div>
        <div className="truncate text-[11px] text-gray-400">{t.name}</div>
      </div>

      {/* return pill (top-right on mobile, last column on desktop) */}
      <div className="col-start-3 row-start-1 self-start text-right sm:col-start-5 sm:row-start-1 sm:self-center">
        <ReturnCell t={t} />
      </div>

      {/* action text + size */}
      <div className="col-start-2 row-start-2 min-w-0 text-xs text-gray-600 sm:col-start-3 sm:row-start-1">
        <span className={`font-bold ${meta.text}`}>{meta.verb}</span>
        {t.chg_pct != null && (t.type === 'add' || t.type === 'trim') && (
          <>
            {' '}
            <span className={`font-bold ${t.chg_pct >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              {fmtPct(t.chg_pct)}
            </span>{' '}
            <span className="text-gray-400">shares</span>
          </>
        )}
        {t.type !== 'exit' && t.shares_delta !== 0 && (
          <span className="text-gray-400"> ({fmtShares(t.shares_delta)})</span>
        )}
        {t.type === 'exit' ? (
          <span className="text-gray-400"> — position closed</span>
        ) : (
          <span className="text-gray-400">
            {' '}
            → <b className="font-bold text-gray-600">{t.weight.toFixed(1)}%</b> of portfolio
          </span>
        )}
      </div>

      {/* price */}
      <div className="col-start-2 row-start-3 flex items-baseline gap-1.5 text-xs text-gray-600 sm:col-start-4 sm:row-start-1 sm:block sm:text-right">
        <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400 sm:block">{priceLabel}</span>
        <b className="text-[13px] font-bold text-gray-900">{fmtPrice(t.price)}</b>
      </div>
    </div>
  )
}

function ReturnCell({ t }: { t: Trade }) {
  if (t.type !== 'exit') return null
  if (t.ret == null) return <span className="text-[11px] text-gray-300">no mark</span>

  const cls = t.ret > 0.05 ? 'text-green-600' : t.ret < -0.05 ? 'text-red-500' : 'text-gray-400'
  const spxTxt = t.spx != null ? `vs S&P ${fmtPct(t.spx)}/yr` : ''
  const holdTxt = t.ann != null ? `held ${t.holdY.toFixed(1)}y · ${fmtPct(t.ann)}/yr` : `held ${t.holdY.toFixed(1)}y`

  return (
    <div className="tabular-nums">
      <div className={`text-sm font-extrabold tracking-tight ${cls}`}>{fmtPct(t.ret)}</div>
      <div className="mt-px flex items-center justify-end gap-1">
        <span
          className={`rounded-full px-1.5 text-[9px] font-extrabold ${
            t.beat ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}
        >
          {t.beat ? 'BEAT S&P' : 'LAGGED'}
        </span>
      </div>
      {(spxTxt || holdTxt) && (
        <div className="mt-px text-[10px] text-gray-400">
          {spxTxt}
          {spxTxt && holdTxt ? ' · ' : ''}
          {holdTxt}
        </div>
      )}
    </div>
  )
}
