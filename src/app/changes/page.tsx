import Link from 'next/link'
import type { Metadata } from 'next'
import { getScoredChanges, formatValueFromThousands, loadPrices } from '@/lib/portfolio-data'
import ChangesClient from './ChangesClient'

export const metadata: Metadata = {
  title: 'Latest Position Changes — SuperInvestors',
  description:
    'Track quarter-over-quarter 13F filing changes from the world\'s best investors. See new positions, increases, decreases, and exits in real time.',
  keywords: [
    '13F filings',
    'position changes',
    'super investors',
    'portfolio changes',
    'value investing',
  ],
}

export default function ChangesPage() {
  const changes = getScoredChanges()

  // Load price data
  const allPrices = loadPrices()
  const currentPrices: Record<string, { price: number; prev_close: number }> = {}
  if (allPrices?.current_prices) {
    for (const [ticker, data] of Object.entries(allPrices.current_prices)) {
      currentPrices[ticker] = { price: data.price, prev_close: data.prev_close }
    }
  }

  // Compute summary stats
  const summaryStats = {
    newCount: changes.filter(c => c.change_type === 'NEW').length,
    increasedCount: changes.filter(c => c.change_type === 'INCREASED').length,
    decreasedCount: changes.filter(c => c.change_type === 'DECREASED').length,
    soldOutCount: changes.filter(c => c.change_type === 'SOLD_OUT').length,
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-700">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">Changes</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
          Latest Position Changes
        </h1>
        <p className="mt-3 text-base sm:text-lg text-gray-500 max-w-3xl leading-relaxed">
          Quarter-over-quarter changes from 13F filings, ranked by importance — combining
          investor quality score with the proportional weight of each change.
        </p>
      </div>

      {/* No data banner */}
      {changes.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          No 13F data available yet. Run the data pipeline to fetch filings.
        </div>
      )}

      {/* Client-side interactive content */}
      {changes.length > 0 && (
        <ChangesClient changes={changes} currentPrices={currentPrices} />
      )}
    </div>
  )
}
