import allInvestors from '../../data/investors/all_investors_ranked.json'

interface StaticInvestorRecord {
  name: string
  one_line_summary?: string
}

const INVESTORS = allInvestors as StaticInvestorRecord[]

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
