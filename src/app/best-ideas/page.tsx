import Link from 'next/link'
import type { Metadata } from 'next'
import BestIdeasClient from './BestIdeasClient'

export const metadata: Metadata = {
  title: 'Best Ideas — High-Conviction Stock Picks from Super Investors',
  description:
    'Stocks ranked by multi-holder overlap, position sizing, and investor quality using runtime D1 data.',
  keywords: [
    'best stock ideas',
    'super investor picks',
    'high conviction bets',
    '13F analysis',
    'value investing ideas',
  ],
}

export default function BestIdeasPage() {
  return (
    <div className="space-y-8">
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-700">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">Best Ideas</span>
      </nav>

      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
          Best Ideas
        </h1>
        <p className="mt-3 text-base sm:text-lg text-gray-500 max-w-3xl leading-relaxed">
          Stocks ranked using runtime D1 data across holder overlap, position size, and investor quality.
        </p>
      </div>

      <BestIdeasClient />
    </div>
  )
}
