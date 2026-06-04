import type { CSSProperties } from 'react'

/**
 * A single gray, rounded, pulsing placeholder block. Use it to mimic the shape
 * of real content while data loads. Width/height come from Tailwind utility
 * classes passed via `className` (e.g. "h-4 w-32"), with an optional inline
 * style escape hatch for one-off sizes.
 */
export function Skeleton({
  className = '',
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      style={style}
      aria-hidden="true"
    />
  )
}

/**
 * Renders `count` evenly spaced full-width skeleton bars. Handy for faking a
 * list/table while it loads. `h` is a Tailwind height class (default "h-4").
 */
export function SkeletonRows({
  count,
  h = 'h-4',
  className = '',
}: {
  count: number
  h?: string
  className?: string
}) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={`w-full ${h}`} />
      ))}
    </div>
  )
}
