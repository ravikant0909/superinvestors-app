'use client'

export interface WaterfallStep {
  label: string
  value: string
  note?: string
}

interface ValuationWaterfallProps {
  steps: WaterfallStep[]
  targetPrice?: string
  currentPrice?: string
  impliedReturn?: string
  timeHorizon?: string
}

// Parse a value string to a number for bar sizing
function parseValue(val: string): number | null {
  if (!val) return null
  const cleaned = val.replace(/[^0-9.\-]/g, '')
  const num = parseFloat(cleaned)
  if (isNaN(num)) return null

  // Detect multiplier
  const lower = val.toLowerCase()
  if (lower.includes('t')) return num * 1_000_000
  if (lower.includes('b')) return num * 1_000
  if (lower.includes('m')) return num
  if (lower.includes('k')) return num / 1_000
  if (lower.includes('%')) return num
  if (lower.includes('x')) return num
  return num
}

// Determine step type from label for coloring
function getStepType(label: string, index: number, total: number): 'input' | 'calc' | 'result' {
  if (index === total - 1) return 'result'
  const lower = label.toLowerCase()
  if (
    lower.includes('revenue') ||
    lower.includes('margin') ||
    lower.includes('rate') ||
    lower.includes('multiple') ||
    lower.includes('p/e') ||
    lower.includes('shares') ||
    lower.includes('growth')
  ) {
    return 'input'
  }
  return 'calc'
}

const COLORS = {
  input: { bar: '#6366f1', text: '#4f46e5', bg: '#eef2ff' },
  calc: { bar: '#94a3b8', text: '#475569', bg: '#f1f5f9' },
  result: { bar: '#22c55e', text: '#15803d', bg: '#f0fdf4' },
}

export default function ValuationWaterfall({
  steps,
  targetPrice,
  currentPrice,
  impliedReturn,
  timeHorizon,
}: ValuationWaterfallProps) {
  if (!steps || steps.length === 0) return null

  const barHeight = 40
  const gap = 8
  const labelWidth = 160
  const valueWidth = 100
  const noteWidth = 220
  const maxBarWidth = 200
  const leftPad = 10
  const rightPad = 10

  // Calculate bar widths proportionally
  const numericValues = steps.map((s) => parseValue(s.value))
  const maxVal = Math.max(...numericValues.filter((v): v is number => v !== null && v > 0), 1)

  const totalHeight =
    steps.length * (barHeight + gap) + (targetPrice || currentPrice ? 80 : 0) + 20
  const totalWidth = leftPad + labelWidth + maxBarWidth + valueWidth + noteWidth + rightPad

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      className="max-w-3xl"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
    >
      {steps.map((step, i) => {
        const y = i * (barHeight + gap) + 10
        const numVal = numericValues[i]
        const barWidth =
          numVal !== null && numVal > 0
            ? Math.max((numVal / maxVal) * maxBarWidth, 20)
            : maxBarWidth * 0.3
        const type = getStepType(step.label, i, steps.length)
        const colors = COLORS[type]

        return (
          <g key={i}>
            {/* Label */}
            <text
              x={leftPad + labelWidth - 8}
              y={y + barHeight / 2}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={12}
              fontWeight="600"
              fill="#374151"
            >
              {step.label}
            </text>

            {/* Bar background */}
            <rect
              x={leftPad + labelWidth}
              y={y + 4}
              width={barWidth}
              height={barHeight - 8}
              rx={4}
              fill={colors.bg}
              stroke={colors.bar}
              strokeWidth={1.5}
            />

            {/* Bar fill */}
            <rect
              x={leftPad + labelWidth}
              y={y + 4}
              width={barWidth}
              height={barHeight - 8}
              rx={4}
              fill={colors.bar}
              opacity={0.15}
            />

            {/* Value text */}
            <text
              x={leftPad + labelWidth + barWidth + 8}
              y={y + barHeight / 2}
              dominantBaseline="central"
              fontSize={13}
              fontWeight="700"
              fill={colors.text}
            >
              {step.value}
            </text>

            {/* Note text */}
            {step.note && (
              <text
                x={leftPad + labelWidth + maxBarWidth + valueWidth}
                y={y + barHeight / 2}
                dominantBaseline="central"
                fontSize={11}
                fill="#9ca3af"
              >
                {step.note}
              </text>
            )}

            {/* Connector line to next bar */}
            {i < steps.length - 1 && (
              <line
                x1={leftPad + labelWidth + Math.min(barWidth, maxBarWidth) / 2}
                y1={y + barHeight - 4}
                x2={leftPad + labelWidth + Math.min(barWidth, maxBarWidth) / 2}
                y2={y + barHeight + gap + 4}
                stroke="#d1d5db"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
            )}
          </g>
        )
      })}

      {/* Price comparison arrow section */}
      {(targetPrice || currentPrice) && (
        <g>
          {(() => {
            const arrowY = steps.length * (barHeight + gap) + 20
            const midX = leftPad + labelWidth + maxBarWidth / 2
            return (
              <>
                <line
                  x1={leftPad + labelWidth}
                  y1={arrowY}
                  x2={leftPad + labelWidth + maxBarWidth + valueWidth}
                  y2={arrowY}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                />

                {currentPrice && (
                  <>
                    <rect
                      x={midX - 100}
                      y={arrowY + 10}
                      width={90}
                      height={36}
                      rx={6}
                      fill="#f1f5f9"
                      stroke="#94a3b8"
                      strokeWidth={1}
                    />
                    <text
                      x={midX - 55}
                      y={arrowY + 22}
                      textAnchor="middle"
                      fontSize={9}
                      fill="#64748b"
                      fontWeight="500"
                    >
                      CURRENT
                    </text>
                    <text
                      x={midX - 55}
                      y={arrowY + 38}
                      textAnchor="middle"
                      fontSize={14}
                      fill="#334155"
                      fontWeight="700"
                    >
                      {currentPrice}
                    </text>
                  </>
                )}

                {/* Arrow */}
                <line
                  x1={midX - 6}
                  y1={arrowY + 28}
                  x2={midX + 6}
                  y2={arrowY + 28}
                  stroke="#6366f1"
                  strokeWidth={2}
                  markerEnd="url(#arrowhead)"
                />
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="8"
                    markerHeight="6"
                    refX="8"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3, 0 6" fill="#6366f1" />
                  </marker>
                </defs>

                {targetPrice && (
                  <>
                    <rect
                      x={midX + 10}
                      y={arrowY + 10}
                      width={90}
                      height={36}
                      rx={6}
                      fill="#f0fdf4"
                      stroke="#22c55e"
                      strokeWidth={1}
                    />
                    <text
                      x={midX + 55}
                      y={arrowY + 22}
                      textAnchor="middle"
                      fontSize={9}
                      fill="#16a34a"
                      fontWeight="500"
                    >
                      TARGET
                    </text>
                    <text
                      x={midX + 55}
                      y={arrowY + 38}
                      textAnchor="middle"
                      fontSize={14}
                      fill="#15803d"
                      fontWeight="700"
                    >
                      {targetPrice}
                    </text>
                  </>
                )}

                {/* Time horizon and implied return */}
                {(impliedReturn || timeHorizon) && (
                  <text
                    x={midX}
                    y={arrowY + 62}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#6b7280"
                  >
                    {impliedReturn && `${impliedReturn}`}
                    {impliedReturn && timeHorizon && ' · '}
                    {timeHorizon && `Horizon: ${timeHorizon}`}
                  </text>
                )}
              </>
            )
          })()}
        </g>
      )}
    </svg>
  )
}
