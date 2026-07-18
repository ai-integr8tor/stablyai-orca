import { z } from 'zod'

// iTunes Lookup exposes only the App Store *production* version for an app.
// TestFlight builds are NOT reported here — that gap is why version-manifest
// exists as a complementary source (see check-update.ts).
//
// Why a dedicated module: keeps the network + schema details out of the
// orchestrator so both can be unit-tested independently with fixtures.

const APP_STORE_ID = '6766130217'

const ItunesResult = z.object({
  version: z.string().min(1),
  releaseNotes: z.string().optional().catch(undefined)
})

const ItunesLookupResponse = z.object({
  resultCount: z.number().optional().catch(0),
  results: z.array(ItunesResult).catch([])
})

export type ItunesVersionInfo = {
  version: string
  releaseNotes?: string
}

/**
 * Query the public iTunes Lookup endpoint for the Orca iOS production version.
 * Returns null when the app isn't published to the App Store (TestFlight-only),
 * when the network fails, or when the response is malformed — callers should
 * treat null as "no information from this source".
 */
export async function fetchItunesVersion(
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}
): Promise<ItunesVersionInfo | null> {
  const fetchImpl = options.fetchImpl ?? fetch
  const url = `https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=us`

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: options.signal
    })
    if (!response.ok) {
      return null
    }
    const parsed = ItunesLookupResponse.parse(await response.json())
    const first = parsed.results[0]
    if (!first) {
      return null
    }
    return { version: first.version, releaseNotes: first.releaseNotes }
  } catch {
    // Why: the update check is best-effort. Any failure (offline, timeout,
    // shape change, TestFlight-only with no result) just means "no signal
    // from iTunes" — never propagates as a user-facing error.
    return null
  }
}
