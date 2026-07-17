import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import type { RuntimeUserCloseSource } from '../../../../shared/runtime-close-intent'
import {
  closeWebRuntimeSessionTab,
  isWebRuntimeSessionActive,
  toHostSessionTabId
} from '@/runtime/web-runtime-session'
import { resolveHostSessionTabIdForWebSessionTab } from '@/runtime/web-session-tabs-sync'
import {
  clearWebSessionTerminalCloseRoutesForLocalTab,
  consumeWebSessionTerminalCloseRoute,
  recordWebSessionTerminalCloseRoute
} from '@/runtime/web-session-terminal-close-route'
import type { AppState } from '@/store'
import type {
  TerminalTabCloseReason,
  TerminalTabRetirementPlan
} from '@/store/slices/terminal-tab-retirement'
import { closeLocalTerminalTabState } from './close-local-terminal-tab-state'

type RemoteTerminalTabCloseState = AppState

export function forwardRetainedRemoteTerminalClose(
  state: RemoteTerminalTabCloseState,
  localTabId: string,
  source: RuntimeUserCloseSource
): void {
  const route = consumeWebSessionTerminalCloseRoute(localTabId)
  if (!route) {
    return
  }
  const currentEnvironmentId = getRuntimeEnvironmentIdForWorktree(state, route.worktreeId)
  // Why: ownership can change while a mirror-exit close is queued. Never
  // forward destructive intent through a route retained for another host.
  if (
    currentEnvironmentId !== route.environmentId ||
    !isWebRuntimeSessionActive(route.environmentId)
  ) {
    return
  }
  void closeWebRuntimeSessionTab({
    worktreeId: route.worktreeId,
    tabId: route.hostTabId,
    environmentId: route.environmentId,
    source
  })
}

export function closeRemoteTerminalTab(args: {
  state: RemoteTerminalTabCloseState
  requestTabId: string
  worktreeId: string
  terminalTabId: string
  options?: {
    reason?: TerminalTabCloseReason
    remoteCloseSource?: RuntimeUserCloseSource
    captureRecentlyClosed?: boolean
    localPtyTeardownOwnedExternally?: boolean
    precomputedRetirementPlan?: TerminalTabRetirementPlan
  }
}): boolean {
  const environmentId = getRuntimeEnvironmentIdForWorktree(args.state, args.worktreeId)
  if (!environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return false
  }
  const hostTabId =
    resolveHostSessionTabIdForWebSessionTab(args.state, {
      environmentId,
      worktreeId: args.worktreeId,
      tabId: args.terminalTabId
    }) ?? toHostSessionTabId(args.terminalTabId)
  if (args.options?.reason === 'pty-exit') {
    // Why: pruning removes the only local row that can route an already-queued
    // explicit close. Retain the authoritative address briefly for that race.
    const visibleTabIds = (args.state.unifiedTabsByWorktree?.[args.worktreeId] ?? [])
      .filter(
        (tab) =>
          tab.contentType === 'terminal' &&
          (tab.entityId === args.terminalTabId || tab.id === args.requestTabId)
      )
      .map((tab) => tab.id)
    recordWebSessionTerminalCloseRoute({
      requestTabId: args.requestTabId,
      terminalTabId: args.terminalTabId,
      localTabIds: visibleTabIds,
      worktreeId: args.worktreeId,
      environmentId,
      hostTabId
    })
  } else {
    clearWebSessionTerminalCloseRoutesForLocalTab(args.requestTabId)
  }
  closeLocalTerminalTabState(args.terminalTabId, {
    reason: args.options?.reason,
    ...(args.options?.captureRecentlyClosed !== undefined
      ? { captureRecentlyClosed: args.options.captureRecentlyClosed }
      : {}),
    remoteCloseOwnedByHost: true,
    ...(args.options?.localPtyTeardownOwnedExternally
      ? { localPtyTeardownOwnedExternally: true }
      : {}),
    ...(args.options?.precomputedRetirementPlan
      ? { precomputedRetirementPlan: args.options.precomputedRetirementPlan }
      : {})
  })
  // Why: a stale client-side mirror exit is reconciliation evidence, not
  // destructive intent for the host's authoritative terminal.
  if (args.options?.remoteCloseSource) {
    void closeWebRuntimeSessionTab({
      worktreeId: args.worktreeId,
      tabId: hostTabId,
      environmentId,
      source: args.options.remoteCloseSource
    })
  }
  return true
}

export function clearRetainedRemoteTerminalCloseRoute(localTabId: string): void {
  clearWebSessionTerminalCloseRoutesForLocalTab(localTabId)
}
