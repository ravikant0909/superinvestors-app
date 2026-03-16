/**
 * Server-side SVG pie chart showing portfolio allocation.
 * Top 10 positions individually labeled, rest grouped as "Other".
 */

interface Holding {
  ticker: string
  weight_pct: number
}

// Professional color palette for pie slices
const COLORS = [
  '#6366f1', // indigo (primary)
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#94a3b8', // slate (for "Other")
]

interface PieChartProps {
  holdings: Holding[]
  size?: number
}

export function AllocationPieChart({ holdings, size = 320 }: PieChartProps) {
  if (!holdings || holdings.length === 0) return null

  // Take top 10, group remaining as "Other"
  const top = holdings.slice(0, 10)
  const rest = holdings.slice(10)
  const restWeight = rest.reduce((sum, h) => sum + h.weight_pct, 0)

  const slices: { label: string; weight: number; color: string }[] = top.map((h, i) => ({
    label: `${h.ticker} (${h.weight_pct.toFixed(1)}%)`,
    weight: h.weight_pct,
    color: COLORS[i],
  }))

  if (restWeight > 0) {
    slices.push({
      label: `Other (${restWeight.toFixed(1)}%)`,
      weight: restWeight,
      color: COLORS[10],
    })
  }

  const totalWeight = slices.reduce((sum, s) => sum + s.weight, 0)
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 10

  // Build SVG path data for each slice
  let currentAngle = -Math.PI / 2 // start at top

  const paths: { d: string; color: string; labelX: number; labelY: number; label: string }[] = []

  for (const slice of slices) {
    const fraction = slice.weight / totalWeight
    const angle = fraction * 2 * Math.PI

    // Skip very tiny slices
    if (fraction < 0.001) continue

    const startX = cx + radius * Math.cos(currentAngle)
    const startY = cy + radius * Math.sin(currentAngle)
    const endAngle = currentAngle + angle
    const endX = cx + radius * Math.cos(endAngle)
    const endY = cy + radius * Math.sin(endAngle)

    const largeArc = angle > Math.PI ? 1 : 0

    const d = [
      `M ${cx} ${cy}`,
      `L ${startX} ${startY}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`,
      'Z',
    ].join(' ')

    // Label position: midpoint of the arc, pushed outward
    const midAngle = currentAngle + angle / 2
    const labelRadius = radius * 0.65
    const labelX = cx + labelRadius * Math.cos(midAngle)
    const labelY = cy + labelRadius * Math.sin(midAngle)

    paths.push({ d, color: slice.color, labelX, labelY, label: slice.label })
    currentAngle = endAngle
  }

  // Legend height calculation
  const legendItemHeight = 20
  const legendPadding = 16
  const legendHeight = slices.length * legendItemHeight + legendPadding
  const totalHeight = size + legendHeight + 20

  return (
    <svg
      viewBox={`0 0 ${size} ${totalHeight}`}
      className="w-full max-w-[320px]"
      role="img"
      aria-label="Portfolio allocation pie chart"
    >
      {/* Pie slices */}
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} stroke="white" strokeWidth="2" />
      ))}

      {/* Center circle (donut hole) */}
      <circle cx={cx} cy={cy} r={radius * 0.35} fill="white" />

      {/* Legend below the chart */}
      <g transform={`translate(8, ${size + 12})`}>
        {slices.map((slice, i) => (
          <g key={i} transform={`translate(0, ${i * legendItemHeight})`}>
            <rect x="0" y="0" width="12" height="12" rx="2" fill={slice.color} />
            <text x="18" y="10" fontSize="11" fill="#374151" fontFamily="system-ui, sans-serif">
              {slice.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}
