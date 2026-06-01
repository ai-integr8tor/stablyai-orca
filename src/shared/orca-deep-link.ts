// Pure parsing for Orca's `orca://` deep-link scheme. Lives in shared so both
// the main process (OS open-url / argv routing) and the renderer (in-terminal
// OSC 8 link clicks) classify links with identical rules.

export const ORCA_URL_SCHEME = 'orca'

/** A recognized Orca deep-link action. Only terminal focus is supported today;
 *  `orca://worktree/<id>` is intentionally deferred (worktree ids embed
 *  `repoId::path` and need encoding). */
export type OrcaDeepLink = { kind: 'focus'; handle: string }

// Runtime-issued terminal handles look like `term_<uuid>` — letters, digits,
// underscore and hyphen only. Anything else is rejected so a malformed or
// hostile link can never reach the focus action.
const TERMINAL_HANDLE_PATTERN = /^[A-Za-z0-9_-]+$/

/**
 * Parse an `orca://` URL into a supported deep-link, or null if it is not one.
 * Returns null for unrelated `orca://` URLs (e.g. the web-only `orca://pair`
 * flow) so callers silently ignore unknown hosts instead of acting on them.
 */
export function parseOrcaDeepLink(url: string): OrcaDeepLink | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${ORCA_URL_SCHEME}:` || parsed.hostname !== 'focus') {
    return null
  }
  // Why: the handle rides in the path, not the host — URL parsing lowercases
  // hostnames, but handles are matched case-sensitively by the runtime, so a
  // host-encoded handle would silently fail to resolve.
  const handle = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  if (!TERMINAL_HANDLE_PATTERN.test(handle)) {
    return null
  }
  return { kind: 'focus', handle }
}

/**
 * Find the first `orca://` argument in an argv list. Windows/Linux deliver
 * deep-links as a process argument (initial launch or `second-instance`)
 * rather than the macOS `open-url` event.
 */
export function extractOrcaDeepLinkFromArgv(argv: readonly string[] | undefined): string | null {
  if (!argv) {
    return null
  }
  for (const arg of argv) {
    if (typeof arg === 'string' && arg.startsWith(`${ORCA_URL_SCHEME}://`)) {
      return arg
    }
  }
  return null
}
