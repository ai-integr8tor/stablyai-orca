import type { ActiveRightSidebarTab, RightSidebarExplorerView } from '../../../shared/types'

export type RightSidebarRoute = {
  rightSidebarTab: ActiveRightSidebarTab
  rightSidebarExplorerView: RightSidebarExplorerView
}

function normalizeRightSidebarExplorerView(view: unknown): RightSidebarExplorerView {
  return view === 'search' ? 'search' : 'files'
}

export function normalizeRightSidebarRoute(
  tab: unknown,
  explorerView?: unknown
): RightSidebarRoute {
  // Why: older builds persisted Search as a standalone activity tab.
  if (tab === 'search') {
    return { rightSidebarTab: 'explorer', rightSidebarExplorerView: 'search' }
  }
  // A plugin-contributed tab (`plugin:<id>`). The sidebar registry decides
  // whether it is still active and falls back to a default tab if not.
  if (typeof tab === 'string' && tab.startsWith('plugin:')) {
    return { rightSidebarTab: tab as ActiveRightSidebarTab, rightSidebarExplorerView: 'files' }
  }
  if (
    tab === 'explorer' ||
    tab === 'vault' ||
    tab === 'workspaces' ||
    tab === 'pr-checks' ||
    tab === 'source-control' ||
    tab === 'checks' ||
    tab === 'ports'
  ) {
    return {
      rightSidebarTab: tab,
      rightSidebarExplorerView:
        tab === 'explorer' ? normalizeRightSidebarExplorerView(explorerView) : 'files'
    }
  }
  return { rightSidebarTab: 'explorer', rightSidebarExplorerView: 'files' }
}
