import spxData from '../../data/spx_quarter_closes.json'

interface SpxData {
  latest: number
  latest_asof: string
  quarters: Record<string, number>
}

const SPX = spxData as SpxData

export const SPX_ASOF = SPX.latest_asof
export const SPX_LATEST = SPX.latest

export function spxClose(quarter: string): number | null {
  return SPX.quarters[quarter] ?? null
}

// Annualized S&P return between the close of `startQuarter` and `endClose`
// (use SPX_LATEST for still-held positions, or the exit quarter's close for exits),
// over `years`.
export function spxAnnualized(startQuarter: string, endClose: number | null, years: number): number | null {
  const start = SPX.quarters[startQuarter]
  if (!start || !endClose || years <= 0) return null
  return (Math.pow(endClose / start, 1 / years) - 1) * 100
}
