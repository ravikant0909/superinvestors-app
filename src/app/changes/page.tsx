import Link from 'next/link'
import type { Metadata } from 'next'
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
  return (
    <div className="space-y-8">
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-700">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">Changes</span>
      </nav>

      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
          Latest Position Changes
        </h1>
        <p className="mt-3 text-base sm:text-lg text-gray-500 max-w-3xl leading-relaxed">
          Quarter-over-quarter changes from 13F filings, ranked by importance using runtime data from the D1-backed API.
        </p>
      </div>

      <ChangesClient />
    </div>
  )
}
