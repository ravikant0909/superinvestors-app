import Link from 'next/link'
import type { Metadata } from 'next'
import StocksClient from './StocksClient'

export const metadata: Metadata = {
  title: 'Stocks Owned by Super Investors — Who Owns What',
  description:
    'Browse every stock held by tracked super investors, ranked by how many own it, total value, and average position weight. See who owns any ticker.',
  keywords: [
    'who owns stock',
    'super investor holdings',
    '13F stock ownership',
    'institutional ownership',
    'value investor stocks',
  ],
}

export default function StocksPage() {
  return (
    <div className="space-y-8">
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-700">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">Stocks</span>
      </nav>

      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
          Stocks
        </h1>
        <p className="mt-3 text-base sm:text-lg text-gray-500 max-w-3xl leading-relaxed">
          Every stock held by the tracked investors with 13F coverage, ranked by how
          many own it. Click any ticker to see exactly who owns it and why.
        </p>
      </div>

      <StocksClient />
    </div>
  )
}
