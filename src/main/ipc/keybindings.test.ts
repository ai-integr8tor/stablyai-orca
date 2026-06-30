import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeybindingFileSnapshot } from '../../shared/keybindings'

const {
  authorizeExternalPathMock,
  getAppWindowsMock,
  handleMock,
  openPathMock,
  rebuildAppMenuMock,
  showItemInFolderMock
} = vi.hoisted(() => ({
  authorizeExternalPathMock: vi.fn(),
  getAppWindowsMock: vi.fn(() => []),
  handleMock: vi.fn(),
  openPathMock: vi.fn(),
  rebuildAppMenuMock: vi.fn(),
  showItemInFolderMock: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: {},
  ipcMain: {
    handle: handleMock
  },
  shell: {
    openPath: openPathMock,
    showItemInFolder: showItemInFolderMock
  }
}))

vi.mock('./filesystem-auth', () => ({
  authorizeExternalPath: authorizeExternalPathMock
}))

vi.mock('../menu/register-app-menu', () => ({
  rebuildAppMenu: rebuildAppMenuMock
}))

vi.mock('../window/detached-window-registry', () => ({
  detachedWindowRegistry: {
    getAppWindows: getAppWindowsMock
  }
}))

import { registerKeybindingHandlers } from './keybindings'

const snapshot: KeybindingFileSnapshot = {
  path: '/Users/example/.orca/keybindings.json',
  platform: 'darwin',
  exists: true,
  overrides: {},
  commonOverrides: {},
  platformOverrides: {},
  diagnostics: []
}

function getHandler(channel: string): (...args: unknown[]) => unknown {
  const call = handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel)
  if (!call) {
    throw new Error(`No handler registered for ${channel}`)
  }
  return call[1] as (...args: unknown[]) => unknown
}

describe('registerKeybindingHandlers', () => {
  beforeEach(() => {
    authorizeExternalPathMock.mockReset()
    getAppWindowsMock.mockReturnValue([])
    handleMock.mockReset()
    openPathMock.mockReset()
    rebuildAppMenuMock.mockReset()
    showItemInFolderMock.mockReset()
  })

  it('authorizes the keybindings file for in-app editing when ensuring it exists', () => {
    registerKeybindingHandlers({ ensureFile: vi.fn(() => snapshot) } as never)

    expect(getHandler('keybindings:ensureFile')()).toBe(snapshot)
    expect(authorizeExternalPathMock).toHaveBeenCalledWith(snapshot.path)
  })

  it('authorizes the keybindings file before opening it outside Orca', async () => {
    openPathMock.mockResolvedValue('')
    registerKeybindingHandlers({ ensureFile: vi.fn(() => snapshot) } as never)

    await expect(getHandler('keybindings:openFile')()).resolves.toBe(snapshot)
    expect(authorizeExternalPathMock).toHaveBeenCalledWith(snapshot.path)
    expect(openPathMock).toHaveBeenCalledWith(snapshot.path)
  })

  it('broadcasts keybinding changes only to registered app windows', () => {
    const appSend = vi.fn()
    const offscreenSend = vi.fn()
    getAppWindowsMock.mockReturnValue([
      { isDestroyed: () => false, webContents: { send: appSend } },
      { isDestroyed: () => true, webContents: { send: offscreenSend } }
    ] as never)
    const service = {
      setActionBindings: vi.fn(() => snapshot)
    }
    registerKeybindingHandlers(service as never)

    getHandler('keybindings:setAction')({}, { actionId: 'newTerminal', bindings: ['Cmd+T'] })

    expect(appSend).toHaveBeenCalledWith('keybindings:changed', snapshot)
    expect(offscreenSend).not.toHaveBeenCalled()
    expect(getAppWindowsMock).toHaveBeenCalled()
  })
})
