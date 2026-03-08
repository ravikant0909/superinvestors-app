'use client'

import { useState } from 'react'
import Link from 'next/link'
import PortfolioWeightBadge from '@/components/PortfolioWeightBadge'
import type { ConvictionBet } from './page'

interface ConvictionsClientProps {
  bets: ConvictionBet[]
  investors: string[]
}

function formatValue(millions: number): string {
  if (millions == null || millions === 0) return '--'
  if (millions >= 1000) return `$${(millions / 1000).toFixed(1)}B`
  return `$${millions.toFixed(0)}M`
}

export default function ConvictionsClient({ bets, investors }: ConvictionsClientProps) {
  const [investorFilter, setInvestorFilter] = useState<string>('all')
  const [minWeight, setMinWeight] = useState<number>(10)

  const filtered = bets.filter((b) => {
    if (investorFilter !== 'all' && b.investor_name !== investorFilter) return false
    if (b.weight_pct < minWeight) return false
    return true
  })

  const hasBets = bets.length > 0

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="text-center py-10 sm:py-14">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight">
          Conviction Bets
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
          Positions where legendary investors have &gt;10% of their portfolio in a single stock.
          These are their highest-conviction ideas — the bets they&apos;re willing to concentrate on.
        </p>
        {hasBets && (
          <div className="mt-6 flex justify-center gap-6 text-sm">
            <div className="text-center">
              <span className="text-2xl font-extrabold text-gray-900">{bets.length}</span>
              <p className="text-gray-500">Conviction Bets</p>
            </div>
            <div className="text-center">
              <span className="text-2xl font-extrabold text-gray-900">{investors.length}</span>
              <p className="text-gray-500">Investors</p>
            </div>
            <div className="text-center">
              <span className="text-2xl font-extrabold text-gray-900">
                {bets.length > 0 ? bets[0].weight_pct.toFixed(1) + '%' : '--'}
              </span>
              <p className="text-gray-500">Max Weight</p>
            </div>
          </div>
        )}
      </section>

      {!hasBets && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          No conviction bet data available yet. Research agents are still generating analyses.
          Check back soon.
        </div>
      )}

      {/* Filters */}
      {hasBets && (
        <section className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1 uppercase tracking-wide">
              Investor
            </label>
            <select
              value={investorFilter}
              onChange={(e) => setInvestorFilter(e.target.value)}
              className="block w-56 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-200 focus:border-purple-500 outline-none"
            >
              <option value="all">All Investors</option>
              {investors.map((inv) => (
                <option key={inv} value={inv}>
                  {inv}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1 uppercase tracking-wide">
              Min Weight
            </label>
            <select
              value={minWeight}
              onChange={(e) => setMinWeight(Number(e.target.value))}
              className="block w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-200 focus:border-purple-500 outline-none"
            >
              <option value={10}>10%+</option>
              <option value={20}>20%+</option>
              <option value={30}>30%+</option>
              <option value={50}>50%+</option>
            </select>
          </div>
          <div className="text-sm text-gray-400 ml-auto">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </div>
        </section>
      )}

      {/* Grid of cards */}
      {hasBets && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((bet) => (
            <Link
              key={bet.slug}
              href={`/convictions/${bet.slug}`}
              className="group bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-purple-300 transition-all overflow-hidden"
            >
              <div className="px-5 py-4">
                {/* Top row: investor + weight badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-purple-700 transition truncate">
                      {bet.investor_name}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{bet.firm_name}</p>
                  </div>
                  <PortfolioWeightBadge weight={bet.weight_pct} size="sm" />
                </div>

                {/* Ticker + Company */}
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-mono text-lg font-extrabold text-gray-900">
                    {bet.ticker}
                  </span>
                  <span className="text-sm text-gray-500 truncate">{bet.company_name}</span>
                </div>

                {/* Thesis headline */}
                {bet.thesis_headline && (
                  <p className="mt-2 text-sm text-gray-600 line-clamp-2 leading-snug">
                    {bet.thesis_headline}
                  </p>
                )}

                {/* Value */}
                <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                  <span>Value: {formatValue(bet.value_millions)}</span>
                  <span className="text-purple-600 font-medium group-hover:underline">
                    View thesis &rarr;
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}
