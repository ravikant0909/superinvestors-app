import latestSummary from '../../data/output/latest_summary.json'

interface LatestSummaryPayload {
  investors_processed?: number
  investors_successful?: number
}

const summary = latestSummary as LatestSummaryPayload

export const STATIC_13F_COVERAGE_COUNT =
  summary.investors_successful ?? summary.investors_processed ?? 0
