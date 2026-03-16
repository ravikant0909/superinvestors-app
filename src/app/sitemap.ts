import type { MetadataRoute } from 'next'
import { CONVICTION_PAGE_SLUGS } from '@/lib/conviction-index'
import { STATIC_INVESTOR_SLUGS } from '@/lib/static-investors'

const SITE_URL = 'https://superinvestors-app.pages.dev'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const staticRoutes = ['/', '/about', '/investors', '/changes', '/best-ideas', '/convictions']
  const investorSlugs = STATIC_INVESTOR_SLUGS
  const convictionSlugs = CONVICTION_PAGE_SLUGS

  return [
    ...staticRoutes.map((route) => ({
      url: `${SITE_URL}${route}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: route === '/' ? 1 : 0.8,
    })),
    ...investorSlugs.flatMap((slug) => ([
      {
        url: `${SITE_URL}/investors/${slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      },
      {
        url: `${SITE_URL}/investors/${slug}/track-record`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      },
    ])),
    ...convictionSlugs.map((slug) => ({
      url: `${SITE_URL}/convictions/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]
}
