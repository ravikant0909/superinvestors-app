import HomeClient from './HomeClient'
import { STATIC_13F_COVERAGE_COUNT } from '@/lib/static-13f-summary'
import { STATIC_INVESTOR_SLUGS } from '@/lib/static-investors'

export default function HomePage() {
  return (
    <HomeClient
      initialTrackedInvestorCount={STATIC_INVESTOR_SLUGS.length}
      initial13fCoverageCount={STATIC_13F_COVERAGE_COUNT}
    />
  )
}
