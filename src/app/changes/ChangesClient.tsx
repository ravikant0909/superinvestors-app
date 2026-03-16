'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchApiJson, fetchPriceMap } from '@/lib/api'
import { getConvictionHref } from '@/lib/conviction-index'

interface ChangeRecord {
  change_type: 'NEW' | 'INCREASED' | 'DECREASED' | 'SOLD_OUT'
  shares_before: number
  shares_after: number
  shares_change: number
  shares_change_pct: number | null
  value_before: number
  value_after: number
  value_change: number
  pct_of_portfolio_before: number | null
  pct_of_portfolio_after: number | null
  year: number
  quarter: number
  report_date: string
  investor_name: string
  investor_slug: string
  investor_firm: string
  investor_score: number | null
  ticker: string | null
  security_name: string
  security_slug: string
  importance_score: number
}

type TabView = 'top' | 'by-action' | 'by-investor'
type ActionFilter = 'NEW' | 'SOLD_OUT' | 'INCREASED' | 'DECREASED'

function fmtValue(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}B`
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}M`
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

function titleCase(text: string): string {
  return text.toLowerCase().split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
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

const PAGE_SIZE = 20
const ACTION_TABS: { key: ActionFilter; label: string; active: string }[] = [
  { key: 'NEW', label: 'New Positions', active: 'bg-green-100 text-green-800 border-green-300' },
  { key: 'SOLD_OUT', label: 'Full Exits', active: 'bg-red-100 text-red-800 border-red-300' },
  { key: 'INCREASED', label: 'Increases', active: 'bg-blue-100 text-blue-800 border-blue-300' },
  { key: 'DECREASED', label: 'Decreases', active: 'bg-orange-100 text-orange-800 border-orange-300' },
]

export default function ChangesClient() {
  const [changes, setChanges] = useState<ChangeRecord[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<TabView>('by-investor')
  const [actionFilter, setActionFilter] = useState<ActionFilter>('NEW')
  const [expandedInvestors, setExpandedInvestors] = useState<Set<string>>(new Set())
  const [topVisible, setTopVisible] = useState(PAGE_SIZE)
  const [actionVisible, setActionVisible] = useState(PAGE_SIZE)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await fetchApiJson<ChangeRecord[]>('/api/changes?limit=500')
        if (cancelled) return
        setChanges(data)

        const symbols = data
          .map((change) => change.ticker)
          .filter((ticker): ticker is string => Boolean(ticker) && !/^\d{5,}/.test(ticker!))
        const priceMap = await fetchPriceMap(symbols)
        if (!cancelled) {
          setPrices(priceMap)
        }
      } finally {
        if (!cancelled) {
          setLoaded(true)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  const byActionType = useMemo(() => {
    const grouped: Record<ActionFilter, ChangeRecord[]> = {
      NEW: [],
      INCREASED: [],
      DECREASED: [],
      SOLD_OUT: [],
    }

    for (const change of changes) {
      grouped[change.change_type].push(change)
    }

    return grouped
  }, [changes])

  const byInvestor = useMemo(() => {
    const grouped = new Map<string, { slug: string; name: string; firm: string; score: number; changes: ChangeRecord[] }>()
    for (const change of changes) {
      if (!grouped.has(change.investor_slug)) {
        grouped.set(change.investor_slug, {
          slug: change.investor_slug,
          name: change.investor_name,
          firm: change.investor_firm,
          score: change.investor_score ?? 0,
          changes: [],
        })
      }
      grouped.get(change.investor_slug)!.changes.push(change)
    }
    return Array.from(grouped.values()).sort((a, b) => b.score - a.score)
  }, [changes])

  const actionCounts = useMemo(() => ({
    NEW: byActionType.NEW.length,
    SOLD_OUT: byActionType.SOLD_OUT.length,
    INCREASED: byActionType.INCREASED.length,
    DECREASED: byActionType.DECREASED.length,
  }), [byActionType])

  function toggleInvestor(slug: string) {
    setExpandedInvestors((previous) => {
      const next = new Set(previous)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  function renderCard(change: ChangeRecord, index: number, opts?: { hideInvestor?: boolean }) {
    const price = change.ticker ? prices[change.ticker] : null
    const displayTicker = !change.ticker || /^\d{5,}/.test(change.ticker)
      ? titleCase(change.security_name).split(' ').slice(0, 3).join(' ')
      : change.ticker
    const convictionHref = getConvictionHref(change.investor_slug, change.ticker)
    const previousWeight = change.pct_of_portfolio_before ?? 0
    const currentWeight = change.pct_of_portfolio_after ?? 0
    const estimatedTradePrice = change.shares_change !== 0
      ? (Math.abs(change.value_change) * 1000) / Math.abs(change.shares_change)
      : null

    return (
      <div
        key={`${change.investor_slug}-${change.security_slug}-${index}`}
        className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {!opts?.hideInvestor && (
              <>
                <Link href={`/investors/${change.investor_slug}`} className="text-sm font-semibold text-gray-900 hover:text-indigo-600 truncate">
                  {change.investor_name}
                </Link>
                <span className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold ${
                  (change.investor_score ?? 0) >= 8 ? 'bg-green-100 text-green-700' :
                  (change.investor_score ?? 0) >= 7 ? 'bg-blue-100 text-blue-700' :
                  (change.investor_score ?? 0) >= 6 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {(change.investor_score ?? 0).toFixed(1)}
                </span>
              </>
            )}
          </div>
          <span className={`shrink-0 px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${changeBadge(change.change_type)}`}>
            {changeVerb(change.change_type)}
          </span>
        </div>

        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="font-mono font-bold text-base text-gray-900">{displayTicker}</span>
          {price != null && (
            <span className="font-mono text-sm text-gray-500">{fmtPrice(price)}</span>
          )}
          {convictionHref && (
            <Link href={convictionHref} className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium ml-auto">
              Conviction &rarr;
            </Link>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mb-2 truncate">{titleCase(change.security_name)}</p>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2">
          <div>
            <span className="text-gray-400">{change.shares_change > 0 ? 'Bought' : 'Sold'}: </span>
            <span className="font-mono font-semibold text-gray-800">{fmtShares(Math.abs(change.shares_change))} shares</span>
          </div>
          {estimatedTradePrice != null && (
            <div>
              <span className="text-gray-400">Est. @ </span>
              <span className="font-mono font-semibold text-gray-800">{fmtPrice(estimatedTradePrice)}</span>
            </div>
          )}
          <div>
            <span className="text-gray-400">Quarter: </span>
            <span className="font-mono font-semibold text-gray-800">{change.year}-Q{change.quarter}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <Metric label="Value delta" value={`${change.value_change > 0 ? '+' : ''}${fmtValue(change.value_change)}`} valueClass={change.value_change > 0 ? 'text-green-600' : 'text-red-500'} />
          <Metric label="Before" value={`${previousWeight.toFixed(1)}%`} />
          <Metric label="After" value={`${currentWeight.toFixed(1)}%`} />
        </div>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-8 text-center text-sm text-gray-400">
        Loading changes...
      </div>
    )
  }

  if (changes.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
        No 13F data available yet.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === 'top'} onClick={() => setTab('top')}>Top Changes</TabButton>
        <TabButton active={tab === 'by-action'} onClick={() => setTab('by-action')}>By Action</TabButton>
        <TabButton active={tab === 'by-investor'} onClick={() => setTab('by-investor')}>By Investor</TabButton>
      </div>

      {tab === 'top' && (
        <div className="space-y-4">
          <div className="grid gap-4">
            {changes.slice(0, topVisible).map((change, index) => renderCard(change, index))}
          </div>
          {topVisible < changes.length && (
            <div className="text-center">
              <button
                onClick={() => setTopVisible((count) => count + PAGE_SIZE)}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'by-action' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {ACTION_TABS.map((tabItem) => (
              <button
                key={tabItem.key}
                onClick={() => setActionFilter(tabItem.key)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg border ${
                  actionFilter === tabItem.key
                    ? tabItem.active
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {tabItem.label} ({actionCounts[tabItem.key]})
              </button>
            ))}
          </div>
          <div className="grid gap-4">
            {byActionType[actionFilter].slice(0, actionVisible).map((change, index) => renderCard(change, index))}
          </div>
          {actionVisible < byActionType[actionFilter].length && (
            <div className="text-center">
              <button
                onClick={() => setActionVisible((count) => count + PAGE_SIZE)}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'by-investor' && (
        <div className="space-y-3">
          {byInvestor.map((group) => {
            const isExpanded = expandedInvestors.has(group.slug)
            const visibleChanges = isExpanded ? group.changes : group.changes.slice(0, 3)
            return (
              <div key={group.slug} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleInvestor(group.slug)}
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-gray-50 transition"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/investors/${group.slug}`} className="text-base font-bold text-gray-900 hover:text-indigo-600">
                        {group.name}
                      </Link>
                      <span className="text-xs text-gray-400">{group.firm}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{group.changes.length} recent changes</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${
                      group.score >= 8 ? 'text-green-600' :
                      group.score >= 7 ? 'text-blue-600' :
                      group.score >= 6 ? 'text-yellow-600' :
                      'text-gray-600'
                    }`}>
                      {group.score.toFixed(1)}
                    </span>
                    <span className="text-gray-400">{isExpanded ? '−' : '+'}</span>
                  </div>
                </button>
                <div className="px-5 pb-5 grid gap-4">
                  {visibleChanges.map((change, index) => renderCard(change, index, { hideInvestor: true }))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg border ${
        active
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}

function Metric({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold text-gray-900 ${valueClass ?? ''}`}>{value}</div>
    </div>
  )
}
