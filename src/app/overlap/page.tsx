import Link from 'next/link'
import type { Metadata } from 'next'
import OverlapClient from './OverlapClient'

export const metadata: Metadata = {
  title: 'Cross-Investor Overlap — Where Super Investors Agree',
  description:
    'A heat map of the most-held stocks across tracked super investors. See which legends own the same names and at what conviction.',
  keywords: ['investor overlap', 'consensus stocks', 'cross-investor analysis', '13F overlap', 'cloned portfolios'],
}

export default function OverlapPage() {
  return (
    <div className="space-y-8">
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-700">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">Overlap</span>
      </nav>

      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
          Cross-Investor Overlap
        </h1>
        <p className="mt-3 text-base sm:text-lg text-gray-500 max-w-3xl leading-relaxed">
          Where the tracked investors converge. Each cell is one investor&apos;s position
          weight in a stock — darker means a bigger bet. Rows are investors who share at
          least two of the most-held names.
        </p>
      </div>

      <OverlapClient />
    </div>
  )
}
