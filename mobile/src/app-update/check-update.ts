import { fetchItunesVersion } from './itunes-lookup'
import { fetchVersionManifest, type VersionManifestInfo } from './version-manifest'
import { fetchLatestAndroidRelease, type AndroidReleaseInfo } from './github-releases'
import { compareVersions, parseSemver } from './version-compare'
import type { ItunesVersionInfo } from './itunes-lookup'

// Orchestrates the platform-specific version check.
//
// Pure decision logic lives in evaluateUpdate(); the network branching lives in
// performUpdateCheck(). Keeping them split lets the decision table and the
// iOS iTunes/manifest combination be unit-tested without touching the network.

// Same deep-link used by ProtocolBlockScreen; duplicated here so the update
// module has no dependency on a presentational component.
export const IOS_APP_STORE_URL = 'itms-apps://apps.apple.com/app/orca-ide/id6766130217'

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'up-to-date' | 'error'

export type UpdateCheckResult =
  | { status: 'up-to-date' }
  | {
      status: 'available'
      latestVersion: string
      latestBuildNumber?: string
      releaseNotes?: string
      updateUrl?: string
    }
  | { status: 'error' }

export type UpdateCandidate = {
  version: string
  buildNumber?: string | number | null
  releaseNotes?: string
  updateUrl?: string
}

export type UpdateSources = {
  itunes?: () => Promise<ItunesVersionInfo | null>
  manifest?: () => Promise<VersionManifestInfo | null>
  android?: () => Promise<AndroidReleaseInfo | null>
}

function parseBuildNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) {
    return null
  }
  const value = String(raw).trim()
  if (!/^\d+$/.test(value)) {
    return null
  }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function formatBuildNumber(raw: string | number | null | undefined): string | undefined {
  const parsed = parseBuildNumber(raw)
  return parsed === null ? undefined : String(parsed)
}

function compareBuildNumbers(
  a: string | number | null | undefined,
  b: string | number | null | undefined
): -1 | 0 | 1 {
  const parsedA = parseBuildNumber(a)
  const parsedB = parseBuildNumber(b)
  if (parsedA === null && parsedB === null) {
    return 0
  }
  if (parsedA === null) {
    return -1
  }
  if (parsedB === null) {
    return 1
  }
  if (parsedA === parsedB) {
    return 0
  }
  return parsedA < parsedB ? -1 : 1
}

function compareCandidates(a: UpdateCandidate, b: UpdateCandidate): -1 | 0 | 1 {
  const versionOrder = compareVersions(a.version, b.version)
  if (versionOrder !== 0) {
    return versionOrder
  }
  return compareBuildNumbers(a.buildNumber, b.buildNumber)
}

function isCandidateNewerThanInstalled(input: {
  candidate: UpdateCandidate
  installedVersion: string
  installedBuildNumber?: string | number | null
}): boolean {
  const versionOrder = compareVersions(input.candidate.version, input.installedVersion)
  if (versionOrder !== 0) {
    return versionOrder > 0
  }
  return compareBuildNumbers(input.candidate.buildNumber, input.installedBuildNumber) > 0
}

function pickLatestCandidate(candidates: UpdateCandidate[]): UpdateCandidate | null {
  let best: UpdateCandidate | null = null
  for (const candidate of candidates) {
    if (!parseSemver(candidate.version)) {
      continue
    }
    if (!best || compareCandidates(candidate, best) > 0) {
      best = candidate
    }
  }
  return best
}

/**
 * Decide the update state purely from the installed version and a set of remote
 * candidates. The newest valid candidate wins; equal marketing versions use
 * the native build number as a tie-breaker for TestFlight reuse of x.y.z.
 */
export function evaluateUpdate(input: {
  installedVersion: string
  installedBuildNumber?: string | number | null
  candidates: UpdateCandidate[]
}): UpdateCheckResult {
  const latest = pickLatestCandidate(input.candidates)

  if (!latest) {
    // No source produced a usable version — nothing actionable for the user.
    return { status: 'error' }
  }
  if (
    !isCandidateNewerThanInstalled({
      candidate: latest,
      installedVersion: input.installedVersion,
      installedBuildNumber: input.installedBuildNumber
    })
  ) {
    return { status: 'up-to-date' }
  }

  const winners = input.candidates.filter((candidate) => compareCandidates(candidate, latest) === 0)
  // Why: once the marketing version has moved past what's installed, prefer any
  // same-version update URL over the exact build-number winner.
  const urlCandidates =
    compareVersions(latest.version, input.installedVersion) > 0
      ? input.candidates.filter(
          (candidate) => compareVersions(candidate.version, latest.version) === 0
        )
      : winners
  const releaseNotes = winners.map((w) => w.releaseNotes).find((n): n is string => Boolean(n))
  const updateUrl = urlCandidates.map((w) => w.updateUrl).find((u): u is string => Boolean(u))
  const latestBuildNumber = formatBuildNumber(latest.buildNumber)

  return {
    status: 'available',
    latestVersion: latest.version,
    ...(latestBuildNumber ? { latestBuildNumber } : {}),
    ...(releaseNotes ? { releaseNotes } : {}),
    ...(updateUrl ? { updateUrl } : {})
  }
}

/**
 * Throttle gate: decide whether enough time has passed since the last check to
 * run another. A missing lastCheckAt (never checked) always allows the check.
 */
export function shouldCheck(input: {
  now: number
  lastCheckAtMs: number | null
  intervalMs: number
}): boolean {
  if (input.lastCheckAtMs === null) {
    return true
  }
  return input.now - input.lastCheckAtMs >= input.intervalMs
}

/**
 * Decide whether the store should start a network check. Cold-start idle state
 * must bypass the persisted throttle because no available/up-to-date result has
 * been hydrated into memory.
 */
export function shouldRunUpdateCheck(input: {
  force?: boolean
  hasInMemoryResult: boolean
  now: number
  lastCheckAtMs: number | null
  intervalMs: number
}): boolean {
  if (input.force || !input.hasInMemoryResult) {
    return true
  }
  return shouldCheck({
    now: input.now,
    lastCheckAtMs: input.lastCheckAtMs,
    intervalMs: input.intervalMs
  })
}

/**
 * Run the platform-appropriate check. iOS combines iTunes Lookup (production)
 * with the static manifest (TestFlight), including same-version build-number
 * bumps; Android reads the newest mobile-android-v GitHub release. Sources are
 * injectable for tests.
 */
export async function performUpdateCheck(input: {
  platform: 'ios' | 'android'
  installedVersion: string
  installedBuildNumber?: string | number | null
  signal?: AbortSignal
  sources?: UpdateSources
}): Promise<UpdateCheckResult> {
  const s = input.sources ?? {}
  const signal = input.signal

  if (input.platform === 'ios') {
    const itunes = s.itunes ?? (() => fetchItunesVersion({ signal }))
    const manifest = s.manifest ?? (() => fetchVersionManifest({ signal }))

    const [itunesResult, manifestResult] = await Promise.allSettled([itunes(), manifest()])

    const candidates: UpdateCandidate[] = []
    const itunesInfo = itunesResult.status === 'fulfilled' ? itunesResult.value : null
    if (itunesInfo) {
      candidates.push({
        version: itunesInfo.version,
        releaseNotes: itunesInfo.releaseNotes,
        updateUrl: IOS_APP_STORE_URL
      })
    }
    const manifestInfo = manifestResult.status === 'fulfilled' ? manifestResult.value : null
    if (manifestInfo) {
      candidates.push({
        version: manifestInfo.version,
        buildNumber: manifestInfo.iosBuildNumber,
        releaseNotes: manifestInfo.releaseNotes,
        updateUrl: manifestInfo.iosUrl
      })
    }

    return evaluateUpdate({
      installedVersion: input.installedVersion,
      installedBuildNumber: input.installedBuildNumber,
      candidates
    })
  }

  // Android
  const android = s.android ?? (() => fetchLatestAndroidRelease({ signal }))
  const release = await android().catch(() => null)
  const candidates: UpdateCandidate[] = release
    ? [
        {
          version: release.version,
          buildNumber: release.versionCode,
          releaseNotes: release.releaseNotes,
          updateUrl: release.apkUrl
        }
      ]
    : []

  return evaluateUpdate({
    installedVersion: input.installedVersion,
    installedBuildNumber: input.installedBuildNumber,
    candidates
  })
}
