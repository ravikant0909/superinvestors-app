/**
 * Portfolio data loading from 13F JSON output files.
 *
 * Reads data at build time from data/output/*.json files.
 * Maps investor slugs (from all_investors_ranked.json) to investor_keys
 * (the underscore-style keys used in 13F filenames).
 */
import fs from 'fs'
import path from 'path'
import { getConvictionLookupKeys } from './conviction-data'

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

export interface FilingHolding {
  ticker: string
  name_of_issuer: string
  cusip: string
  value: number
  shares: number
}

export interface Filing {
  accession_number: string
  filing_date: string
  report_date: string
  investor_key: string
  cik: string
  holdings_count: number
  total_value_thousands: number
  holdings: FilingHolding[]
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
  filings?: Filing[]
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
  'leopold-aschenbrenner': 'situational_awareness',
  // New investors
  'stanley-druckenmiller': 'druckenmiller_duquesne',
  'henry-ellenbogen': 'durable_capital',
  'bill-miller': 'miller_value',
  'wally-weitz': 'weitz_investment',
  'dennis-hong': 'shawspring',
  'andrew-brenton': 'turtle_creek',
  'andreas-halvorsen': 'viking_global',
  'brad-gerstner': 'altimeter_capital',
  'karthik-sarma': 'srs_investment',
  'dan-sundheim': 'd1_capital',
  'marty-whitman': 'third_avenue',
  'howard-marks': 'oaktree_capital',
  'david-einhorn': 'greenlight_capital',
  'jeff-smith': 'starboard_value',
  'chase-coleman': 'tiger_global',
  'dan-loeb': 'third_point',
  'george-soros': 'soros_fund',
  'leigh-goehring-adam-rozencwajg': 'goehring_rozencwajg',
  'leigh-goehring': 'goehring_rozencwajg',
  'adam-rozencwajg': 'goehring_rozencwajg',
  'nelson-peltz': 'trian_fund',
  'paul-singer': 'elliott_investment',
  'larry-robbins': 'glenview_capital',
  'lee-ainslie': 'maverick_capital',
  'michael-burry': 'scion_asset',
  'bruce-berkowitz': 'fairholme_capital',
  'ray-dalio': 'bridgewater',
  'carl-icahn': 'icahn_enterprises',
  'john-paulson': 'paulson_co',
  'sardar-biglari': 'biglari_capital',
  'alex-sacerdote': 'whale_rock',
  'mario-gabelli': 'gamco_investors',
  'kevin-tang': 'tang_capital',
  'samuel-isaly': 'orbimed_advisors',
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
  'situational_awareness': 'Leopold Aschenbrenner',
  'druckenmiller_duquesne': 'Stanley Druckenmiller',
  'durable_capital': 'Henry Ellenbogen',
  'miller_value': 'Bill Miller',
  'weitz_investment': 'Wally Weitz',
  'shawspring': 'Dennis Hong',
  'turtle_creek': 'Andrew Brenton',
  'viking_global': 'Andreas Halvorsen',
  'altimeter_capital': 'Brad Gerstner',
  'srs_investment': 'Karthik Sarma',
  'd1_capital': 'Dan Sundheim',
  'third_avenue': 'Marty Whitman',
  'greenlight_capital': 'David Einhorn',
  'starboard_value': 'Jeff Smith',
  'tiger_global': 'Chase Coleman',
  'third_point': 'Dan Loeb',
  'soros_fund': 'George Soros',
  'goehring_rozencwajg': 'Leigh Goehring & Adam Rozencwajg',
  'trian_fund': 'Nelson Peltz',
  'elliott_investment': 'Paul Singer',
  'glenview_capital': 'Larry Robbins',
  'maverick_capital': 'Lee Ainslie',
  'scion_asset': 'Michael Burry',
  'fairholme_capital': 'Bruce Berkowitz',
  'bridgewater': 'Ray Dalio',
  'icahn_enterprises': 'Carl Icahn',
  'paulson_co': 'John Paulson',
  'biglari_capital': 'Sardar Biglari',
  'whale_rock': 'Alex Sacerdote',
  'gamco_investors': 'Mario Gabelli',
  'tang_capital': 'Kevin Tang',
  'orbimed_advisors': 'Samuel Isaly',
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
const CUSIP_TICKER_MAP_PATH = path.resolve(process.cwd(), 'data', 'cusip_ticker_map.json')

interface CUSIPTickerCacheData {
  cusip_to_ticker?: Record<string, string>
}

let _cachedCusipTickerMap: Record<string, string> | null | undefined = undefined

function loadCusipTickerMap(): Record<string, string> {
  if (_cachedCusipTickerMap !== undefined) {
    return _cachedCusipTickerMap ?? {}
  }

  try {
    const raw = JSON.parse(fs.readFileSync(CUSIP_TICKER_MAP_PATH, 'utf-8')) as CUSIPTickerCacheData
    _cachedCusipTickerMap = raw.cusip_to_ticker ?? {}
  } catch {
    _cachedCusipTickerMap = {}
  }

  return _cachedCusipTickerMap
}

function normalizeTicker(ticker: string, cusip: string): string {
  const mappedTicker = loadCusipTickerMap()[cusip]
  const resolved = (mappedTicker || ticker || '').trim()
  return resolved ? resolved.toUpperCase() : ticker
}

function roundPct(value: number): number {
  return Math.round(value * 100) / 100
}

function aggregateTopHoldings(holdings: Holding[], totalValueThousands: number): Holding[] {
  const byKey = new Map<string, Holding>()

  for (const holding of holdings) {
    const key = holding.cusip || holding.ticker || holding.name
    const normalizedTicker = normalizeTicker(holding.ticker, holding.cusip)
    const existing = byKey.get(key)

    if (existing) {
      existing.value_thousands += holding.value_thousands
      existing.shares += holding.shares
      existing.weight_pct += holding.weight_pct
      if (normalizedTicker) {
        existing.ticker = normalizedTicker
      }
      if (!existing.name && holding.name) {
        existing.name = holding.name
      }
      continue
    }

    byKey.set(key, {
      ...holding,
      ticker: normalizedTicker,
      value_thousands: holding.value_thousands ?? 0,
      shares: holding.shares ?? 0,
      weight_pct: holding.weight_pct ?? 0,
    })
  }

  const aggregated = Array.from(byKey.values()).map((holding) => ({
    ...holding,
    weight_pct:
      totalValueThousands > 0
        ? roundPct((holding.value_thousands / totalValueThousands) * 100)
        : roundPct(holding.weight_pct),
  }))

  aggregated.sort((a, b) => b.weight_pct - a.weight_pct || b.value_thousands - a.value_thousands)
  return aggregated
}

function aggregateFilingHoldings(holdings: FilingHolding[]): FilingHolding[] {
  const byKey = new Map<string, FilingHolding>()

  for (const holding of holdings) {
    const key = holding.cusip || holding.ticker || holding.name_of_issuer
    const normalizedTicker = normalizeTicker(holding.ticker, holding.cusip)
    const existing = byKey.get(key)

    if (existing) {
      existing.value += holding.value
      existing.shares += holding.shares
      if (normalizedTicker) {
        existing.ticker = normalizedTicker
      }
      if (!existing.name_of_issuer && holding.name_of_issuer) {
        existing.name_of_issuer = holding.name_of_issuer
      }
      continue
    }

    byKey.set(key, {
      ...holding,
      ticker: normalizedTicker,
      value: holding.value ?? 0,
      shares: holding.shares ?? 0,
    })
  }

  return Array.from(byKey.values()).sort((a, b) => b.value - a.value)
}

function normalizeChanges(changes: Changes | null): Changes | null {
  if (!changes) return null

  return {
    ...changes,
    changes: (changes.changes ?? []).map((entry) => ({
      ...entry,
      ticker: normalizeTicker(entry.ticker, entry.cusip),
    })),
  }
}

function normalizeInvestorData(raw: InvestorFilingData): InvestorFilingData {
  const topHoldings = aggregateTopHoldings(
    raw.top_holdings ?? [],
    raw.latest_total_value_thousands ?? 0
  )

  const filings = raw.filings?.map((filing) => {
    const holdings = aggregateFilingHoldings(filing.holdings ?? [])
    return {
      ...filing,
      holdings_count: holdings.length,
      holdings,
    }
  })

  return {
    ...raw,
    top_holdings: topHoldings,
    latest_holdings_count: topHoldings.length,
    changes: normalizeChanges(raw.changes),
    filings,
  }
}

function findOutputFile(investorKey: string): string | null {
  try {
    const files = fs.readdirSync(OUTPUT_DIR)
    const matches = files
      .filter(f => f.startsWith(investorKey + '_13f_') && f.endsWith('.json'))
      .sort()
    const match = matches[matches.length - 1]
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
    return normalizeInvestorData(raw as InvestorFilingData)
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
    const latestByKey = new Map<string, string>()

    for (const file of files) {
      if (!file.endsWith('.json') || file.startsWith('summary') || file.startsWith('latest') || file.startsWith('prices')) continue
      const investorKey = file.split('_13f_')[0]
      const existing = latestByKey.get(investorKey)
      if (!existing || file > existing) {
        latestByKey.set(investorKey, file)
      }
    }

    for (const file of Array.from(latestByKey.values()).sort()) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, file), 'utf-8')) as InvestorFilingData
        const data = normalizeInvestorData(raw)
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
  current_shares: number
  previous_shares: number
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
        current_shares: change.current_shares,
        previous_shares: change.previous_shares,
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

export function getKeyForSlug(slug: string): string | null {
  return SLUG_TO_KEY[slug] || null
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

// ─── Investor Scores ────────────────────────────────────────────────────────

export interface InvestorScore {
  combined: number
  verdict: string
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

/**
 * Load investor scores from all_investors_ranked.json.
 * Returns a Map of slug -> { combined, verdict }.
 */
export function loadInvestorScores(): Map<string, InvestorScore> {
  const jsonPath = path.resolve(process.cwd(), 'data', 'investors', 'all_investors_ranked.json')
  const scores = new Map<string, InvestorScore>()
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Array<{
      name: string
      scores: { combined: number }
      verdict: string
    }>
    for (const inv of raw) {
      const slug = generateSlug(inv.name)
      scores.set(slug, { combined: inv.scores.combined, verdict: inv.verdict })
    }
  } catch {
    // file not found or parse error
  }
  return scores
}

// ─── Scored Changes ─────────────────────────────────────────────────────────

export interface ScoredChange extends AggregatedChange {
  combined_score: number
  verdict: string
  weight_impact: number
  importance_score: number
}

/**
 * Get all changes enriched with investor scores, weight impact, and importance.
 * Sorted by importance_score descending.
 *
 * Importance Algorithm:
 * - position_size_score = position value as % of investor's total portfolio (0-1 normalized)
 * - change_magnitude_score = abs(share_delta) / max(previous_shares, 1) for INCREASED/DECREASED; 1.0 for NEW/SOLD_OUT
 * - investor_quality_score = investor combined_score / 10 (0-1 normalized)
 * - importance = (0.4 * position_size_score) + (0.35 * change_magnitude_score) + (0.25 * investor_quality_score)
 *
 * This weights: How big is the position? (40%), How big was the change? (35%), How good is the investor? (25%)
 */
export function getScoredChanges(): ScoredChange[] {
  const changes = getAllChanges()
  const scores = loadInvestorScores()
  const portfolios = loadAllPortfolios()

  // Build a map of investor_key -> total portfolio value
  const portfolioValues = new Map<string, number>()
  for (const p of portfolios) {
    portfolioValues.set(p.investor_key, p.latest_total_value_thousands)
  }

  const scored: ScoredChange[] = []

  for (const change of changes) {
    const slug = change.investor_slug
    const investorScore = scores.get(slug)
    const combinedScore = investorScore?.combined ?? 0
    const verdict = investorScore?.verdict ?? 'SKIP'
    const totalValue = portfolioValues.get(change.investor_key) || 1
    const weightImpact = Math.abs(change.current_value) / totalValue

    // position_size_score: current position value as fraction of total portfolio (0-1)
    const positionSizeScore = Math.min(weightImpact, 1)

    // change_magnitude_score: for NEW/SOLD_OUT = 1.0, otherwise abs(share_delta) / max(previous_shares, 1)
    let changeMagnitudeScore: number
    if (change.change_type === 'NEW' || change.change_type === 'SOLD_OUT') {
      changeMagnitudeScore = 1.0
    } else {
      changeMagnitudeScore = Math.min(
        Math.abs(change.share_delta) / Math.max(change.previous_shares, 1),
        1.0
      )
    }

    // investor_quality_score: combined_score / 10 (0-1)
    const investorQualityScore = combinedScore / 10

    const importanceScore = (0.4 * positionSizeScore) + (0.35 * changeMagnitudeScore) + (0.25 * investorQualityScore)

    scored.push({
      ...change,
      combined_score: combinedScore,
      verdict,
      weight_impact: weightImpact,
      importance_score: importanceScore,
    })
  }

  scored.sort((a, b) => b.importance_score - a.importance_score)
  return scored
}

// ─── Price Data ──────────────────────────────────────────────────────────────

export interface CurrentPriceData {
  price: number
  prev_close: number
}

export interface QuarterRangeData {
  min: number
  max: number
  avg: number
}

export interface AllPrices {
  fetched_at: string
  current_prices: Record<string, CurrentPriceData>
  quarter_ranges: Record<string, Record<string, QuarterRangeData>>
}

let _cachedPrices: AllPrices | null | undefined = undefined

export function loadPrices(): AllPrices | null {
  if (_cachedPrices !== undefined) return _cachedPrices
  try {
    const pricesPath = path.resolve(process.cwd(), 'data', 'output', 'prices.json')
    const data = JSON.parse(fs.readFileSync(pricesPath, 'utf-8'))
    _cachedPrices = data as AllPrices
    return _cachedPrices
  } catch {
    _cachedPrices = null
    return null
  }
}

export function getCurrentPrice(ticker: string): CurrentPriceData | null {
  const prices = loadPrices()
  if (!prices) return null
  return prices.current_prices[ticker] || null
}

export function getQuarterPriceRange(ticker: string, quarter: string): QuarterRangeData | null {
  const prices = loadPrices()
  if (!prices) return null
  return prices.quarter_ranges[quarter]?.[ticker] || null
}

// ─── Portfolio Adjustments (Non-US Holdings) ────────────────────────────────

export interface NonUsPosition {
  company: string
  country: string
  estimated_value_millions: number
}

export interface PortfolioAdjustment {
  estimated_total_aum_millions: number
  us_13f_value_millions: number
  non_us_pct_estimate: number
  non_us_notes: string
  known_non_us_positions: NonUsPosition[]
  confidence: string
  sources: string[]
  last_updated: string
}

let _cachedAdjustments: Record<string, PortfolioAdjustment> | null | undefined = undefined

export function loadPortfolioAdjustments(): Record<string, PortfolioAdjustment> {
  if (_cachedAdjustments !== undefined && _cachedAdjustments !== null) return _cachedAdjustments
  try {
    const adjPath = path.resolve(process.cwd(), 'data', 'investors', 'portfolio_adjustments.json')
    const data = JSON.parse(fs.readFileSync(adjPath, 'utf-8'))
    _cachedAdjustments = data as Record<string, PortfolioAdjustment>
    return _cachedAdjustments
  } catch {
    _cachedAdjustments = {}
    return {}
  }
}

export function getAdjustedWeight(
  investorKey: string,
  usPct: number
): { adjusted_pct: number | null; has_adjustment: boolean; confidence: string | null } {
  const adjustments = loadPortfolioAdjustments()
  const adj = adjustments[investorKey]
  if (!adj || adj.non_us_pct_estimate === 0) {
    return { adjusted_pct: null, has_adjustment: false, confidence: null }
  }

  // If non-US percentage is significant, adjust the weight
  // The 13F weight represents the position's share of the US-listed portfolio.
  // The adjusted weight estimates the position's share of the TOTAL portfolio.
  // adjusted_pct = usPct * (1 - non_us_pct_estimate / 100)
  const usPortfolioFraction = 1 - adj.non_us_pct_estimate / 100
  const adjustedPct = usPct * usPortfolioFraction

  return {
    adjusted_pct: Math.round(adjustedPct * 10) / 10,
    has_adjustment: true,
    confidence: adj.confidence,
  }
}

export function getPortfolioAdjustment(investorKey: string): PortfolioAdjustment | null {
  const adjustments = loadPortfolioAdjustments()
  return adjustments[investorKey] || null
}

// ─── Historical Position Data ────────────────────────────────────────────────

export interface HistoricalPositionEntry {
  quarter: string
  shares: number
  value_thousands: number
  weight_pct: number
}

/**
 * Extract historical position data for all changed positions across all investors.
 * Returns a map of "investor_key:ticker" -> array of quarter snapshots.
 */
export function getHistoricalPositions(): Record<string, HistoricalPositionEntry[]> {
  const portfolios = loadAllPortfolios()
  const result: Record<string, HistoricalPositionEntry[]> = {}

  for (const portfolio of portfolios) {
    if (!portfolio.filings || portfolio.filings.length === 0) continue

    for (const filing of portfolio.filings) {
      const reportDate = filing.report_date
      const quarter = reportDateToQuarter(reportDate)
      const totalValue = filing.total_value_thousands

      for (const holding of filing.holdings) {
        const key = `${portfolio.investor_key}:${holding.ticker}`
        if (!result[key]) result[key] = []

        const weightPct = totalValue > 0 ? (holding.value / totalValue) * 100 : 0
        result[key].push({
          quarter,
          shares: holding.shares,
          value_thousands: holding.value,
          weight_pct: Math.round(weightPct * 100) / 100,
        })
      }
    }

    // Deduplicate and sort by quarter for each key
    for (const key of Object.keys(result)) {
      if (!key.startsWith(portfolio.investor_key + ':')) continue
      const entries = result[key]
      const seen = new Map<string, HistoricalPositionEntry>()
      for (const entry of entries) {
        // Keep the latest entry for each quarter
        seen.set(entry.quarter, entry)
      }
      result[key] = Array.from(seen.values()).sort((a, b) => a.quarter.localeCompare(b.quarter))
    }
  }

  return result
}

function reportDateToQuarter(reportDate: string): string {
  const date = new Date(reportDate)
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  if (month <= 3) return `${year}-Q1`
  if (month <= 6) return `${year}-Q2`
  if (month <= 9) return `${year}-Q3`
  return `${year}-Q4`
}

// ─── Conviction Data Availability ────────────────────────────────────────────

/**
 * Get the set of available conviction analysis slugs (investor-slug_ticker format).
 * Used to determine if a "View Conviction Analysis" link should be shown.
 */
export function getConvictionSlugs(): Set<string> {
  return getConvictionLookupKeys()
}

// ─── Track Record ────────────────────────────────────────────────────────────

export interface TimelineEntry {
  quarter: string
  shares: number
  value_thousands: number
  weight_pct: number
  action: 'NEW' | 'INCREASED' | 'DECREASED' | 'HELD' | 'SOLD_OUT'
  share_delta: number
  value_delta: number
  estimated_price: number | null        // avg price per share that quarter (from prices.json or value/shares)
  estimated_tx_cost: number | null      // share_delta × estimated_price (cost of this transaction)
  quarter_price_range: QuarterRangeData | null  // min/max/avg from prices.json if available
}

export interface InvestmentRecord {
  ticker: string
  company_name: string
  first_seen_quarter: string
  last_seen_quarter: string
  is_current: boolean
  peak_weight_pct: number
  peak_value_thousands: number
  current_weight_pct: number | null
  current_value_thousands: number | null
  timeline: TimelineEntry[]
  estimated_entry_price: number | null
  weighted_avg_entry_price: number | null  // weighted by shares bought at each quarter's price
  current_price: number | null
  exit_price: number | null               // estimated price when exited (for sold positions)
  price_return_pct: number | null
  holding_period_quarters: number
  annualized_return_pct: number | null
}

interface RawFiling {
  report_date: string
  filing_date: string
  holdings_count: number
  total_value_thousands: number
  holdings: FilingHolding[]
}

function loadRawFilingData(investorKey: string): { filings: RawFiling[]; name: string } | null {
  const filePath = findOutputFile(investorKey)
  if (!filePath) return null
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    const normalized = normalizeInvestorData(raw as InvestorFilingData)
    if (!normalized.filings || normalized.filings.length === 0) return null
    return { filings: normalized.filings as RawFiling[], name: normalized.name || investorKey }
  } catch {
    return null
  }
}

export function getInvestorTrackRecord(slug: string): InvestmentRecord[] {
  const investorKey = SLUG_TO_KEY[slug]
  if (!investorKey) return []

  const rawData = loadRawFilingData(investorKey)
  if (!rawData) return []

  const { filings } = rawData

  // Sort filings chronologically (oldest first)
  const sortedFilings = [...filings].sort(
    (a, b) => new Date(a.report_date).getTime() - new Date(b.report_date).getTime()
  )

  // Deduplicate filings by quarter (keep the latest filing_date per quarter)
  const quarterMap = new Map<string, RawFiling>()
  for (const filing of sortedFilings) {
    const quarter = reportDateToQuarter(filing.report_date)
    const existing = quarterMap.get(quarter)
    if (!existing || new Date(filing.filing_date) > new Date(existing.filing_date)) {
      quarterMap.set(quarter, filing)
    }
  }
  const uniqueFilings = Array.from(quarterMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, filing]) => ({ quarter, filing }))

  if (uniqueFilings.length === 0) return []

  const latestQuarter = uniqueFilings[uniqueFilings.length - 1].quarter

  // Track each ticker across quarters using CUSIP as the stable identifier
  const positionsByCusip = new Map<string, {
    ticker: string
    company_name: string
    quarters: Map<string, { shares: number; value: number; weight_pct: number }>
  }>()

  for (const { quarter, filing } of uniqueFilings) {
    const totalValue = filing.total_value_thousands || 1
    for (const holding of filing.holdings) {
      const cusip = holding.cusip
      let position = positionsByCusip.get(cusip)
      if (!position) {
        position = {
          ticker: holding.ticker,
          company_name: titleCase(holding.name_of_issuer),
          quarters: new Map(),
        }
        positionsByCusip.set(cusip, position)
      }
      if (!/^\d{5,}/.test(holding.ticker)) {
        position.ticker = holding.ticker
      }
      const weight = (holding.value / totalValue) * 100
      position.quarters.set(quarter, {
        shares: holding.shares,
        value: holding.value,
        weight_pct: Math.round(weight * 100) / 100,
      })
    }
  }

  const allQuarters = uniqueFilings.map(f => f.quarter)
  const prices = loadPrices()

  const records: InvestmentRecord[] = []

  for (const position of Array.from(positionsByCusip.values())) {
    const { ticker, company_name, quarters } = position

    const timeline: TimelineEntry[] = []
    let prevShares = 0
    let prevValue = 0
    let firstQuarter = ''
    let lastQuarter = ''
    let peakWeight = 0
    let peakValue = 0

    for (const quarter of allQuarters) {
      const data = quarters.get(quarter)
      if (!data && prevShares === 0) continue

      // Get quarter price data if available
      const qpr = prices?.quarter_ranges[quarter]?.[ticker] || null

      if (data) {
        if (!firstQuarter) firstQuarter = quarter
        lastQuarter = quarter

        const shareDelta = data.shares - prevShares
        const valueDelta = data.value - prevValue
        let action: 'NEW' | 'INCREASED' | 'DECREASED' | 'HELD' | 'SOLD_OUT'
        if (prevShares === 0) {
          action = 'NEW'
        } else if (shareDelta > 0) {
          action = 'INCREASED'
        } else if (shareDelta < 0) {
          action = 'DECREASED'
        } else {
          action = 'HELD'
        }

        // Estimate per-share price: prefer quarter range avg, fallback to value/shares
        // Values are in thousands, so multiply by 1000 to get dollars
        const estimatedPrice = qpr
          ? qpr.avg
          : (data.shares > 0 ? (data.value * 1000) / data.shares : null)
        const estimatedTxCost = (estimatedPrice && shareDelta !== 0)
          ? Math.abs(shareDelta) * estimatedPrice
          : null

        timeline.push({
          quarter,
          shares: data.shares,
          value_thousands: data.value,
          weight_pct: data.weight_pct,
          action,
          share_delta: shareDelta,
          value_delta: valueDelta,
          estimated_price: estimatedPrice,
          estimated_tx_cost: estimatedTxCost,
          quarter_price_range: qpr,
        })

        if (data.weight_pct > peakWeight) peakWeight = data.weight_pct
        if (data.value > peakValue) peakValue = data.value

        prevShares = data.shares
        prevValue = data.value
      } else if (prevShares > 0) {
        lastQuarter = quarter
        timeline.push({
          quarter,
          shares: 0,
          value_thousands: 0,
          weight_pct: 0,
          action: 'SOLD_OUT',
          share_delta: -prevShares,
          value_delta: -prevValue,
          estimated_price: qpr ? qpr.avg : null,
          estimated_tx_cost: null,
          quarter_price_range: qpr,
        })
        prevShares = 0
        prevValue = 0
      }
    }

    if (timeline.length === 0) continue

    const isCurrent = quarters.has(latestQuarter)
    const latestData = quarters.get(latestQuarter)

    // Simple entry price: first quarter's avg price from prices.json
    let estimatedEntryPrice: number | null = null
    if (prices?.quarter_ranges[firstQuarter]?.[ticker]) {
      estimatedEntryPrice = prices.quarter_ranges[firstQuarter][ticker].avg
    }

    // Weighted avg entry price: weighted by shares added at each buy quarter
    let weightedAvgEntryPrice: number | null = null
    {
      let totalSharesBought = 0
      let totalCostEstimate = 0
      for (const t of timeline) {
        if ((t.action === 'NEW' || t.action === 'INCREASED') && t.share_delta > 0 && t.estimated_price) {
          totalSharesBought += t.share_delta
          totalCostEstimate += t.share_delta * t.estimated_price
        }
      }
      if (totalSharesBought > 0) {
        weightedAvgEntryPrice = totalCostEstimate / totalSharesBought
      }
    }

    // Use weighted avg if available, fallback to simple entry
    const effectiveEntryPrice = weightedAvgEntryPrice ?? estimatedEntryPrice

    let currentPrice: number | null = null
    if (prices?.current_prices[ticker]) {
      currentPrice = prices.current_prices[ticker].price
    }

    // Exit price for sold positions
    let exitPriceEstimate: number | null = null
    if (!isCurrent && timeline.length >= 2) {
      const lastHeld = timeline.filter(t => t.shares > 0)
      if (lastHeld.length > 0) {
        const last = lastHeld[lastHeld.length - 1]
        if (last.shares > 0) {
          // Values are in thousands, multiply by 1000 for dollars
          exitPriceEstimate = (last.value_thousands * 1000) / last.shares
        }
      }
    }

    let priceReturnPct: number | null = null
    let annualizedReturnPct: number | null = null
    const holdingPeriodQuarters = timeline.length

    if (effectiveEntryPrice && effectiveEntryPrice > 0) {
      const comparePrice = isCurrent ? currentPrice : exitPriceEstimate

      if (comparePrice && comparePrice > 0) {
        priceReturnPct = ((comparePrice - effectiveEntryPrice) / effectiveEntryPrice) * 100
        if (holdingPeriodQuarters > 0) {
          const totalReturn = comparePrice / effectiveEntryPrice
          if (totalReturn > 0) {
            annualizedReturnPct = (Math.pow(totalReturn, 4 / holdingPeriodQuarters) - 1) * 100
          }
        }
      }
    }

    records.push({
      ticker,
      company_name,
      first_seen_quarter: firstQuarter,
      last_seen_quarter: lastQuarter,
      is_current: isCurrent,
      peak_weight_pct: Math.round(peakWeight * 100) / 100,
      peak_value_thousands: peakValue,
      current_weight_pct: latestData ? latestData.weight_pct : null,
      current_value_thousands: latestData ? latestData.value : null,
      timeline,
      estimated_entry_price: estimatedEntryPrice,
      weighted_avg_entry_price: weightedAvgEntryPrice != null ? Math.round(weightedAvgEntryPrice * 100) / 100 : null,
      current_price: currentPrice,
      exit_price: exitPriceEstimate != null ? Math.round(exitPriceEstimate * 100) / 100 : null,
      price_return_pct: priceReturnPct != null ? Math.round(priceReturnPct * 100) / 100 : null,
      holding_period_quarters: holdingPeriodQuarters,
      annualized_return_pct: annualizedReturnPct != null ? Math.round(annualizedReturnPct * 100) / 100 : null,
    })
  }

  records.sort((a, b) => {
    if (a.is_current && !b.is_current) return -1
    if (!a.is_current && b.is_current) return 1
    if (a.is_current && b.is_current) {
      return (b.current_value_thousands ?? 0) - (a.current_value_thousands ?? 0)
    }
    return b.peak_value_thousands - a.peak_value_thousands
  })

  return records
}
