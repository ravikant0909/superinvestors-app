'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchApiJson } from '@/lib/api'

interface InvestorSummary {
  slug: string
  filings_count: number | null
}

interface ChangeEntry {
  investor_slug: string
  investor_name: string
  ticker: string | null
  security_name: string
  change_type: string
  value_change: number
}

interface PriceEntry {
  symbol: string
  price: number
  change: number
  changePercent: number
}

interface PricesResponse {
  prices: PriceEntry[]
}

function changeLabel(changeType: string): string {
  switch (changeType) {
    case 'NEW': return 'NEW'
    case 'INCREASED': return 'INCREASED'
    case 'DECREASED': return 'DECREASED'
    case 'SOLD_OUT': return 'SOLD'
    default: return changeType
  }
}

function changeBadgeClass(changeType: string): string {
  switch (changeType) {
    case 'NEW': return 'px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-300'
    case 'INCREASED': return 'px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-300'
    case 'DECREASED': return 'px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-300'
    case 'SOLD_OUT': return 'px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-300'
    default: return 'px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-300'
  }
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatValueFromThousands(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}B`
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}M`
  return `$${value.toFixed(0)}K`
}

function getDisplayTicker(ticker: string | null, securityName: string): string {
  if (!ticker || /^\d{5,}/.test(ticker)) {
    return titleCase(securityName).split(' ').slice(0, 2).join(' ')
  }
  return ticker
}

export default function HomeClient({
  initialTrackedInvestorCount,
  initial13fCoverageCount,
}: {
  initialTrackedInvestorCount: number
  initial13fCoverageCount: number
}) {
  const [investorCount, setInvestorCount] = useState<number>(initialTrackedInvestorCount)
  const [coverageCount, setCoverageCount] = useState<number>(initial13fCoverageCount)
  const [changes, setChanges] = useState<ChangeEntry[]>([])
  const [prices, setPrices] = useState<Record<string, PriceEntry>>({})
  const [changesLoaded, setChangesLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [investors, latestChanges] = await Promise.all([
          fetchApiJson<InvestorSummary[]>('/api/investors'),
          fetchApiJson<ChangeEntry[]>('/api/changes?limit=8'),
        ])

        if (cancelled) {
          return
        }

        setInvestorCount(investors.length)
        setCoverageCount(investors.filter((investor) => (investor.filings_count ?? 0) > 0).length)
        setChanges(latestChanges)
        setChangesLoaded(true)

        const symbols = Array.from(new Set(
          latestChanges
            .map((change) => change.ticker)
            .filter((ticker): ticker is string => Boolean(ticker) && !/^\d{5,}/.test(ticker!)),
        ))

        if (symbols.length === 0) {
          return
        }

        const response = await fetchApiJson<PricesResponse>(`/api/prices?symbols=${symbols.join(',')}`)
        if (cancelled) {
          return
        }

        const priceMap: Record<string, PriceEntry> = {}
        for (const entry of response.prices) {
          priceMap[entry.symbol] = entry
        }
        setPrices(priceMap)
      } catch {
        if (!cancelled) {
          setChangesLoaded(true)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-20">
      <section className="pt-16 pb-4 max-w-3xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
          Track what the smartest investors in the world are buying and selling
        </h1>
        <p className="mt-6 text-lg text-gray-500 leading-relaxed">
          We track {investorCount} investors. 13F filing history is currently available
          for {coverageCount} SEC filers, and we&apos;re expanding from there.
        </p>
        <p className="mt-4 text-lg text-gray-500 leading-relaxed">
          For the covered investors, we track not just <em>what</em> they own, but
          how positions change over time. Selected holdings also get AI-generated
          conviction research and price-aware tracking.
        </p>
        <p className="mt-4 text-base text-gray-400">
          This is a one-person effort, kept free for everyone.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/investors"
            className="inline-flex items-center justify-center px-7 py-3 rounded-lg bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition shadow"
          >
            Browse Investors
          </Link>
          <Link
            href="/best-ideas"
            className="inline-flex items-center justify-center px-7 py-3 rounded-lg bg-white text-gray-900 text-sm font-semibold border border-gray-300 hover:bg-gray-50 transition shadow-sm"
          >
            See Best Ideas
          </Link>
        </div>
      </section>

      <section className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900">Our Thesis</h2>
        <div className="mt-6 space-y-4 text-base text-gray-600 leading-relaxed">
          <p>
            We believe the best way to find great investments is to follow investors
            whose <strong>philosophy</strong> we trust &mdash; concentrated, long-term,
            downside-focused thinkers. Not quants. Not momentum traders. People who
            eat their own cooking and explain their reasoning publicly.
          </p>
          <p>
            Every analysis is done with <strong>AGI by 2030</strong> as a core
            assumption. If a business can&apos;t survive that transition, it doesn&apos;t
            belong in the portfolio.
          </p>
          <p>
            We compute &ldquo;floor prices&rdquo; &mdash; prices at which there&apos;s
            very little chance of losing money &mdash; and track how each investor&apos;s
            thesis evolves as new data arrives.
          </p>
          <p className="text-gray-400 text-sm">
            We don&apos;t give buy or sell recommendations. We provide the analysis for
            <strong> you</strong> to decide.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-gray-900 text-center">What You Get</h2>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <FeatureCard
            title="Portfolio Tracking"
            description="See every position, every change, every quarter for the investors currently covered by the 13F pipeline."
            href="/investors"
            cta="Browse investors"
          />
          <FeatureCard
            title="Conviction Analysis"
            description="Deep dives into selected high-conviction positions. This coverage expands separately from the 13F dataset."
            href="/convictions"
            cta="Read conviction bets"
          />
          <FeatureCard
            title="Track Record"
            description="See how covered investors' decisions have panned out historically with quarter-over-quarter changes and dollar impact."
            href="/changes"
            cta="View latest changes"
          />
          <FeatureCard
            title="Best Ideas"
            description="Cross-investor ranking of the most compelling current opportunities based on overlap, concentration, and investor quality."
            href="/best-ideas"
            cta="Explore best ideas"
          />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Recent Activity</h2>
          <Link href="/changes" className="text-sm text-indigo-500 hover:text-indigo-700 font-medium">
            View all &rarr;
          </Link>
        </div>
        {changes.length > 0 ? (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {changes.map((change, idx) => {
                const price = change.ticker ? prices[change.ticker] : null
                return (
                  <li key={`${change.investor_slug}-${change.ticker ?? change.security_name}-${idx}`} className="px-5 py-3 hover:bg-gray-50 transition">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/investors/${change.investor_slug}`}
                            className="text-sm font-semibold text-gray-900 hover:text-indigo-600 truncate"
                          >
                            {change.investor_name}
                          </Link>
                          <span className={changeBadgeClass(change.change_type)}>
                            {changeLabel(change.change_type)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-sm">
                          <span className="font-mono font-bold text-gray-700">
                            {getDisplayTicker(change.ticker, change.security_name)}
                          </span>
                          {price && (
                            <span className="font-mono text-xs text-gray-600">
                              ${price.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              <span className={`ml-0.5 ${price.change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {price.change >= 0 ? '\u25B2' : '\u25BC'}
                              </span>
                            </span>
                          )}
                          <span className="text-gray-400 truncate">{titleCase(change.security_name)}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span
                          className={`text-sm font-semibold ${
                            change.value_change > 0 ? 'text-green-600' : 'text-red-500'
                          }`}
                        >
                          {change.value_change > 0 ? '+' : ''}
                          {formatValueFromThousands(change.value_change)}
                        </span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : changesLoaded ? (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-8 text-center text-sm text-gray-400">
            Live change data is unavailable right now.
          </div>
        ) : (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-8 text-center text-sm text-gray-400">
            Loading recent activity...
          </div>
        )}
      </section>

      <section className="max-w-2xl mx-auto text-center pb-4">
        <h2 className="text-lg font-semibold text-gray-700">A note on sustainability</h2>
        <div className="mt-4 space-y-2 text-sm text-gray-400 leading-relaxed">
          <p>
            This site is currently free. As usage grows, we plan to sustain it through advertising.
          </p>
          <p>
            The AI assistant is free for now but may become a paid feature as costs increase.
          </p>
          <p>
            Have feedback? Use the AI chat to tell us what you&apos;d like to see.
          </p>
        </div>
      </section>
    </div>
  )
}

function FeatureCard({
  title,
  description,
  href,
  cta,
}: {
  title: string
  description: string
  href: string
  cta: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
      <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm text-gray-500 leading-relaxed flex-1">{description}</p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center text-sm font-semibold text-indigo-500 hover:text-indigo-700 transition"
      >
        {cta} &rarr;
      </Link>
    </div>
  )
}
