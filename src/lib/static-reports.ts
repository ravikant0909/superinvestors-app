import reportsManifest from '../../data/reports_manifest.json'

export interface StockReport {
  ticker: string
  name: string
  sector: string | null
  version: string
  url: string
}

export const STOCK_REPORTS = reportsManifest as StockReport[]

export const REPORT_TICKERS = STOCK_REPORTS.map((r) => r.ticker)

export const REPORT_BY_TICKER = new Map(
  STOCK_REPORTS.map((r) => [r.ticker.toUpperCase(), r]),
)

export function getStockReport(ticker: string): StockReport | undefined {
  return REPORT_BY_TICKER.get(ticker.toUpperCase())
}
