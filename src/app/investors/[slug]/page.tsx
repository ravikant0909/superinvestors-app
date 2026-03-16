import type { Metadata } from 'next'
import InvestorProfileClient from './InvestorProfileClient'
import { STATIC_INVESTOR_META, STATIC_INVESTOR_SLUGS } from '@/lib/static-investors'

export function generateStaticParams() {
  return STATIC_INVESTOR_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const investor = STATIC_INVESTOR_META.get(slug)

  if (!investor) {
    return { title: 'Investor — SuperInvestors' }
  }

  return {
    title: `${investor.name} — SuperInvestors`,
    description: investor.one_line_summary || `${investor.name} investor profile`,
  }
}

export default async function InvestorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <InvestorProfileClient slug={slug} />
}
