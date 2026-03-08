import fs from 'fs'
import path from 'path'
import ConvictionsClient from './ConvictionsClient'

export const metadata = {
  title: 'Conviction Bets — SuperInvestors',
  description: 'Deep-dive analyses of positions where legendary investors have >10% of their portfolio in a single stock.',
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConvictionBet {
  investor_slug: string
  investor_name: string
  firm_name: string
  ticker: string
  company_name: string
  weight_pct: number
  value_millions: number
  thesis_headline: string
  slug: string
}

// ─── Data Loading ─────────────────────────────────────────────────────────────

function loadConvictionBets(): ConvictionBet[] {
  const dataDir = path.resolve(process.cwd(), 'conviction_data')

  if (!fs.existsSync(dataDir)) {
    return []
  }

  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json') && f !== 'index.json')
  const bets: ConvictionBet[] = []

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'))
      bets.push({
        investor_slug: raw.investor_slug || '',
        investor_name: raw.investor_name || 'Unknown',
        firm_name: raw.firm_name || '',
        ticker: raw.ticker || '',
        company_name: raw.company_name || '',
        weight_pct: raw.weight_pct || 0,
        value_millions: raw.value_millions || 0,
        thesis_headline: raw.thesis_headline || '',
        slug: `${raw.investor_slug}-${raw.ticker}`,
      })
    } catch {
      // Skip malformed files
    }
  }

  // Sort by weight descending (highest conviction first)
  bets.sort((a, b) => b.weight_pct - a.weight_pct)
  return bets
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function ConvictionsPage() {
  const bets = loadConvictionBets()

  // Get unique investor names for filter
  const investors = Array.from(new Set(bets.map((b) => b.investor_name))).sort()

  return <ConvictionsClient bets={bets} investors={investors} />
}
