import stocksIndex from '../../data/stocks_index.json'

export interface StaticStock {
  ticker: string
  name: string
  sector: string | null
  holder_count: number
  total_value: number
}

export const STATIC_STOCKS = stocksIndex as StaticStock[]

export const STATIC_STOCK_TICKERS = STATIC_STOCKS.map((s) => s.ticker)

export const STATIC_STOCK_META = new Map(
  STATIC_STOCKS.map((s) => [s.ticker, s]),
)
