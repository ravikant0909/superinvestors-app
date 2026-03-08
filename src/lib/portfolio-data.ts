/**
 * Portfolio data loading from 13F JSON output files.
 *
 * Reads data at build time from data/output/*.json files.
 * Maps investor slugs (from all_investors_ranked.json) to investor_keys
 * (the underscore-style keys used in 13F filenames).
 */
import fs from 'fs'
import path from 'path'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Holding {
  ticker: string
  name: string
  cusip: string
  value_thousands: number
  shares: number
  weight_pct: number
}

export interface ChangeEntry {
  cusip: string
  ticker: string
  name_of_issuer: string
  change_type: 'NEW' | 'INCREASED' | 'DECREASED' | 'SOLD_OUT' | 'UNCHANGED'
  current_shares: number
  previous_shares: number
  share_delta: number
  share_change_pct: number | null
  current_value: number
  previous_value: number
  value_delta: number
  current_weight_pct?: number | null
}

export interface ChangeSummary {
  new: number
  increased: number
  decreased: number
  sold_out: number
  unchanged: number
  total_current: number
  total_previous: number
}

export interface Changes {
  current_quarter: string
  previous_quarter: string
  summary: ChangeSummary
  total_current_value_thousands: number
  total_previous_value_thousands: number
  portfolio_value_delta_thousands: number
  portfolio_value_change_pct: number
  changes: ChangeEntry[]
}

export interface InvestorFilingData {
  investor_key: string
  name: string
  cik: string
  manager: string
  style: string
  status: string
  processed_at: string
  filings_count: number
  latest_quarter: string
  latest_filing_date: string
  latest_holdings_count: number
  latest_total_value_thousands: number
  top_holdings: Holding[]
  changes: Changes | null
}

// ─── Slug to Investor Key Mapping ────────────────────────────────────────────

// Maps investor name slugs (e.g. "warren-buffett") to investor_keys (e.g. "berkshire_hathaway")
// Built from config.py manager names
const SLUG_TO_KEY: Record<string, string> = {
  'warren-buffett': 'berkshire_hathaway',
  'ted-weschler': 'berkshire_hathaway',
  'todd-combs': 'berkshire_hathaway',
  'li-lu': 'himalaya_capital',
  'mohnish-pabrai': 'pabrai_funds',
  'seth-klarman': 'baupost_group',
  'chris-hohn': 'tci_fund',
  'john-huber': 'saber_capital',
  'chuck-akre': 'akre_capital',
  'david-tepper': 'appaloosa_management',
  'bill-ackman': 'pershing_square',
  'tom-gayner': 'markel_gayner',
  'cliff-sosin': 'cas_investment',
  'bryan-lawrence': 'oakcliff_capital',
  'francois-rochon': 'giverny_capital',
  'terry-smith': 'fundsmith',
  'christopher-bloomstran': 'semper_augustus',
  'pat-dorsey': 'dorsey_asset',
  'thomas-russo': 'gardner_russo',
  'francis-chou': 'chou_associates',
  'bill-nygren': 'harris_associates',
  'chris-davis': 'davis_advisors',
  'david-poppe': 'ruane_cunniff',
  'arnold-van-den-berg': 'century_management',
  'murray-stahl': 'horizon_kinetics',
  'stephen-mandel': 'lone_pine',
  'prem-watsa': 'fairfax_financial',
  'gavin-baker': 'atreides_management',
  'philippe-laffont': 'coatue_management',
  'norbert-lou': 'punch_card',
  'robert-vinall': 'rv_capital',
  'nick-train': 'lindsell_train',
  'allan-mecham': 'arlington_value',
}

// Reverse map: investor_key -> slug (for building links in changes/best-ideas pages)
const KEY_TO_SLUG: Record<string, string> = {}
Object.keys(SLUG_TO_KEY).forEach(slug => {
  const key = SLUG_TO_KEY[slug]
  // Use the first slug found (primary manager name)
  if (!KEY_TO_SLUG[key]) {
    KEY_TO_SLUG[key] = slug
  }
})

// Key to manager name (for display)
const KEY_TO_MANAGER: Record<string, string> = {
  'berkshire_hathaway': 'Warren Buffett',
  'himalaya_capital': 'Li Lu',
  'pabrai_funds': 'Mohnish Pabrai',
  'baupost_group': 'Seth Klarman',
  'tci_fund': 'Chris Hohn',
  'saber_capital': 'John Huber',
  'akre_capital': 'Chuck Akre',
  'appaloosa_management': 'David Tepper',
  'pershing_square': 'Bill Ackman',
  'markel_gayner': 'Tom Gayner',
  'cas_investment': 'Cliff Sosin',
  'oakcliff_capital': 'Bryan Lawrence',
  'giverny_capital': 'Francois Rochon',
  'fundsmith': 'Terry Smith',
  'semper_augustus': 'Christopher Bloomstran',
  'dorsey_asset': 'Pat Dorsey',
  'gardner_russo': 'Thomas Russo',
  'chou_associates': 'Francis Chou',
  'harris_associates': 'Bill Nygren',
  'davis_advisors': 'Chris Davis',
  'ruane_cunniff': 'David Poppe',
  'century_management': 'Arnold Van Den Berg',
  'horizon_kinetics': 'Murray Stahl',
  'lone_pine': 'Stephen Mandel',
  'fairfax_financial': 'Prem Watsa',
  'atreides_management': 'Gavin Baker',
  'coatue_management': 'Philippe Laffont',
  'punch_card': 'Norbert Lou',
}

// Key to firm name
const KEY_TO_FIRM: Record<string, string> = {
  'berkshire_hathaway': 'Berkshire Hathaway',
  'himalaya_capital': 'Himalaya Capital',
  'pabrai_funds': 'Pabrai Investment Funds',
  'baupost_group': 'Baupost Group',
  'tci_fund': 'TCI Fund Management',
  'saber_capital': 'Saber Capital Management',
  'akre_capital': 'Akre Capital Management',
  'appaloosa_management': 'Appaloosa Management',
  'pershing_square': 'Pershing Square',
  'markel_gayner': 'Markel Group',
  'cas_investment': 'CAS Investment Partners',
  'oakcliff_capital': 'Oakcliff Capital',
  'giverny_capital': 'Giverny Capital',
  'fundsmith': 'Fundsmith',
  'semper_augustus': 'Semper Augustus',
  'dorsey_asset': 'Dorsey Asset Management',
  'gardner_russo': 'Gardner Russo & Quinn',
  'chou_associates': 'Chou Associates',
  'harris_associates': 'Harris Associates (Oakmark)',
  'davis_advisors': 'Davis Selected Advisers',
  'ruane_cunniff': 'Ruane, Cunniff & Goldfarb',
  'century_management': 'Century Management',
  'horizon_kinetics': 'Horizon Kinetics',
  'lone_pine': 'Lone Pine Capital',
  'fairfax_financial': 'Fairfax Financial',
  'atreides_management': 'Atreides Management',
  'coatue_management': 'Coatue Management',
  'punch_card': 'Punch Card Management',
}

// ─── Data Loading ────────────────────────────────────────────────────────────

const OUTPUT_DIR = path.resolve(process.cwd(), 'data', 'output')

function findOutputFile(investorKey: string): string | null {
  try {
    const files = fs.readdirSync(OUTPUT_DIR)
    const match = files.find(f => f.startsWith(investorKey + '_13f_') && f.endsWith('.json'))
    return match ? path.join(OUTPUT_DIR, match) : null
  } catch {
    return null
  }
}

/**
 * Load 13F data for an investor by their page slug.
 */
export function loadInvestorPortfolio(slug: string): InvestorFilingData | null {
  const investorKey = SLUG_TO_KEY[slug]
  if (!investorKey) return null

  const filePath = findOutputFile(investorKey)
  if (!filePath) return null

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    // Skip investors with no current holdings
    if (!raw.top_holdings || raw.top_holdings.length === 0) return null
    return raw as InvestorFilingData
  } catch {
    return null
  }
}

/**
 * Load all investor portfolios (for changes page, best ideas page, etc.)
 */
export function loadAllPortfolios(): InvestorFilingData[] {
  const results: InvestorFilingData[] = []
  try {
    const files = fs.readdirSync(OUTPUT_DIR)
    for (const file of files) {
      if (!file.endsWith('.json') || file.startsWith('summary') || file.startsWith('latest')) continue
      try {
        const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, file), 'utf-8')) as InvestorFilingData
        if (data.top_holdings && data.top_holdings.length > 0) {
          results.push(data)
        }
      } catch {
        // skip malformed files
      }
    }
  } catch {
    // output dir not found
  }
  return results
}

/**
 * Get all position changes across all investors, sorted by value delta.
 */
export interface AggregatedChange {
  investor_key: string
  investor_name: string
  investor_slug: string
  investor_firm: string
  ticker: string
  security_name: string
  change_type: string
  value_delta: number
  share_delta: number
  current_value: number
  previous_value: number
  current_quarter: string
  previous_quarter: string
}

export function getAllChanges(): AggregatedChange[] {
  const portfolios = loadAllPortfolios()
  const changes: AggregatedChange[] = []

  for (const portfolio of portfolios) {
    if (!portfolio.changes?.changes) continue
    const slug = KEY_TO_SLUG[portfolio.investor_key] || portfolio.investor_key
    const name = KEY_TO_MANAGER[portfolio.investor_key] || portfolio.manager || portfolio.name
    const firm = KEY_TO_FIRM[portfolio.investor_key] || portfolio.name

    for (const change of portfolio.changes.changes) {
      if (change.change_type === 'UNCHANGED') continue
      changes.push({
        investor_key: portfolio.investor_key,
        investor_name: name,
        investor_slug: slug,
        investor_firm: firm,
        ticker: change.ticker,
        security_name: change.name_of_issuer,
        change_type: change.change_type,
        value_delta: change.value_delta,
        share_delta: change.share_delta,
        current_value: change.current_value,
        previous_value: change.previous_value,
        current_quarter: portfolio.changes.current_quarter,
        previous_quarter: portfolio.changes.previous_quarter,
      })
    }
  }

  // Sort by absolute value delta descending
  changes.sort((a, b) => Math.abs(b.value_delta) - Math.abs(a.value_delta))
  return changes
}

/**
 * Get best ideas: stocks held by multiple tracked investors.
 */
export interface BestIdeaData {
  ticker: string
  name: string
  holder_count: number
  total_value: number
  avg_weight: number
  holders: { name: string; slug: string; firm: string; weight: number; value: number }[]
}

export function getBestIdeasFromFiles(): BestIdeaData[] {
  const portfolios = loadAllPortfolios()

  // Aggregate by ticker
  const stockMap = new Map<string, {
    name: string
    holders: { name: string; slug: string; firm: string; weight: number; value: number }[]
    totalValue: number
    totalWeight: number
  }>()

  for (const portfolio of portfolios) {
    const slug = KEY_TO_SLUG[portfolio.investor_key] || portfolio.investor_key
    const name = KEY_TO_MANAGER[portfolio.investor_key] || portfolio.manager || portfolio.name
    const firm = KEY_TO_FIRM[portfolio.investor_key] || portfolio.name

    for (const holding of portfolio.top_holdings) {
      // Skip holdings where ticker looks like a CUSIP (no real ticker resolved)
      const ticker = holding.ticker
      if (/^\d{5,}/.test(ticker)) continue

      const existing = stockMap.get(ticker)
      if (existing) {
        existing.holders.push({ name, slug, firm, weight: holding.weight_pct, value: holding.value_thousands })
        existing.totalValue += holding.value_thousands
        existing.totalWeight += holding.weight_pct
      } else {
        stockMap.set(ticker, {
          name: titleCase(holding.name),
          holders: [{ name, slug, firm, weight: holding.weight_pct, value: holding.value_thousands }],
          totalValue: holding.value_thousands,
          totalWeight: holding.weight_pct,
        })
      }
    }
  }

  // Convert to array, filter for 2+ holders, sort
  const results: BestIdeaData[] = []
  stockMap.forEach((data, ticker) => {
    if (data.holders.length < 2) return
    results.push({
      ticker,
      name: data.name,
      holder_count: data.holders.length,
      total_value: data.totalValue,
      avg_weight: data.totalWeight / data.holders.length,
      holders: data.holders.sort((a, b) => b.weight - a.weight),
    })
  })

  results.sort((a, b) => b.holder_count - a.holder_count || b.total_value - a.total_value)
  return results
}

/**
 * Get the list of investor keys that have portfolio data.
 */
export function getInvestorKeysWithData(): string[] {
  const portfolios = loadAllPortfolios()
  return portfolios.map(p => p.investor_key)
}

export function getSlugForKey(key: string): string {
  return KEY_TO_SLUG[key] || key
}

export function getManagerForKey(key: string): string {
  return KEY_TO_MANAGER[key] || key
}

export function getFirmForKey(key: string): string {
  return KEY_TO_FIRM[key] || key
}

// ─── Formatting Helpers ──────────────────────────────────────────────────────

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function formatValueFromThousands(thousands: number): string {
  if (thousands == null) return '--'
  const abs = Math.abs(thousands)
  if (abs >= 1_000_000_000) return `$${(thousands / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `$${(thousands / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(thousands / 1_000).toFixed(1)}K`
  return `$${thousands}`
}

export function formatShares(shares: number): string {
  if (shares == null) return '--'
  const abs = Math.abs(shares)
  const sign = shares > 0 ? '+' : ''
  if (abs >= 1_000_000) return `${sign}${(shares / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}${(shares / 1_000).toFixed(0)}K`
  return `${sign}${shares.toLocaleString()}`
}
