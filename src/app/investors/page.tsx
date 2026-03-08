import fs from 'fs'
import path from 'path'
import InvestorsClient from './InvestorsClient'

export const metadata = {
  title: 'All Investors — SuperInvestors',
  description: 'Browse and filter all 145 tracked super investors ranked by combined score.',
}

interface RawInvestor {
  name: string
  firm: string
  background: string
  investment_philosophy: string
  portfolio_style: string
  track_record: string
  transparency: string
  integrity: string
  notable_holdings: string
  relevance_to_us: string
  scores: {
    philosophy_alignment: number
    concentration: number
    rationality: number
    integrity: number
    track_record: number
    transparency: number
    relevance: number
    agi_awareness: number
    combined: number
  }
  verdict: string
  one_line_summary: string
  group_id: string
  group_theme: string
}

export interface InvestorCard {
  name: string
  firm: string
  combined: number
  verdict: string
  one_line_summary: string
  slug: string
  scores: {
    philosophy_alignment: number
    concentration: number
    rationality: number
    integrity: number
    track_record: number
    transparency: number
    relevance: number
    agi_awareness: number
  }
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export default function InvestorsPage() {
  const jsonPath = path.resolve(
    process.cwd(),
    'data',
    'investors',
    'all_investors_ranked.json'
  )
  const raw: RawInvestor[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))

  const investors: InvestorCard[] = raw.map((inv) => ({
    name: inv.name,
    firm: inv.firm,
    combined: inv.scores.combined,
    verdict: inv.verdict,
    one_line_summary: inv.one_line_summary,
    slug: generateSlug(inv.name),
    scores: {
      philosophy_alignment: inv.scores.philosophy_alignment,
      concentration: inv.scores.concentration,
      rationality: inv.scores.rationality,
      integrity: inv.scores.integrity,
      track_record: inv.scores.track_record,
      transparency: inv.scores.transparency,
      relevance: inv.scores.relevance,
      agi_awareness: inv.scores.agi_awareness,
    },
  }))

  return <InvestorsClient investors={investors} />
}
