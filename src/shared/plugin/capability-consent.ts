// Consent copy for the install-time trust gate. Because plugins run trusted
// (full Node/shell), capabilities are NOT a runtime boundary — the consent UI
// must say so. The disclaimer constant below is required wherever capabilities
// are listed, so a UI implementer cannot quietly present them as limits.

import { PLUGIN_CAPABILITIES, type PluginCapability } from './manifest'

// Required, rendered at the same weight as the capability list, so users do not
// infer that unlisted capabilities are blocked. See the plan's Trust Model.
export const CAPABILITY_NOT_A_LIMIT_DISCLAIMER =
  'These are the author’s declared intentions, not enforced limits. Because plugins run with full ' +
  'access to your computer, they are not technically restricted to the capabilities listed here.'

// Plain-language description per capability. `satisfies` keeps it exhaustive so
// adding a capability forces adding its consent copy.
export const CAPABILITY_CONSENT_COPY = {
  'workspace:read':
    'Read basic workspace info (name, current branch, dirty state, open file count)',
  commands: 'Run allowlisted host commands (open external links, copy to clipboard)',
  settings: 'Store and read its own plugin settings',
  'process:spawn': 'Run programs and shell commands on your computer',
  network: 'Make network connections',
  fs: 'Read and write files on your computer'
} satisfies Record<PluginCapability, string>

// Build the consent lines for a manifest's declared capabilities, in the
// canonical capability order (stable display regardless of manifest order).
export function capabilityConsentLines(declared: readonly PluginCapability[]): string[] {
  const set = new Set(declared)
  return PLUGIN_CAPABILITIES.filter((cap) => set.has(cap)).map(
    (cap) => CAPABILITY_CONSENT_COPY[cap]
  )
}
