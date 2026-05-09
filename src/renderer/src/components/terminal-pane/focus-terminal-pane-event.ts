import type { FocusTerminalPaneDetail } from '@/constants/terminal'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'

type FocusTerminalPaneEventDeps = {
  tabId: string
  manager: Pick<PaneManager, 'getNumericIdForStable' | 'setActivePane'> | null
  acknowledgeAgents: (paneKeys: string[]) => void
  surfaceStaleAgentRow: (tabId: string, stablePaneId: string) => void
}

export function handleFocusTerminalPaneDetail(
  detail: FocusTerminalPaneDetail | undefined,
  { tabId, manager, acknowledgeAgents, surfaceStaleAgentRow }: FocusTerminalPaneEventDeps
): void {
  if (!detail?.tabId || detail.tabId !== tabId) {
    return
  }
  if (!manager) {
    return
  }
  const stablePaneId = detail.stablePaneId
  if (!stablePaneId) {
    // Tab-only activation (no specific pane to focus).
    return
  }
  const numericId = manager.getNumericIdForStable(stablePaneId)
  if (numericId === null) {
    // Why: the carrying pane was closed or the snapshot's stablePaneId
    // wasn't restored. Surface stale state instead of silently focusing a
    // different leaf, and do not ack a row the user did not actually see.
    surfaceStaleAgentRow(tabId, stablePaneId)
    return
  }
  manager.setActivePane(numericId, { focus: true })
  // Why: ack only after stableId focus resolves to a real pane. This keeps
  // the inline agent row's "seen" signal tied to actual user-visible focus.
  if (detail.ackPaneKeyOnSuccess) {
    acknowledgeAgents([detail.ackPaneKeyOnSuccess])
  }
}
