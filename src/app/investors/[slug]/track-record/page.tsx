import type { Metadata } from 'next'
import TrackRecordClient from './TrackRecordClient'
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
    return { title: 'Track Record — SuperInvestors' }
  }

  return {
    title: `${investor.name} Track Record — SuperInvestors`,
    description: `Investment history and track record for ${investor.name}`,
  }
}

export default async function TrackRecordPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <TrackRecordClient slug={slug} />
}
