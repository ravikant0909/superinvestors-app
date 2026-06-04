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
    const fallbackTitle = 'Investor — SuperInvestors'
    const fallbackDescription = 'Investor 13F holdings and track record on SuperInvestors.'
    return {
      title: fallbackTitle,
      description: fallbackDescription,
      openGraph: { title: fallbackTitle, description: fallbackDescription, type: 'profile' },
      twitter: { card: 'summary_large_image', title: fallbackTitle, description: fallbackDescription },
    }
  }

  const title = `${investor.name} — 13F holdings & track record · SuperInvestors`
  const description =
    investor.one_line_summary ||
    `See ${investor.name}'s latest 13F holdings, buys and sells, and conviction picks on SuperInvestors.`

  return {
    title,
    description,
    openGraph: { title, description, type: 'profile' },
    twitter: { card: 'summary_large_image', title, description },
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
