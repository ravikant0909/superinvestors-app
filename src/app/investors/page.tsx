import InvestorsClient from './InvestorsClient'
import { STATIC_13F_COVERAGE_COUNT } from '@/lib/static-13f-summary'
import { STATIC_INVESTOR_SLUGS } from '@/lib/static-investors'

export const metadata = {
  title: 'All Investors — SuperInvestors',
  description: 'Browse and filter the full tracked investor roster ranked by combined score.',
}

export default function InvestorsPage() {
  return (
    <InvestorsClient
      initialTrackedCount={STATIC_INVESTOR_SLUGS.length}
      initialCoverageCount={STATIC_13F_COVERAGE_COUNT}
    />
  )
}
