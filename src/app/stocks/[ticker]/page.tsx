import type { Metadata } from 'next'
import StockDetailClient from './StockDetailClient'
import { STATIC_STOCK_TICKERS, STATIC_STOCK_META } from '@/lib/static-stocks'

export function generateStaticParams() {
  return STATIC_STOCK_TICKERS.map((ticker) => ({ ticker }))
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
  const name = meta?.name ? titleCase(meta.name) : symbol
  const ownedBy = meta ? ` ${meta.holder_count} tracked super investors own it.` : ''
  return {
    title: `Who Owns ${symbol}? — ${name} | SuperInvestors`,
    description: `Which super investors hold ${name} (${symbol}).${ownedBy} See position sizes, recent buys and sells, and consensus from 13F filings.`,
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
