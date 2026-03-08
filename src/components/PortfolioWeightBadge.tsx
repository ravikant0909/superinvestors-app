'use client'

interface PortfolioWeightBadgeProps {
  weight: number
  size?: 'sm' | 'md' | 'lg'
}

function getWeightColor(weight: number): { bg: string; text: string; ring: string } {
  if (weight >= 50) return { bg: '#fef2f2', text: '#dc2626', ring: '#fca5a5' }
  if (weight >= 30) return { bg: '#fff7ed', text: '#ea580c', ring: '#fdba74' }
  if (weight >= 20) return { bg: '#fefce8', text: '#ca8a04', ring: '#fde047' }
  return { bg: '#f0fdf4', text: '#16a34a', ring: '#86efac' }
}

const sizes = {
  sm: { outer: 48, inner: 40, font: 11, label: 8 },
  md: { outer: 72, inner: 60, font: 16, label: 10 },
  lg: { outer: 96, inner: 80, font: 22, label: 12 },
}

export default function PortfolioWeightBadge({ weight, size = 'md' }: PortfolioWeightBadgeProps) {
  const safeWeight = weight ?? 0
  const s = sizes[size]
  const colors = getWeightColor(safeWeight)
  const circumference = Math.PI * (s.inner - 6)
  const filled = (safeWeight / 100) * circumference

  return (
    <svg
      width={s.outer}
      height={s.outer}
      viewBox={`0 0 ${s.outer} ${s.outer}`}
      className="flex-shrink-0"
    >
      {/* Background circle */}
      <circle
        cx={s.outer / 2}
        cy={s.outer / 2}
        r={(s.inner - 6) / 2}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={3}
      />
      {/* Filled arc */}
      <circle
        cx={s.outer / 2}
        cy={s.outer / 2}
        r={(s.inner - 6) / 2}
        fill="none"
        stroke={colors.ring}
        strokeWidth={3}
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
        transform={`rotate(-90 ${s.outer / 2} ${s.outer / 2})`}
      />
      {/* Inner filled circle */}
      <circle
        cx={s.outer / 2}
        cy={s.outer / 2}
        r={(s.inner - 12) / 2}
        fill={colors.bg}
      />
      {/* Weight text */}
      <text
        x={s.outer / 2}
        y={s.outer / 2 - 1}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={s.font}
        fontWeight="800"
        fill={colors.text}
      >
        {safeWeight.toFixed(1)}%
      </text>
    </svg>
  )
}
