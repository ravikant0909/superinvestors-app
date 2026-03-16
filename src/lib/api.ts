const DEFAULT_API_ORIGIN = 'https://superinvestors.ravikant0909.workers.dev'

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL
  if (configured) {
    return trimTrailingSlash(configured)
  }

  return DEFAULT_API_ORIGIN
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getApiBaseUrl()}${normalizedPath}`
}

export async function fetchApiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    try {
      const body = await response.json() as { error?: string }
      if (body?.error) {
        message = body.error
      }
    } catch {
      // Ignore malformed error bodies.
    }
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

interface PriceResponseEntry {
  symbol: string
  price: number
}

interface PricesApiResponse {
  prices: PriceResponseEntry[]
}

export async function fetchPriceMap(symbols: string[]): Promise<Record<string, number>> {
  const normalized = Array.from(new Set(
    symbols
      .map((symbol) => symbol?.trim().toUpperCase())
      .filter((symbol): symbol is string => Boolean(symbol) && !/^\d{5,}/.test(symbol)),
  ))

  if (normalized.length === 0) {
    return {}
  }

  const batches: string[][] = []
  for (let i = 0; i < normalized.length; i += 50) {
    batches.push(normalized.slice(i, i + 50))
  }

  const results = await Promise.all(
    batches.map((batch) =>
      fetchApiJson<PricesApiResponse>(`/api/prices?symbols=${batch.join(',')}`),
    ),
  )

  const priceMap: Record<string, number> = {}
  for (const response of results) {
    for (const entry of response.prices) {
      priceMap[entry.symbol] = entry.price
    }
  }

  return priceMap
}
