import { z } from 'zod'

// Static version manifest hosted in the repo and served via GitHub raw.
//
// Why this exists: iTunes Lookup only reports the App Store *production*
// version, so it cannot see TestFlight beta builds. The manifest is updated by
// the iOS release workflow on every TestFlight upload, so it is the only source
// that reflects the newest beta. check-update.ts compares iTunes + manifest
// versions, using iosBuildNumber as the tie-breaker for same-version betas.
//
// The file lives at repo root under mobile/ and is updated on each release.

const MANIFEST_URL =
  'https://raw.githubusercontent.com/stablyai/orca/main/mobile/latest-version.json'

const VersionManifest = z.object({
  version: z.string().min(1),
  iosBuildNumber: z.union([z.string(), z.number()]).optional().catch(undefined),
  releaseNotes: z.string().optional().catch(undefined),
  iosUrl: z.string().optional().catch(undefined)
})

export type VersionManifestInfo = {
  version: string
  iosBuildNumber?: string | number
  releaseNotes?: string
  iosUrl?: string
}

/**
 * Fetch the static latest-version manifest. Returns null on any failure so the
 * caller can fall back to the iTunes source alone. The CDN caches raw GitHub
 * for ~5 min, which is fine for a once-daily check.
 */
export async function fetchVersionManifest(
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}
): Promise<VersionManifestInfo | null> {
  const fetchImpl = options.fetchImpl ?? fetch
  try {
    const response = await fetchImpl(MANIFEST_URL, {
      headers: { Accept: 'application/json' },
      signal: options.signal
    })
    if (!response.ok) {
      return null
    }
    const parsed = VersionManifest.parse(await response.json())
    return {
      version: parsed.version,
      iosBuildNumber: parsed.iosBuildNumber,
      releaseNotes: parsed.releaseNotes,
      iosUrl: parsed.iosUrl
    }
  } catch {
    // Why: best-effort — a missing/ malformed manifest (e.g. before the first
    // iOS release ships it) must not surface as a user-facing error.
    return null
  }
}
