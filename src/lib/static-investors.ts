import allInvestors from '../../data/investors/all_investors_ranked.json'

interface StaticInvestorRecord {
  name: string
  one_line_summary?: string
  verdict?: string
}

const INVESTORS = allInvestors as StaticInvestorRecord[]

// Verdict counts computed from the roster at build time, so /about always
// matches the real roster instead of hardcoded (and stale) numbers.
export const VERDICT_COUNTS: Record<string, number> = INVESTORS.reduce(
  (acc, investor) => {
    const verdict = (investor.verdict ?? '').toUpperCase()
    if (verdict) acc[verdict] = (acc[verdict] ?? 0) + 1
    return acc
  },
  {} as Record<string, number>,
)

export const TOTAL_INVESTORS = INVESTORS.length

export function generateInvestorSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export const STATIC_INVESTORS = INVESTORS.map((investor) => ({
  ...investor,
  slug: generateInvestorSlug(investor.name),
}))

export const STATIC_INVESTOR_SLUGS = STATIC_INVESTORS.map((investor) => investor.slug)

export const STATIC_INVESTOR_META = new Map(
  STATIC_INVESTORS.map((investor) => [
    investor.slug,
    {
      name: investor.name,
      one_line_summary: investor.one_line_summary ?? '',
    },
  ]),
)
