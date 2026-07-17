// Wire-format contract for the "install ripgrep" Quick Open guidance message.
// The message is built in the main process / SSH relay and parsed in the
// renderer. Keeping the prose tokens and the build/parse pair together gives
// both sides one source of truth — an edit to the wording cannot silently
// break parsing (which would drop the guidance card back to raw error text).
// This module stays free of node imports so the renderer can consume it.

export type QuickOpenInstallRgLocation = 'local' | 'remote'

// Why: the relay scans the remote host, the local main process scans this
// machine — the message names which so the renderer needn't guess.
export const INSTALL_LOCATION_PHRASE: Record<QuickOpenInstallRgLocation, string> = {
  local: 'on this machine',
  remote: 'on the remote'
}

const SCAN_TOO_LARGE_PREFIX = 'Quick Open scan too large'
const LISTING_GUIDANCE = 'to enable fast, gitignore-aware listing:'

export function formatInstallRgMessage(opts: {
  reason: string
  location: QuickOpenInstallRgLocation
  command: string
}): string {
  return (
    `${SCAN_TOO_LARGE_PREFIX} (${opts.reason}). ` +
    `Install ripgrep ${INSTALL_LOCATION_PHRASE[opts.location]} ${LISTING_GUIDANCE} ${opts.command}`
  )
}

export type ParsedInstallRgMessage = {
  reason: string
  isRemote: boolean
  tail: string
}

// Why: built from the same phrase constants the formatter uses, so the two
// cannot drift. Alternation order is irrelevant (the phrases share no prefix)
// and the tokens contain no regex metacharacters.
const INSTALL_RG_MESSAGE_RE = new RegExp(
  `^${SCAN_TOO_LARGE_PREFIX} \\(([^)]+)\\)\\. Install ripgrep ` +
    `(${Object.values(INSTALL_LOCATION_PHRASE).join('|')}) ${LISTING_GUIDANCE} (.+)$`
)

export function parseInstallRgMessage(message: string): ParsedInstallRgMessage | null {
  const match = message.match(INSTALL_RG_MESSAGE_RE)
  if (!match) {
    return null
  }
  return {
    reason: match[1],
    isRemote: match[2] === INSTALL_LOCATION_PHRASE.remote,
    tail: match[3].trim()
  }
}
