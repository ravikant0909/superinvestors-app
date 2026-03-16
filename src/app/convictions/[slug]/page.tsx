import type { Metadata } from 'next'
import ConvictionDetailClient from './ConvictionDetailClient'
import { CONVICTION_PAGE_SLUGS, CONVICTION_SUMMARY_BY_SLUG } from '@/lib/conviction-index'

export function generateStaticParams() {
  return CONVICTION_PAGE_SLUGS.map((slug) => ({
    slug,
  }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const summary = CONVICTION_SUMMARY_BY_SLUG.get(slug)

  if (!summary) {
    return { title: 'Conviction Bet — SuperInvestors' }
  }

  return {
    title: `${summary.investor_name} × ${summary.ticker} — Conviction Bet`,
    description: summary.thesis_headline || `Conviction thesis for ${summary.company_name}`,
  }
}

export default async function ConvictionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <ConvictionDetailClient slug={slug} />
}
