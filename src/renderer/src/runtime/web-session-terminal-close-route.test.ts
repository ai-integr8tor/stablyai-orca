import { afterEach, describe, expect, it } from 'vitest'
import {
  clearWebSessionTerminalCloseRouteForExplicitClose,
  clearWebSessionTerminalCloseRoutesForEnvironment,
  clearWebSessionTerminalCloseRoutesForWorktree,
  consumeWebSessionTerminalCloseRoute,
  hasPendingWebSessionTerminalCloseRoutes,
  reconcileWebSessionTerminalCloseRoutes,
  recordWebSessionTerminalCloseRoute,
  resetWebSessionTerminalCloseRoutesForTests
} from './web-session-terminal-close-route'

const route = {
  requestTabId: 'local-tab-1',
  terminalTabId: 'terminal-tab-1',
  worktreeId: 'repo::/worktree',
  environmentId: 'runtime-1',
  hostTabId: 'host-tab-1'
}

afterEach(() => resetWebSessionTerminalCloseRoutesForTests())

describe('web session terminal close route', () => {
  it('keeps the snapshot fast path empty and prunes expired routes globally', () => {
    expect(hasPendingWebSessionTerminalCloseRoutes(1000)).toBe(false)

    recordWebSessionTerminalCloseRoute(route, 1000)

    expect(hasPendingWebSessionTerminalCloseRoutes(1001)).toBe(true)
    expect(hasPendingWebSessionTerminalCloseRoutes(11_001)).toBe(false)
  })

  it('consumes a retained route exactly once', () => {
    recordWebSessionTerminalCloseRoute(route, 1000)

    expect(consumeWebSessionTerminalCloseRoute('local-tab-1', 1001)).toEqual({
      ...route,
      recordedAt: 1000
    })
    expect(consumeWebSessionTerminalCloseRoute('local-tab-1', 1002)).toBeNull()
  })

  it('consumes the same route through a visible unified-tab alias exactly once', () => {
    recordWebSessionTerminalCloseRoute({ ...route, localTabIds: ['visible-tab-1'] }, 1000)

    expect(consumeWebSessionTerminalCloseRoute('visible-tab-1', 1001)).toEqual({
      ...route,
      recordedAt: 1000
    })
    expect(consumeWebSessionTerminalCloseRoute(route.requestTabId, 1002)).toBeNull()
  })

  it('expires a retained route instead of closing a much later host tab', () => {
    recordWebSessionTerminalCloseRoute(route, 1000)

    expect(consumeWebSessionTerminalCloseRoute('local-tab-1', 11_001)).toBeNull()
  })

  it('refuses to consume a local id that collides across runtime scopes', () => {
    recordWebSessionTerminalCloseRoute(route, 1000)
    recordWebSessionTerminalCloseRoute(
      { ...route, environmentId: 'runtime-2', hostTabId: 'other-host-tab' },
      1000
    )

    expect(consumeWebSessionTerminalCloseRoute('local-tab-1', 1001)).toBeNull()
  })

  it('retains a route while the same authoritative host tab remains present', () => {
    recordWebSessionTerminalCloseRoute(route, 1000)

    reconcileWebSessionTerminalCloseRoutes({
      environmentId: route.environmentId,
      worktreeId: route.worktreeId,
      hostTabIdByLocalTabId: new Map([[route.terminalTabId, route.hostTabId]]),
      presentHostTabIds: new Set([route.hostTabId]),
      now: 1001
    })

    expect(consumeWebSessionTerminalCloseRoute(route.requestTabId, 1002)).not.toBeNull()
  })

  it('clears routes after authoritative removal or local-to-host replacement', () => {
    recordWebSessionTerminalCloseRoute(route, 1000)
    reconcileWebSessionTerminalCloseRoutes({
      environmentId: route.environmentId,
      worktreeId: route.worktreeId,
      hostTabIdByLocalTabId: new Map(),
      presentHostTabIds: new Set(),
      now: 1001
    })
    expect(consumeWebSessionTerminalCloseRoute(route.requestTabId, 1002)).toBeNull()

    recordWebSessionTerminalCloseRoute(route, 2000)
    reconcileWebSessionTerminalCloseRoutes({
      environmentId: route.environmentId,
      worktreeId: route.worktreeId,
      hostTabIdByLocalTabId: new Map([[route.terminalTabId, 'replacement-host-tab']]),
      presentHostTabIds: new Set([route.hostTabId, 'replacement-host-tab']),
      now: 2001
    })
    expect(consumeWebSessionTerminalCloseRoute(route.requestTabId, 2002)).toBeNull()
  })

  it('clears routes for explicit closes, removed worktrees, and disconnected environments', () => {
    recordWebSessionTerminalCloseRoute(route, 1000)
    clearWebSessionTerminalCloseRouteForExplicitClose({
      localOrHostTabId: route.hostTabId,
      worktreeId: route.worktreeId,
      environmentId: route.environmentId
    })
    expect(consumeWebSessionTerminalCloseRoute(route.requestTabId, 1001)).toBeNull()

    recordWebSessionTerminalCloseRoute(route, 2000)
    clearWebSessionTerminalCloseRoutesForWorktree(route.environmentId, route.worktreeId)
    expect(consumeWebSessionTerminalCloseRoute(route.requestTabId, 2001)).toBeNull()

    recordWebSessionTerminalCloseRoute(route, 3000)
    clearWebSessionTerminalCloseRoutesForEnvironment(route.environmentId)
    expect(consumeWebSessionTerminalCloseRoute(route.requestTabId, 3001)).toBeNull()
  })
})
