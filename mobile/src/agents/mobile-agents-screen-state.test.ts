import { describe, expect, it } from 'vitest'
import {
  MOBILE_AGENTS_POLL_INTERVAL_MS,
  MOBILE_AGENTS_WORKTREE_PS_LIMIT,
  getMobileAgentsCenterState
} from './mobile-agents-screen-state'

describe('mobile agents screen state', () => {
  it('keeps polling and worktree request limits explicit', () => {
    expect(MOBILE_AGENTS_POLL_INTERVAL_MS).toBe(3000)
    expect(MOBILE_AGENTS_WORKTREE_PS_LIMIT).toBe(10000)
  })

  it('describes loading, connecting, and disconnected center states', () => {
    expect(
      getMobileAgentsCenterState({
        loaded: false,
        connectionState: 'connected',
        isErrorVerdict: false,
        showConnecting: false,
        visibleGroupCount: 0,
        hasActiveFilter: false,
        error: null,
        verdictLabel: 'Offline'
      })
    ).toEqual({ kind: 'loading', message: 'Loading agents...' })

    expect(
      getMobileAgentsCenterState({
        loaded: false,
        connectionState: 'connecting',
        isErrorVerdict: false,
        showConnecting: true,
        visibleGroupCount: 0,
        hasActiveFilter: false,
        error: null,
        verdictLabel: 'Connecting'
      })
    ).toEqual({ kind: 'connecting', message: 'Connecting to host...' })

    expect(
      getMobileAgentsCenterState({
        loaded: false,
        connectionState: 'disconnected',
        isErrorVerdict: true,
        showConnecting: false,
        visibleGroupCount: 0,
        hasActiveFilter: false,
        error: 'Socket closed',
        verdictLabel: 'Offline'
      })
    ).toEqual({ kind: 'error', message: 'Socket closed', showReconnect: true })
  })

  it('keeps an error-only first load from also claiming empty activity', () => {
    expect(
      getMobileAgentsCenterState({
        loaded: true,
        connectionState: 'connected',
        isErrorVerdict: false,
        showConnecting: false,
        visibleGroupCount: 0,
        hasActiveFilter: false,
        error: 'worktree.ps failed',
        verdictLabel: 'Connected'
      })
    ).toEqual({ kind: 'error', message: 'worktree.ps failed', showReconnect: false })
  })

  it('separates empty list copy from stale-list inline errors', () => {
    expect(
      getMobileAgentsCenterState({
        loaded: true,
        connectionState: 'connected',
        isErrorVerdict: false,
        showConnecting: false,
        visibleGroupCount: 0,
        hasActiveFilter: true,
        error: null,
        verdictLabel: 'Connected'
      })
    ).toEqual({ kind: 'empty', message: 'No agents match these filters.' })

    expect(
      getMobileAgentsCenterState({
        loaded: true,
        connectionState: 'connected',
        isErrorVerdict: false,
        showConnecting: false,
        visibleGroupCount: 1,
        hasActiveFilter: false,
        error: 'stale data shown',
        verdictLabel: 'Connected'
      })
    ).toBeNull()
  })
})
