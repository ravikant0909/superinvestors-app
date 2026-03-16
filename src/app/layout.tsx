import type { Metadata } from 'next'
import './globals.css'
import Link from 'next/link'
import ChatWidget from '@/components/ChatWidget'

export const metadata: Metadata = {
  title: 'SuperInvestors — Track the World\'s Greatest Investors',
  description: 'Track what leading superinvestors are buying and selling with deep investor profiles, conviction theses, and cross-investor analysis.',
  keywords: ['super investors', '13F filings', 'value investing', 'portfolio tracker', 'Warren Buffett portfolio'],
}

const NAV_ITEMS = [
  { href: '/investors', label: 'Investors' },
  { href: '/changes', label: 'Changes' },
  { href: '/best-ideas', label: 'Best Ideas' },
  { href: '/convictions', label: 'Convictions' },
  { href: '/about', label: 'About' },
]

function Navbar() {
  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14 items-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900">SuperInvestors</span>
          </Link>
          <div className="hidden sm:flex items-center gap-6">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="sm:hidden pb-3">
          <div className="flex gap-2 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white hover:text-gray-900"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}

function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-500">
            SuperInvestors &mdash; Data from SEC EDGAR 13F filings. Not investment advice.
          </p>
          <div className="flex gap-4 text-sm text-gray-500">
            <Link href="/about" className="hover:text-gray-700">About</Link>
            <Link href="/about#methodology" className="hover:text-gray-700">Methodology</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
          {children}
        </main>
        <Footer />
        <ChatWidget />
      </body>
    </html>
  )
}
