'use client'

export interface FlowStep {
  label: string
  value: string
  note?: string
}

interface ValuationFlowProps {
  steps: FlowStep[]
  targetPrice?: string
  currentPrice?: string
}

export default function ValuationFlow({ steps, targetPrice, currentPrice }: ValuationFlowProps) {
  if (!steps || steps.length === 0) return null

  const boxWidth = 140
  const boxHeight = 60
  const arrowLen = 40
  const pad = 20
  const cols = Math.min(steps.length, 4)
  const rows = Math.ceil(steps.length / cols)

  const stepWidth = boxWidth + arrowLen
  const svgWidth = cols * stepWidth - arrowLen + pad * 2
  const svgHeight = rows * (boxHeight + 50) + (targetPrice || currentPrice ? 70 : 0) + pad

  function getPos(index: number): { x: number; y: number; row: number; col: number } {
    const row = Math.floor(index / cols)
    // Alternate row direction for snake layout
    const isReversed = row % 2 === 1
    const colInRow = index % cols
    const col = isReversed ? cols - 1 - colInRow : colInRow
    const x = pad + col * stepWidth
    const y = pad + row * (boxHeight + 50)
    return { x, y, row, col }
  }

  // Step color based on position
  function getColor(index: number): { fill: string; stroke: string; text: string } {
    if (index === steps.length - 1) {
      return { fill: '#f0fdf4', stroke: '#22c55e', text: '#15803d' }
    }
    if (index === 0) {
      return { fill: '#eef2ff', stroke: '#6366f1', text: '#4f46e5' }
    }
    return { fill: '#f8fafc', stroke: '#cbd5e1', text: '#334155' }
  }

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="max-w-3xl"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
    >
      <defs>
        <marker
          id="flow-arrow"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
        </marker>
      </defs>

      {steps.map((step, i) => {
        const pos = getPos(i)
        const colors = getColor(i)

        return (
          <g key={i}>
            {/* Box */}
            <rect
              x={pos.x}
              y={pos.y}
              width={boxWidth}
              height={boxHeight}
              rx={8}
              fill={colors.fill}
              stroke={colors.stroke}
              strokeWidth={1.5}
            />
            {/* Label */}
            <text
              x={pos.x + boxWidth / 2}
              y={pos.y + 20}
              textAnchor="middle"
              fontSize={10}
              fontWeight="500"
              fill="#6b7280"
            >
              {step.label}
            </text>
            {/* Value */}
            <text
              x={pos.x + boxWidth / 2}
              y={pos.y + 40}
              textAnchor="middle"
              fontSize={14}
              fontWeight="700"
              fill={colors.text}
            >
              {step.value}
            </text>
            {/* Note below box */}
            {step.note && (
              <text
                x={pos.x + boxWidth / 2}
                y={pos.y + boxHeight + 14}
                textAnchor="middle"
                fontSize={9}
                fill="#9ca3af"
              >
                {step.note.length > 25 ? step.note.slice(0, 25) + '...' : step.note}
              </text>
            )}

            {/* Arrow to next step */}
            {i < steps.length - 1 && (() => {
              const nextPos = getPos(i + 1)
              const sameRow = pos.row === nextPos.row
              if (sameRow) {
                // Horizontal arrow
                const isReversed = pos.row % 2 === 1
                const startX = isReversed ? pos.x : pos.x + boxWidth
                const endX = isReversed ? nextPos.x + boxWidth : nextPos.x
                return (
                  <line
                    x1={startX}
                    y1={pos.y + boxHeight / 2}
                    x2={endX}
                    y2={pos.y + boxHeight / 2}
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    markerEnd="url(#flow-arrow)"
                  />
                )
              } else {
                // Vertical drop to next row
                return (
                  <line
                    x1={pos.x + boxWidth / 2}
                    y1={pos.y + boxHeight}
                    x2={nextPos.x + boxWidth / 2}
                    y2={nextPos.y}
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    markerEnd="url(#flow-arrow)"
                  />
                )
              }
            })()}
          </g>
        )
      })}

      {/* Bottom price comparison */}
      {(targetPrice || currentPrice) && (() => {
        const lastPos = getPos(steps.length - 1)
        const y = lastPos.y + boxHeight + 40
        const midX = svgWidth / 2
        return (
          <g>
            <line
              x1={pad}
              y1={y}
              x2={svgWidth - pad}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
            {currentPrice && (
              <text
                x={midX - 60}
                y={y + 20}
                textAnchor="middle"
                fontSize={12}
                fill="#64748b"
              >
                Current: <tspan fontWeight="700" fill="#334155">{currentPrice}</tspan>
              </text>
            )}
            {targetPrice && (
              <text
                x={midX + 60}
                y={y + 20}
                textAnchor="middle"
                fontSize={12}
                fill="#16a34a"
              >
                Target: <tspan fontWeight="700">{targetPrice}</tspan>
              </text>
            )}
          </g>
        )
      })()}
    </svg>
  )
}
