import type { ConnectionState } from '../transport/types'

export const MOBILE_AGENTS_POLL_INTERVAL_MS = 3000
export const MOBILE_AGENTS_WORKTREE_PS_LIMIT = 10000

export type MobileAgentsCenterState =
  | { kind: 'loading'; message: string }
  | { kind: 'connecting'; message: string }
  | { kind: 'error'; message: string; showReconnect: boolean }
  | { kind: 'empty'; message: string }

export function getMobileAgentsCenterState(args: {
  loaded: boolean
  connectionState: ConnectionState
  isErrorVerdict: boolean
  showConnecting: boolean
  visibleGroupCount: number
  hasActiveFilter: boolean
  error: string | null
  verdictLabel: string
}): MobileAgentsCenterState | null {
  if (!args.loaded && args.connectionState === 'connected') {
    return { kind: 'loading', message: 'Loading agents...' }
  }
  if (!args.loaded && args.isErrorVerdict) {
    return {
      kind: 'error',
      message: args.error ?? args.verdictLabel,
      showReconnect: true
    }
  }
  if (!args.loaded && args.showConnecting) {
    return { kind: 'connecting', message: 'Connecting to host...' }
  }
  if (args.visibleGroupCount > 0) {
    return null
  }
  if (args.error) {
    return { kind: 'error', message: args.error, showReconnect: false }
  }
  return {
    kind: 'empty',
    message: args.hasActiveFilter ? 'No agents match these filters.' : 'No agent activity yet.'
  }
}
