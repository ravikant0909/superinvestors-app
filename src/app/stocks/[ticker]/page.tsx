import type { Metadata } from 'next'
import StockDetailClient from './StockDetailClient'
import { STATIC_STOCK_TICKERS, STATIC_STOCK_META } from '@/lib/static-stocks'
import { REPORT_TICKERS, REPORT_BY_TICKER } from '@/lib/static-reports'

export function generateStaticParams() {
  // Union of held tickers and tickers that have a deep-dive report, so the
  // full research corpus is browsable (report-only tickers get a page too).
  const all = new Set<string>([...STATIC_STOCK_TICKERS, ...REPORT_TICKERS])
  return Array.from(all).map((ticker) => ({ ticker }))
}

function titleCase(text: string): string {
  return text.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>
}): Promise<Metadata> {
  const { ticker } = await params
  const symbol = decodeURIComponent(ticker).toUpperCase()
  const meta = STATIC_STOCK_META.get(symbol)
  const report = REPORT_BY_TICKER.get(symbol)
  const name = report?.name || (meta?.name ? titleCase(meta.name) : symbol)
  const ownedBy = meta ? ` ${meta.holder_count} tracked super investors own it.` : ''
  const hasReport = report ? ' Includes a deep-dive research report.' : ''
  return {
    title: `Who Owns ${symbol}? — ${name} | SuperInvestors`,
    description: `Which super investors hold ${name} (${symbol}).${ownedBy}${hasReport} See position sizes, recent buys and sells, and consensus from 13F filings.`,
  }
}

export default async function StockPage({
  params,
}: {
  params: Promise<{ ticker: string }>
}) {
  const { ticker } = await params
  return <StockDetailClient ticker={decodeURIComponent(ticker).toUpperCase()} />
}
