import { BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type {
  DetachedTerminalOpenSnapshot,
  DetachedTerminalSnapshot
} from '../../shared/detached-terminal-window'
import type { TerminalPaneLayoutNode } from '../../shared/types'
import { makePaneKey } from '../../shared/stable-pane-id'
import { getPtyIdForPaneKey } from '../ipc/pty'
import { getAppIconPath } from '../app-icon'
import { detachedWindowRegistry, type DetachedWindowKey } from './detached-window-registry'
import { trustedRendererRegistry } from './trusted-renderer-registry'
import { paneOwnershipRegistry } from './pane-ownership-registry'

type OpenDetachedTerminalWindowArgs = {
  worktreeId: string
  tabId: string
  snapshot: DetachedTerminalOpenSnapshot
}

type DetachedTerminalOpenResult =
  | { ok: true }
  | { ok: false; error: 'invalid_payload' | 'detached_terminal_tab_unavailable' }

type ValidatedDetachedSnapshot = {
  snapshot: DetachedTerminalSnapshot
  paneKeysByPtyId: Map<string, string>
}

function normalizeId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function collectLeafIds(
  node: TerminalPaneLayoutNode | null | undefined,
  leafIds: string[] = []
): string[] {
  if (!node) {
    return leafIds
  }
  if (node.type === 'leaf') {
    leafIds.push(node.leafId)
    return leafIds
  }
  collectLeafIds(node.first, leafIds)
  collectLeafIds(node.second, leafIds)
  return leafIds
}

function layoutContainsGroup(
  node: DetachedTerminalOpenSnapshot['groupLayout'],
  groupId: string
): boolean {
  if (node.type === 'leaf') {
    return node.groupId === groupId
  }
  return layoutContainsGroup(node.first, groupId) || layoutContainsGroup(node.second, groupId)
}

function validateDetachedTerminalSnapshot(
  worktreeId: string,
  tabId: string,
  snapshot: DetachedTerminalOpenSnapshot
): ValidatedDetachedSnapshot | null {
  if (
    snapshot.worktree.id !== worktreeId ||
    snapshot.terminalTab.id !== tabId ||
    snapshot.terminalTab.worktreeId !== worktreeId ||
    snapshot.unifiedTab.entityId !== tabId ||
    snapshot.unifiedTab.worktreeId !== worktreeId ||
    snapshot.unifiedTab.contentType !== 'terminal' ||
    snapshot.unifiedTab.groupId !== snapshot.group.id ||
    snapshot.group.worktreeId !== worktreeId ||
    snapshot.group.activeTabId !== snapshot.unifiedTab.id ||
    snapshot.activeGroupId !== snapshot.group.id ||
    snapshot.activeTabId !== snapshot.unifiedTab.id ||
    !layoutContainsGroup(snapshot.groupLayout, snapshot.group.id)
  ) {
    return null
  }

  const layout = snapshot.terminalLayout
  const leafIds = collectLeafIds(layout.root)
  const leafIdSet = new Set(leafIds)
  const ptyIdsByLeafId = layout.ptyIdsByLeafId ?? {}
  const validatedPtyIds: string[] = []
  const paneKeysByPtyId = new Map<string, string>()

  for (const [leafId, ptyId] of Object.entries(ptyIdsByLeafId)) {
    if (!leafIdSet.has(leafId) || !ptyId) {
      return null
    }
    const paneKey = makePaneKey(tabId, leafId)
    if (getPtyIdForPaneKey(paneKey) !== ptyId) {
      return null
    }
    if (!validatedPtyIds.includes(ptyId)) {
      validatedPtyIds.push(ptyId)
      paneKeysByPtyId.set(ptyId, paneKey)
    }
  }

  if (snapshot.terminalTab.ptyId && !validatedPtyIds.includes(snapshot.terminalTab.ptyId)) {
    if (leafIds.length !== 1) {
      return null
    }
    const leafId = leafIds[0]
    const paneKey = makePaneKey(tabId, leafId)
    if (getPtyIdForPaneKey(paneKey) !== snapshot.terminalTab.ptyId) {
      return null
    }
    validatedPtyIds.push(snapshot.terminalTab.ptyId)
    paneKeysByPtyId.set(snapshot.terminalTab.ptyId, paneKey)
  }

  if (validatedPtyIds.length === 0) {
    return null
  }

  return {
    snapshot: { ...snapshot, ptyIds: validatedPtyIds },
    paneKeysByPtyId
  }
}

function senderCanDetachPty(sender: Electron.WebContents, ptyId: string): boolean {
  return (
    trustedRendererRegistry.has(sender.id, 'pty') &&
    !sender.isDestroyed?.() &&
    paneOwnershipRegistry.senderOwnsPty(sender, ptyId)
  )
}

function senderCanDetachSnapshot(
  sender: Electron.WebContents,
  validated: ValidatedDetachedSnapshot
): boolean {
  return validated.snapshot.ptyIds.every((ptyId) => senderCanDetachPty(sender, ptyId))
}

function loadDetachedTerminalWindow(window: BrowserWindow, key: DetachedWindowKey): void {
  const query = {
    mode: 'detached-terminal',
    worktreeId: key.worktreeId,
    tabId: key.tabId
  }
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, value)
    }
    void window.loadURL(url.toString())
    return
  }
  void window.loadFile(join(__dirname, '../renderer/index.html'), { query })
}

export function openDetachedTerminalWindow({
  worktreeId,
  tabId,
  snapshot
}: OpenDetachedTerminalWindowArgs): BrowserWindow {
  const key = { worktreeId, tabId }
  const existing = detachedWindowRegistry.getDetachedTerminalWindow(key)
  if (existing) {
    detachedWindowRegistry.focusDetachedTerminalWindow(key)
    return existing
  }

  const validated = validateDetachedTerminalSnapshot(worktreeId, tabId, snapshot)
  if (!validated) {
    throw new Error('detached_terminal_tab_unavailable')
  }

  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    title: snapshot.terminalTab.title || 'Terminal',
    show: false,
    acceptFirstMouse: true,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
    titleBarStyle:
      process.platform === 'darwin'
        ? 'hiddenInset'
        : process.platform === 'win32'
          ? 'hidden'
          : undefined,
    ...(process.platform === 'linux' ? { frame: false } : {}),
    icon: getAppIconPath(snapshot.settings?.appIcon),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      webviewTag: false
    }
  })

  const webContentsId = window.webContents.id
  trustedRendererRegistry.grantMany(webContentsId, ['ui', 'clipboard', 'pty'])
  detachedWindowRegistry.registerDetachedTerminalWindow(key, window, validated.snapshot)

  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) {
      window.show()
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  loadDetachedTerminalWindow(window, key)
  return window
}

export function registerDetachedTerminalHandlers(): void {
  ipcMain.removeHandler('detachedTerminal:openWindow')
  ipcMain.removeHandler('detachedTerminal:getSnapshot')
  ipcMain.removeHandler('detachedTerminal:closeWindow')
  ipcMain.removeHandler('detachedTerminal:rendererPtyReady')

  ipcMain.handle(
    'detachedTerminal:openWindow',
    (event, args: OpenDetachedTerminalWindowArgs): DetachedTerminalOpenResult => {
      const worktreeId = normalizeId(args?.worktreeId)
      const tabId = normalizeId(args?.tabId)
      if (!worktreeId || !tabId || !args?.snapshot) {
        return { ok: false, error: 'invalid_payload' }
      }
      const key = { worktreeId, tabId }
      const existing = detachedWindowRegistry.getDetachedTerminalWindow(key)
      if (existing) {
        const senderId = event.sender.id
        if (
          existing.webContents.id === senderId ||
          paneOwnershipRegistry.isPrimaryAppWebContentsId(senderId)
        ) {
          detachedWindowRegistry.focusDetachedTerminalWindow(key)
          return { ok: true }
        }
        return { ok: false, error: 'detached_terminal_tab_unavailable' }
      }
      const validated = validateDetachedTerminalSnapshot(worktreeId, tabId, args.snapshot)
      if (!validated || !senderCanDetachSnapshot(event.sender, validated)) {
        return { ok: false, error: 'detached_terminal_tab_unavailable' }
      }
      try {
        openDetachedTerminalWindow({ worktreeId, tabId, snapshot: args.snapshot })
        return { ok: true }
      } catch (error) {
        if (error instanceof Error && error.message === 'detached_terminal_tab_unavailable') {
          return { ok: false, error: 'detached_terminal_tab_unavailable' }
        }
        throw error
      }
    }
  )

  ipcMain.handle(
    'detachedTerminal:getSnapshot',
    (event, args: { worktreeId?: unknown; tabId?: unknown }): DetachedTerminalSnapshot => {
      const worktreeId = normalizeId(args?.worktreeId)
      const tabId = normalizeId(args?.tabId)
      if (!worktreeId || !tabId) {
        throw new Error('invalid_payload')
      }
      const key = { worktreeId, tabId }
      const window = detachedWindowRegistry.getDetachedTerminalWindow(key)
      const snapshot = detachedWindowRegistry.getDetachedTerminalSnapshot(key)
      if (!window || !snapshot || window.webContents.id !== event.sender.id) {
        throw new Error('detached_terminal_tab_unavailable')
      }
      return snapshot
    }
  )

  ipcMain.handle(
    'detachedTerminal:closeWindow',
    (event, args: { worktreeId?: unknown; tabId?: unknown }): { ok: true } => {
      const worktreeId = normalizeId(args?.worktreeId)
      const tabId = normalizeId(args?.tabId)
      if (worktreeId && tabId) {
        const key = { worktreeId, tabId }
        const window = detachedWindowRegistry.getDetachedTerminalWindow(key)
        const senderId = event.sender.id
        if (
          window &&
          (window.webContents.id === senderId ||
            paneOwnershipRegistry.isPrimaryAppWebContentsId(senderId))
        ) {
          detachedWindowRegistry.closeDetachedTerminalWindow(key)
        }
      }
      return { ok: true }
    }
  )

  ipcMain.handle(
    'detachedTerminal:rendererPtyReady',
    (event, args: { worktreeId?: unknown; tabId?: unknown; ptyId?: unknown }): { ok: true } => {
      const worktreeId = normalizeId(args?.worktreeId)
      const tabId = normalizeId(args?.tabId)
      const ptyId = normalizeId(args?.ptyId)
      if (!worktreeId || !tabId || !ptyId) {
        return { ok: true }
      }
      const key = { worktreeId, tabId }
      const window = detachedWindowRegistry.getDetachedTerminalWindow(key)
      const snapshot = detachedWindowRegistry.getDetachedTerminalSnapshot(key)
      if (!window || !snapshot || window.webContents.id !== event.sender.id) {
        return { ok: true }
      }
      if (!snapshot.ptyIds.includes(ptyId)) {
        return { ok: true }
      }
      const leafEntry = Object.entries(snapshot.terminalLayout.ptyIdsByLeafId ?? {}).find(
        ([, candidatePtyId]) => candidatePtyId === ptyId
      )
      const paneKey = leafEntry ? makePaneKey(tabId, leafEntry[0]) : null
      paneOwnershipRegistry.registerPaneOwner({
        webContentsId: event.sender.id,
        ptyId,
        paneKey,
        worktreeId,
        tabId
      })
      return { ok: true }
    }
  )
}
