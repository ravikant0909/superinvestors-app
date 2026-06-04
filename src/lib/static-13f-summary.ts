// Committed (not under the Drive-symlinked, gitignored data/output) so a clean checkout
// builds without first running the Python pipeline. Refreshed by run_pipeline.py.
import latestSummary from '../../data/static-summary.json'

interface LatestSummaryPayload {
  investors_processed?: number
  investors_successful?: number
}

const summary = latestSummary as LatestSummaryPayload

export const STATIC_13F_COVERAGE_COUNT =
  summary.investors_successful ?? summary.investors_processed ?? 0
