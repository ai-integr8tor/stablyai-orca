import type { BrowserPage, BrowserWorkspace, Tab } from '../../../shared/types'
import type { OpenFile } from '../store/slices/editor'

type PositionedTab = {
  position: number
  tab: Tab
}

export type ExistingBrowserTab = {
  workspace: BrowserWorkspace
  page: BrowserPage
  unifiedTab: Tab | null
}

export type WebSessionExistingTabIndex = {
  getEditorFile: (fileId: string) => OpenFile | undefined
  getEditorUnifiedTab: (fileId: string, hostTabId: string) => Tab | null
  getBrowserTab: (remotePageId: string) => ExistingBrowserTab | null
}

type BuildWebSessionExistingTabIndexArgs = {
  worktreeId: string
  environmentId: string
  openFiles: readonly OpenFile[]
  unifiedTabs: readonly Tab[]
  browserWorkspaces: readonly BrowserWorkspace[]
  browserPagesByWorkspace: Readonly<Record<string, readonly BrowserPage[]>>
  remoteBrowserPageHandlesByPageId: Readonly<
    Record<string, { environmentId: string; remotePageId: string }>
  >
}

function setFirst<K, V>(map: Map<K, V>, key: K, value: V): void {
  if (!map.has(key)) {
    map.set(key, value)
  }
}

export function buildWebSessionExistingTabIndex({
  worktreeId,
  environmentId,
  openFiles,
  unifiedTabs,
  browserWorkspaces,
  browserPagesByWorkspace,
  remoteBrowserPageHandlesByPageId
}: BuildWebSessionExistingTabIndexArgs): WebSessionExistingTabIndex {
  let editorFileById: Map<string, OpenFile> | null = null
  const getEditorFileById = (): Map<string, OpenFile> => {
    if (!editorFileById) {
      editorFileById = new Map<string, OpenFile>()
      for (const file of openFiles) {
        if (file.worktreeId === worktreeId) {
          setFirst(editorFileById, file.id, file)
        }
      }
    }
    return editorFileById
  }

  let unifiedTabIndexes: {
    editorTabById: Map<string, PositionedTab>
    editorTabByFileId: Map<string, PositionedTab>
    browserTabByWorkspaceId: Map<string, Tab>
  } | null = null
  const getUnifiedTabIndexes = (): NonNullable<typeof unifiedTabIndexes> => {
    if (!unifiedTabIndexes) {
      const editorTabById = new Map<string, PositionedTab>()
      const editorTabByFileId = new Map<string, PositionedTab>()
      const browserTabByWorkspaceId = new Map<string, Tab>()
      unifiedTabs.forEach((tab, position) => {
        if (tab.contentType === 'editor') {
          const positioned = { position, tab }
          setFirst(editorTabById, tab.id, positioned)
          setFirst(editorTabByFileId, tab.entityId, positioned)
        } else if (tab.contentType === 'browser') {
          setFirst(browserTabByWorkspaceId, tab.entityId, tab)
        }
      })
      unifiedTabIndexes = { editorTabById, editorTabByFileId, browserTabByWorkspaceId }
    }
    return unifiedTabIndexes
  }

  let browserTabByRemotePageId: Map<string, ExistingBrowserTab> | null = null
  const getBrowserTabByRemotePageId = (): Map<string, ExistingBrowserTab> => {
    if (!browserTabByRemotePageId) {
      browserTabByRemotePageId = new Map<string, ExistingBrowserTab>()
      const { browserTabByWorkspaceId } = getUnifiedTabIndexes()
      for (const workspace of browserWorkspaces) {
        for (const page of browserPagesByWorkspace[workspace.id] ?? []) {
          const handle = remoteBrowserPageHandlesByPageId[page.id]
          if (handle?.environmentId !== environmentId) {
            continue
          }
          setFirst(browserTabByRemotePageId, handle.remotePageId, {
            workspace,
            page,
            unifiedTab: browserTabByWorkspaceId.get(workspace.id) ?? null
          })
        }
      }
    }
    return browserTabByRemotePageId
  }

  return {
    // Why: terminal-only snapshots are common, so each linear setup pass stays
    // lazy until a mirrored editor or browser surface actually needs it.
    getEditorFile: (fileId) => getEditorFileById().get(fileId),
    getEditorUnifiedTab: (fileId, hostTabId) => {
      const { editorTabById, editorTabByFileId } = getUnifiedTabIndexes()
      const byHostId = editorTabById.get(hostTabId)
      const byFileId = editorTabByFileId.get(fileId)
      // Why: the former Array.find accepted either key, so duplicate legacy
      // entries must still resolve to whichever candidate appeared first.
      if (byHostId && byFileId) {
        return byHostId.position <= byFileId.position ? byHostId.tab : byFileId.tab
      }
      return byHostId?.tab ?? byFileId?.tab ?? null
    },
    getBrowserTab: (remotePageId) => getBrowserTabByRemotePageId().get(remotePageId) ?? null
  }
}
