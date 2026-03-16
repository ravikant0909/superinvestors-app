import fs from 'fs'
import path from 'path'
import { normalizeConviction, type NormalizedConviction } from './conviction-normalize'

const CONVICTION_DIR = path.resolve(process.cwd(), 'conviction_data')

let _cachedConvictions: NormalizedConviction[] | null | undefined = undefined

function scoreConviction(record: NormalizedConviction): number {
  let score = 0

  if (record.thesis_headline) score += 2
  if (record.thesis_summary) score += 2
  if (record.company_brief) score += 1
  if (record.why_this_price) score += 1
  if (Object.keys(record.key_metrics).length > 0) score += 1

  score += record.thesis_bullets.length
  score += record.business_bullets.length
  score += record.moat_sources.length
  score += record.risks.length
  score += record.catalysts.length
  score += record.investor_in_their_own_words.length

  return score
}

export function loadAllConvictions(): NormalizedConviction[] {
  if (_cachedConvictions !== undefined) {
    return _cachedConvictions ?? []
  }

  if (!fs.existsSync(CONVICTION_DIR)) {
    _cachedConvictions = []
    return _cachedConvictions
  }

  const files = fs
    .readdirSync(CONVICTION_DIR)
    .filter((file) => file.endsWith('.json') && file !== 'index.json')
    .sort()

  const byLookupKey = new Map<string, NormalizedConviction>()

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(CONVICTION_DIR, file), 'utf-8'))
      const normalized = normalizeConviction(raw)
      if (!normalized) continue

      const existing = byLookupKey.get(normalized.lookup_key)
      if (!existing || scoreConviction(normalized) >= scoreConviction(existing)) {
        byLookupKey.set(normalized.lookup_key, normalized)
      }
    } catch {
      // Skip malformed conviction files.
    }
  }

  _cachedConvictions = Array.from(byLookupKey.values()).sort(
    (a, b) => b.weight_pct - a.weight_pct || a.slug.localeCompare(b.slug)
  )
  return _cachedConvictions
}

export function findConvictionBySlug(slug: string): NormalizedConviction | null {
  return loadAllConvictions().find((conviction) => conviction.slug === slug) || null
}

export function getConvictionLookupKeys(): Set<string> {
  return new Set(loadAllConvictions().map((conviction) => conviction.lookup_key))
}
