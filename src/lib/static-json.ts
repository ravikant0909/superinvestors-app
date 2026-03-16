export async function fetchStaticJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Static asset request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}
