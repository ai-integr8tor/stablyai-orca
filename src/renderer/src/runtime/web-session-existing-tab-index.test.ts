import { describe, expect, it } from 'vitest'
import type { BrowserPage, BrowserWorkspace, Tab } from '../../../shared/types'
import type { OpenFile } from '../store/slices/editor'
import { buildWebSessionExistingTabIndex } from './web-session-existing-tab-index'

const WT = 'repo::/worktree'
const ENV = 'remote-env'

function makeFile(id: string, worktreeId = WT): OpenFile {
  return {
    id,
    filePath: id,
    relativePath: id,
    worktreeId,
    language: 'typescript',
    isDirty: false,
    mode: 'edit'
  }
}

function makeTab(id: string, entityId: string, contentType: 'editor' | 'browser'): Tab {
  return {
    id,
    entityId,
    groupId: 'group-1',
    worktreeId: WT,
    contentType,
    label: id,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

function makeWorkspace(id: string): BrowserWorkspace {
  return {
    id,
    worktreeId: WT,
    url: 'https://example.com',
    title: id,
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 1
  }
}

function makePage(id: string, workspaceId: string): BrowserPage {
  return {
    id,
    workspaceId,
    worktreeId: WT,
    url: 'https://example.com',
    title: id,
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 1
  }
}

describe('buildWebSessionExistingTabIndex', () => {
  it('preserves first-match editor lookup behavior across both accepted keys', () => {
    const firstFile = makeFile('/repo/file.ts')
    const firstByFileId = makeTab('older-host-id', firstFile.id, 'editor')
    const laterByHostId = makeTab('current-host-id', '/repo/other.ts', 'editor')
    const index = buildWebSessionExistingTabIndex({
      worktreeId: WT,
      environmentId: ENV,
      openFiles: [makeFile(firstFile.id, 'other-worktree'), firstFile, makeFile(firstFile.id)],
      unifiedTabs: [firstByFileId, laterByHostId],
      browserWorkspaces: [],
      browserPagesByWorkspace: {},
      remoteBrowserPageHandlesByPageId: {}
    })

    expect(index.getEditorFile(firstFile.id)).toBe(firstFile)
    expect(index.getEditorUnifiedTab(firstFile.id, laterByHostId.id)).toBe(firstByFileId)
    expect(index.getEditorUnifiedTab(laterByHostId.entityId, firstByFileId.id)).toBe(firstByFileId)
  })

  it('preserves the first matching browser workspace, page, and unified tab', () => {
    const firstWorkspace = makeWorkspace('workspace-1')
    const laterWorkspace = makeWorkspace('workspace-2')
    const firstPage = makePage('page-1', firstWorkspace.id)
    const laterPage = makePage('page-2', laterWorkspace.id)
    const firstUnifiedTab = makeTab('browser-tab-1', firstWorkspace.id, 'browser')
    const duplicateUnifiedTab = makeTab('browser-tab-duplicate', firstWorkspace.id, 'browser')
    const index = buildWebSessionExistingTabIndex({
      worktreeId: WT,
      environmentId: ENV,
      openFiles: [],
      unifiedTabs: [firstUnifiedTab, duplicateUnifiedTab],
      browserWorkspaces: [firstWorkspace, laterWorkspace],
      browserPagesByWorkspace: {
        [firstWorkspace.id]: [firstPage],
        [laterWorkspace.id]: [laterPage]
      },
      remoteBrowserPageHandlesByPageId: {
        [firstPage.id]: { environmentId: ENV, remotePageId: 'remote-page' },
        [laterPage.id]: { environmentId: ENV, remotePageId: 'remote-page' }
      }
    })

    expect(index.getBrowserTab('remote-page')).toEqual({
      workspace: firstWorkspace,
      page: firstPage,
      unifiedTab: firstUnifiedTab
    })
  })
})
