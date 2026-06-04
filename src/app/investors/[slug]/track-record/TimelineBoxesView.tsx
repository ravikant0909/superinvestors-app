import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ACTION_META,
  fmtPrice,
  fmtShares,
  fmtValue,
  fmtPct,
  tidyTicker,
  qLabel,
  type ActionType,
  type HistoryEvent,
  type HistoryPosition,
  type HistoryView,
} from '@/lib/history-view'

const INITIAL_ROWS = 25
const ACTION_ORDER: ActionType[] = ['open', 'add', 'trim', 'exit']

function retClass(p: number | null): string {
  if (p == null) return 'text-gray-400'
  return p >= 0 ? 'text-green-600' : 'text-red-500'
}

// --- the per-event "step" box ---------------------------------------------
function EventBox({ e, peakWeight }: { e: HistoryEvent; peakWeight: number }) {
  const meta = ACTION_META[e.type]
  const isExit = e.type === 'exit'
  // weight bar is relative to this position's peak weight so the row reads as a
  // self-consistent sequence; guard against a zero/undefined peak.
  const pct = peakWeight > 0 ? Math.min(100, Math.max(0, (e.weight / peakWeight) * 100)) : 0

  return (
    <div
      className={`relative flex-shrink-0 w-[104px] sm:w-[112px] rounded-md border px-2 py-1.5 flex flex-col gap-1 ${meta.bg} ${meta.ring} ${
        isExit ? 'ring-1 ring-rose-300' : ''
      }`}
    >
      {/* header: glyph + verb + quarter */}
      <div className="flex items-center gap-1 min-w-0">
        <span className={`text-[11px] leading-none font-bold`} style={{ color: meta.dot }} aria-hidden>
          {meta.glyph}
        </span>
        <span className={`text-[10px] font-bold ${meta.text}`}>{meta.verb}</span>
        <span className="ml-auto text-[9px] font-semibold text-gray-500 whitespace-nowrap">{e.label}</span>
      </div>

      {/* the trade: signed shares + share %chg, then price — kept on tight lines */}
      <div className="text-[10px] font-mono text-gray-800 leading-tight">
        {isExit ? (
          <span>sold {fmtShares(e.shares_delta)}</span>
        ) : (
          <span>
            {fmtShares(e.shares_delta)}sh
            {e.chg_pct != null && <span className="text-gray-400"> {fmtPct(e.chg_pct)}</span>}
          </span>
        )}
        <span className="text-gray-500"> @{fmtPrice(e.price)}</span>
      </div>

      {/* resulting weight: tiny bar + label */}
      <div className="mt-auto pt-0.5">
        <div className="h-1 w-full rounded-full bg-white/70 overflow-hidden ring-1 ring-inset ring-black/5">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: meta.dot, opacity: isExit ? 0.35 : 0.85 }}
          />
        </div>
        <div className="mt-0.5 text-[9px] text-gray-500 leading-none">
          {isExit ? 'out · 0%' : `${e.weight.toFixed(e.weight >= 10 ? 0 : 1)}%`}
        </div>
      </div>
    </div>
  )
}

// --- one row per stock -----------------------------------------------------
function PositionRow({ p, slug }: { p: HistoryPosition; slug: string }) {
  void slug
  const held = p.status === 'held'
  // a sane denominator for the per-event weight bars
  const rowPeak = Math.max(p.peak_weight, p.current_weight, 1)

  const statusBadge = held ? (
    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-green-50 text-green-700">
      held · {p.current_weight.toFixed(p.current_weight >= 10 ? 0 : 1)}%
    </span>
  ) : (
    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
      exited {p.exit_qi != null ? qLabel(p.exit_qi) : ''}
    </span>
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* HEADER BAND — identity on the left, summary stats laid out horizontally to the
          right (captioned cells) instead of stacked in a cramped column. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-gray-100 px-3.5 py-2.5">
        <div className="mr-auto min-w-[150px]">
          <div className="flex items-center gap-1.5">
            {p.linkable ? (
              <Link
                href={`/stocks/${encodeURIComponent(p.ticker)}`}
                className="font-mono text-base font-extrabold text-indigo-600 hover:text-indigo-800"
              >
                {tidyTicker(p.ticker, p.name)}
              </Link>
            ) : (
              <span className="font-mono text-base font-extrabold text-gray-800">{tidyTicker(p.ticker, p.name)}</span>
            )}
            {statusBadge}
          </div>
          <p className="max-w-[240px] truncate text-[11px] text-gray-400">{p.name}</p>
        </div>

        {/* Return */}
        <div className="flex flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Return</span>
          <span className={`text-xl font-extrabold leading-none ${retClass(p.return_pct)}`}>{fmtPct(p.return_pct)}</span>
        </div>

        {/* Annualized + beat/lag */}
        {p.annualized_pct != null && (
          <div className="flex flex-col">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Annualized</span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              {fmtPct(p.annualized_pct)}/yr
              <span
                className={`rounded px-1 py-px text-[8px] font-bold uppercase tracking-wide ${
                  p.beat_spx ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {p.beat_spx ? 'beat' : 'lag'}
              </span>
            </span>
          </div>
        )}

        {/* Cost -> Now/Exit */}
        <div className="flex flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Cost &rarr; {held ? 'now' : 'exit'}</span>
          <span className="whitespace-nowrap text-sm font-medium tabular-nums text-gray-700">
            {fmtPrice(p.avg_cost)} &rarr; {fmtPrice(p.end_price)}
            {held && !p.end_is_live && p.return_pct != null && (
              <span className="text-amber-600"> (as of {p.now_label})</span>
            )}
          </span>
        </div>

        {/* vs S&P */}
        {p.spx_annual_pct != null && (
          <div className="flex flex-col">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">vs S&amp;P</span>
            <span className="whitespace-nowrap text-sm font-medium text-gray-500">{fmtPct(p.spx_annual_pct)}/yr</span>
          </div>
        )}

        {/* Held */}
        <div className="flex flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Held</span>
          <span className="whitespace-nowrap text-sm font-medium text-gray-600">
            {p.holding_years.toFixed(p.holding_years >= 10 ? 0 : 1)}y · {p.holding_quarters}q
            {p.prior_stints > 0 && <span className="text-amber-600"> · {p.prior_stints}× before</span>}
          </span>
        </div>
      </div>

      {/* EVENT STRIP — full width below the header; scrollbar sits at the bottom of the row */}
      <div className="bg-gray-50/60">
        {p.events.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] text-gray-400">No recorded trades.</div>
        ) : (
          <div className="w-full overflow-x-auto px-2.5 py-2.5">
            <div className="flex items-stretch gap-0">
              {p.events.map((e, i) => (
                <div key={`${e.qi}-${e.type}-${i}`} className="flex items-center">
                  <EventBox e={e} peakWeight={rowPeak} />
                  {i < p.events.length - 1 && (
                    <span className="flex-shrink-0 select-none px-0.5 text-gray-300" aria-hidden>
                      &rarr;
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// --- legend ----------------------------------------------------------------
function Legend() {
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-500">
      <span className="font-bold text-gray-500">Actions:</span>
      {ACTION_ORDER.map((a) => {
        const m = ACTION_META[a]
        return (
          <span key={a} className="inline-flex items-center gap-1">
            <span style={{ color: m.dot }} className="font-bold" aria-hidden>
              {m.glyph}
            </span>
            <span>{m.verb}</span>
          </span>
        )
      })}
    </div>
  )
}

export default function TimelineBoxesView({ view, slug }: { view: HistoryView; slug: string }) {
  const [showTransient, setShowTransient] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const { rows, transientCount } = useMemo(() => {
    const all = [...view.positions]
    // SORT: held first (by current $ desc, fallback peak $), then exited
    // (by exit_qi desc = most recently exited first, tie-break peak $ desc).
    all.sort((a, b) => {
      const aHeld = a.status === 'held'
      const bHeld = b.status === 'held'
      if (aHeld !== bHeld) return aHeld ? -1 : 1
      if (aHeld) {
        const av = a.current_value_thousands ?? a.peak_value_thousands
        const bv = b.current_value_thousands ?? b.peak_value_thousands
        return bv - av
      }
      const aExit = a.exit_qi ?? -1
      const bExit = b.exit_qi ?? -1
      if (bExit !== aExit) return bExit - aExit
      return b.peak_value_thousands - a.peak_value_thousands
    })

    const transientHidden = all.filter((p) => p.transient).length
    const visible = showTransient ? all : all.filter((p) => !p.transient)
    return { rows: visible, transientCount: transientHidden }
  }, [view.positions, showTransient])

  const heldRows = rows.filter((p) => p.status === 'held')
  const exitedRows = rows.filter((p) => p.status === 'exited')

  const shown = showAll ? rows : rows.slice(0, INITIAL_ROWS)
  // index in the visible-and-capped list where the exited group begins
  const firstExitedIdx = shown.findIndex((p) => p.status === 'exited')

  const { counts } = view.summary

  return (
    <div className="space-y-4">
      {/* legend + transient toggle */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <Legend />
        <button
          onClick={() => setShowTransient((v) => !v)}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        >
          {showTransient
            ? `Hide ${counts.transient} transient`
            : `${counts.transient} transient hidden — show`}
        </button>
      </div>

      {/* held group header */}
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">
          Currently held ({counts.held})
        </h2>
        <span className="flex-1 h-px bg-gray-200" />
      </div>

      <div className="space-y-2">
        {shown.map((p, i) => (
          <div key={`${p.ticker}-${p.first_quarter}-${p.cusip}`}>
            {/* exited divider appears inline once we cross into exited rows */}
            {i === firstExitedIdx && firstExitedIdx > 0 && (
              <div className="flex items-center gap-2 pt-2 pb-3">
                <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Exited ({counts.exited})
                </h2>
                <span className="flex-1 h-px bg-gray-200" />
              </div>
            )}
            <PositionRow p={p} slug={slug} />
          </div>
        ))}
        {shown.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-10 text-center text-sm text-gray-400">
            No positions to show{!showTransient && counts.transient > 0 ? ' — all are transient.' : '.'}
          </div>
        )}
      </div>

      {/* show all / show fewer */}
      {rows.length > INITIAL_ROWS && (
        <div className="text-center">
          <button
            onClick={() => setShowAll((v) => !v)}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          >
            {showAll
              ? `Show first ${INITIAL_ROWS}`
              : `Show all ${rows.length} rows (${heldRows.length} held · ${exitedRows.length} exited)`}
          </button>
          {!showAll && (
            <p className="mt-1.5 text-[11px] text-gray-400">
              Showing {shown.length} of {rows.length} rows.
            </p>
          )}
        </div>
      )}

      {/* methodology footnote */}
      <p className="text-[11px] text-gray-400 leading-relaxed">
        Each box is one filed change to the position, oldest left → newest/now right. Prices are 13F-estimated
        quarter-mean marks; exits are locked at the sell-quarter price. Weight bars are scaled to each
        position&apos;s own peak weight. 13F = long US equity only, ~45-day delay (S&amp;P {view.summary.spx_asof}).
        Not investment advice.
      </p>
    </div>
  )
}
