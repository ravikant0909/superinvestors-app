export interface NormalizedConviction {
  investor_slug: string
  investor_name: string
  investor_key?: string | null
  firm_name: string
  ticker: string
  company_name: string
  weight_pct: number
  value_millions: number
  thesis_headline: string
  thesis_summary: string
  thesis_bullets: string[]
  business_bullets: string[]
  why_this_price: string
  investor_in_their_own_words: Array<string | Record<string, unknown>>
  key_metrics: Record<string, unknown>
  moat_sources: string[]
  risks: Array<string | Record<string, unknown>>
  catalysts: string[]
  company_brief: string
  slug: string
  lookup_key: string
  detail_path?: string
  [key: string]: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function normalizeStringList(value: unknown): string[] {
  return asArray(value)
    .map((entry) => asString(entry))
    .filter((entry) => entry.length > 0)
}

function normalizeMoatSources(value: unknown): string[] {
  const moat = asRecord(value)
  const sources: string[] = []

  for (const [key, entry] of Object.entries(moat)) {
    if (key === 'moat_type') continue
    const text = asString(entry)
    if (text) {
      sources.push(text)
    }
  }

  return sources
}

function normalizeLegacyQuotes(value: unknown): Array<string | Record<string, unknown>> {
  return asArray(value)
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry
      }

      const quote = asRecord(entry)
      const text = asString(quote.quote)
      if (!text) {
        return null
      }

      return {
        quote: text,
        source: asString(quote.source) || asString(quote.attribution),
        date: asString(quote.date),
        url: asString(quote.url),
        context: asString(quote.context),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

export function normalizeConviction(raw: unknown): NormalizedConviction | null {
  const data = asRecord(raw)
  const investor = asRecord(data.investor)
  const position = asRecord(data.position)
  const thesis = asRecord(data.thesis)
  const companyFundamentals = asRecord(data.company_fundamentals)

  const investorSlug = asString(data.investor_slug) || asString(investor.slug)
  const ticker = (asString(data.ticker) || asString(position.ticker)).toUpperCase()

  if (!investorSlug || !ticker) {
    return null
  }

  const investorName = asString(data.investor_name) || asString(investor.name) || investorSlug
  const firmName = asString(data.firm_name) || asString(investor.firm)
  const companyName = asString(data.company_name) || asString(position.company) || ticker
  const weightPct = asNumber(data.weight_pct) ?? asNumber(position.pct_of_portfolio) ?? 0
  const marketValue = asNumber(position.market_value)
  const valueThousands = asNumber(data.value_thousands)
  const valueMillions =
    asNumber(data.value_millions) ??
    (marketValue !== null ? marketValue / 1_000_000 : null) ??
    (valueThousands !== null ? valueThousands / 1_000 : null) ??
    0

  const keyMetrics =
    Object.keys(asRecord(data.key_metrics)).length > 0
      ? asRecord(data.key_metrics)
      : asRecord(companyFundamentals.financials)

  const normalized: NormalizedConviction = {
    ...data,
    investor_slug: investorSlug,
    investor_name: investorName,
    investor_key: asString(data.investor_key) || null,
    firm_name: firmName,
    ticker,
    company_name: companyName,
    weight_pct: weightPct,
    value_millions: valueMillions,
    thesis_headline:
      asString(data.thesis_headline) ||
      asString(thesis.title) ||
      `${investorName} on ${companyName}`,
    thesis_summary: asString(data.thesis_summary) || asString(thesis.summary),
    thesis_bullets: asArray(data.thesis_bullets).filter(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
    ),
    business_bullets: asArray(data.business_bullets).filter(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
    ),
    why_this_price:
      asString(data.why_this_price) ||
      asString(asRecord(data.valuation_analysis).valuation_assessment),
    investor_in_their_own_words:
      asArray(data.investor_in_their_own_words).length > 0
        ? asArray(data.investor_in_their_own_words).filter(
            (entry): entry is string | Record<string, unknown> =>
              typeof entry === 'string' || (!!entry && typeof entry === 'object' && !Array.isArray(entry)),
          )
        : normalizeLegacyQuotes(data.key_quotes),
    key_metrics: keyMetrics,
    moat_sources:
      asArray(data.moat_sources).length > 0
        ? normalizeStringList(data.moat_sources)
        : normalizeMoatSources(companyFundamentals.moat_analysis),
    risks:
      asArray(data.risks).length > 0
        ? asArray(data.risks).filter(
            (entry): entry is string | Record<string, unknown> =>
              typeof entry === 'string' || (!!entry && typeof entry === 'object' && !Array.isArray(entry)),
          )
        : asArray(companyFundamentals.risks).filter(
            (entry): entry is string | Record<string, unknown> =>
              typeof entry === 'string' || (!!entry && typeof entry === 'object' && !Array.isArray(entry)),
          ),
    catalysts:
      asArray(data.catalysts).length > 0
        ? normalizeStringList(data.catalysts)
        : normalizeStringList(companyFundamentals.growth_drivers),
    company_brief:
      asString(data.company_brief) || asString(companyFundamentals.description),
    slug: asString(data.slug) || `${investorSlug}-${ticker}`,
    lookup_key: `${investorSlug}_${ticker}`,
    detail_path: asString(data.detail_path) || undefined,
  }

  return normalized
}
