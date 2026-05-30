/* eslint-disable max-lines -- Why: relay session tests need one shared mocked
provider/multiplexer harness to cover establish, reconnect, detach, and dispose
state transitions without duplicating brittle setup. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SshRelaySession } from './ssh-relay-session'
import type { SshConnection } from './ssh-connection'
import type { Store } from '../persistence'
import type { SshPortForwardManager } from './ssh-port-forward'
import { AGENT_HOOK_INSTALL_PLUGINS_METHOD } from '../../shared/agent-hook-relay'
import { SSH_RELAY_CONFIGURE_GRACE_TIME_METHOD } from '../../shared/ssh-types'
import { REMOTE_CODEX_RUNTIME_HOME_CONFIGURE_METHOD } from '../../shared/remote-codex-home'

const {
  muxRequestMock,
  installRemoteManagedAgentHooksMock,
  cleanupLegacyRemoteCodexSystemHooksMock
} = vi.hoisted(() => ({
  muxRequestMock: vi.fn(),
  installRemoteManagedAgentHooksMock: vi.fn(),
  cleanupLegacyRemoteCodexSystemHooksMock: vi.fn()
}))

vi.mock('./ssh-relay-deploy', () => ({
  deployAndLaunchRelay: vi.fn()
}))

vi.mock('./ssh-channel-multiplexer', () => {
  return {
    SshChannelMultiplexer: class MockSshChannelMultiplexer {
      notify = vi.fn()
      request = muxRequestMock
      onNotification = vi.fn().mockReturnValue(() => {})
      onDispose = vi.fn().mockReturnValue(() => {})
      dispose = vi.fn()
      isDisposed = vi.fn().mockReturnValue(false)
    }
  }
})

vi.mock('../agent-hooks/remote-managed-hook-installers', () => ({
  installRemoteManagedAgentHooks: installRemoteManagedAgentHooksMock
}))

vi.mock('../codex/hook-service', () => ({
  cleanupLegacyRemoteCodexSystemHooks: cleanupLegacyRemoteCodexSystemHooksMock
}))

vi.mock('../providers/ssh-pty-provider', () => ({
  isSshPtyNotFoundError: (err: unknown) =>
    (err instanceof Error ? err.message : String(err)).includes('not found'),
  SshPtyProvider: class MockSshPtyProvider {
    onData = vi.fn().mockReturnValue(() => {})
    onReplay = vi.fn().mockReturnValue(() => {})
    onExit = vi.fn().mockReturnValue(() => {})
    attach = vi.fn().mockResolvedValue(undefined)
    dispose = vi.fn()
  }
}))

vi.mock('../providers/ssh-filesystem-provider', () => ({
  SshFilesystemProvider: class MockSshFilesystemProvider {
    dispose = vi.fn()
  }
}))

vi.mock('../providers/ssh-git-provider', () => ({
  SshGitProvider: class MockSshGitProvider {}
}))

vi.mock('../ipc/pty', () => ({
  registerSshPtyProvider: vi.fn(),
  unregisterSshPtyProvider: vi.fn(),
  getSshPtyProvider: vi.fn().mockReturnValue({
    dispose: vi.fn(),
    attach: vi.fn().mockResolvedValue(undefined)
  }),
  getPtyIdsForConnection: vi.fn().mockReturnValue([]),
  clearPtyOwnershipForConnection: vi.fn(),
  clearProviderPtyState: vi.fn(),
  deletePtyOwnership: vi.fn(),
  setPtyOwnership: vi.fn()
}))

vi.mock('../providers/ssh-filesystem-dispatch', () => ({
  registerSshFilesystemProvider: vi.fn(),
  unregisterSshFilesystemProvider: vi.fn(),
  getSshFilesystemProvider: vi.fn().mockReturnValue({ dispose: vi.fn() })
}))

vi.mock('../providers/ssh-git-dispatch', () => ({
  registerSshGitProvider: vi.fn(),
  unregisterSshGitProvider: vi.fn()
}))

const { deployAndLaunchRelay } = await import('./ssh-relay-deploy')
const {
  registerSshPtyProvider,
  unregisterSshPtyProvider,
  getPtyIdsForConnection,
  clearProviderPtyState,
  deletePtyOwnership,
  setPtyOwnership
} = await import('../ipc/pty')
const { registerSshFilesystemProvider, unregisterSshFilesystemProvider } =
  await import('../providers/ssh-filesystem-dispatch')
const { registerSshGitProvider, unregisterSshGitProvider } =
  await import('../providers/ssh-git-dispatch')

function createMockDeps() {
  const mockConn = {} as SshConnection
  const mockStore = {
    getRepos: vi.fn().mockReturnValue([]),
    getSshRemotePtyLeases: vi.fn().mockReturnValue([]),
    markSshRemotePtyLease: vi.fn(),
    markSshRemotePtyLeases: vi.fn()
  } as unknown as Store
  const mockPortForward = {
    removeAllForwards: vi.fn()
  } as unknown as SshPortForwardManager
  const mockWindow = {
    isDestroyed: () => false,
    webContents: { send: vi.fn() }
  }
  const getMainWindow = vi.fn().mockReturnValue(mockWindow)
  return { mockConn, mockStore, mockPortForward, getMainWindow, mockWindow }
}

function mockDeploySuccess() {
  const mockTransport = {
    write: vi.fn(),
    onData: vi.fn(),
    onClose: vi.fn()
  }
  vi.mocked(deployAndLaunchRelay).mockResolvedValue({
    transport: mockTransport,
    platform: 'linux-x64'
  })
}

describe('SshRelaySession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ORCA_FEATURE_REMOTE_AGENT_HOOKS
    muxRequestMock.mockReset()
    muxRequestMock.mockResolvedValue([])
    installRemoteManagedAgentHooksMock.mockReset()
    installRemoteManagedAgentHooksMock.mockResolvedValue([])
    cleanupLegacyRemoteCodexSystemHooksMock.mockReset()
    cleanupLegacyRemoteCodexSystemHooksMock.mockResolvedValue(undefined)
    mockDeploySuccess()
    vi.mocked(getPtyIdsForConnection).mockReturnValue([])
  })

  it('starts in idle state', () => {
    const { mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)
    expect(session.getState()).toBe('idle')
    expect(session.getMux()).toBeNull()
  })

  it('transitions idle → deploying → ready on establish', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await session.establish(mockConn)

    expect(session.getState()).toBe('ready')
    expect(session.getMux()).not.toBeNull()
    expect(registerSshPtyProvider).toHaveBeenCalledWith('target-1', expect.anything())
    expect(registerSshFilesystemProvider).toHaveBeenCalledWith('target-1', expect.anything())
    expect(registerSshGitProvider).toHaveBeenCalledWith('target-1', expect.anything())
  })

  it('installs remote managed hooks and relay-owned plugin assets before registering the SSH PTY provider', async () => {
    process.env.ORCA_FEATURE_REMOTE_AGENT_HOOKS = '1'
    installRemoteManagedAgentHooksMock.mockResolvedValue([
      {
        agent: 'codex',
        state: 'installed',
        configPath: '/home/orca/.orca/codex-runtime-home/home/hooks.json',
        managedHooksPresent: true,
        detail: null
      }
    ])
    muxRequestMock.mockImplementation(async (method: string) => {
      if (method === 'session.resolveHome') {
        return { resolvedPath: '/home/orca' }
      }
      return { ok: true }
    })
    const sftp = { end: vi.fn() }
    const { mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const mockConn = {
      sftp: vi.fn().mockResolvedValue(sftp)
    } as unknown as SshConnection
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await session.establish(mockConn)

    const installPluginsCallIndex = muxRequestMock.mock.calls.findIndex(
      ([method]) => method === AGENT_HOOK_INSTALL_PLUGINS_METHOD
    )
    const codexRuntimeConfigCalls = muxRequestMock.mock.calls.filter(
      ([method]) => method === REMOTE_CODEX_RUNTIME_HOME_CONFIGURE_METHOD
    )
    expect(installPluginsCallIndex).toBeGreaterThanOrEqual(0)
    const installPluginsParams = muxRequestMock.mock.calls[installPluginsCallIndex]?.[1]
    expect(installPluginsParams).toMatchObject({
      piExtensionSource: expect.stringContaining('/hook/pi'),
      ompExtensionSource: expect.stringContaining('/hook/omp')
    })
    expect(mockConn.sftp).toHaveBeenCalledTimes(1)
    expect(installRemoteManagedAgentHooksMock).toHaveBeenCalledWith(sftp, '/home/orca')
    expect(codexRuntimeConfigCalls).toEqual([
      [REMOTE_CODEX_RUNTIME_HOME_CONFIGURE_METHOD, { codexHomePath: null }],
      [
        REMOTE_CODEX_RUNTIME_HOME_CONFIGURE_METHOD,
        { codexHomePath: '/home/orca/.orca/codex-runtime-home/home' }
      ]
    ])
    expect(sftp.end).toHaveBeenCalledTimes(1)
    const firstCodexRuntimeConfigCallIndex = muxRequestMock.mock.calls.findIndex(
      ([method]) => method === REMOTE_CODEX_RUNTIME_HOME_CONFIGURE_METHOD
    )
    expect(muxRequestMock.mock.invocationCallOrder[firstCodexRuntimeConfigCallIndex]).toBeLessThan(
      installRemoteManagedAgentHooksMock.mock.invocationCallOrder[0]
    )
    expect(installRemoteManagedAgentHooksMock.mock.invocationCallOrder[0]).toBeLessThan(
      muxRequestMock.mock.invocationCallOrder[installPluginsCallIndex]
    )
    expect(muxRequestMock.mock.invocationCallOrder[installPluginsCallIndex]).toBeLessThan(
      vi.mocked(registerSshPtyProvider).mock.invocationCallOrder[0]
    )
  })

  it('disables relay Codex runtime home before remote hook prep can fail', async () => {
    process.env.ORCA_FEATURE_REMOTE_AGENT_HOOKS = '1'
    let resolveHomeCalls = 0
    muxRequestMock.mockImplementation(async (method: string) => {
      if (method === REMOTE_CODEX_RUNTIME_HOME_CONFIGURE_METHOD) {
        return { codexHomePath: null }
      }
      if (method === 'session.resolveHome') {
        resolveHomeCalls += 1
        if (resolveHomeCalls === 1) {
          return { resolvedPath: '/home/orca' }
        }
        throw new Error('home unavailable')
      }
      return { ok: true }
    })
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await session.establish(mockConn)

    expect(muxRequestMock).toHaveBeenCalledWith(REMOTE_CODEX_RUNTIME_HOME_CONFIGURE_METHOD, {
      codexHomePath: null
    })
    expect(installRemoteManagedAgentHooksMock).not.toHaveBeenCalled()
    expect(registerSshPtyProvider).toHaveBeenCalledWith('target-1', expect.anything())
  })

  it('leaves relay Codex runtime home disabled when remote Codex hook install fails', async () => {
    process.env.ORCA_FEATURE_REMOTE_AGENT_HOOKS = '1'
    installRemoteManagedAgentHooksMock.mockResolvedValue([
      {
        agent: 'codex',
        state: 'error',
        configPath: '/home/orca/.orca/codex-runtime-home/home/hooks.json',
        managedHooksPresent: false,
        detail: 'trust write failed'
      }
    ])
    muxRequestMock.mockImplementation(async (method: string) => {
      if (method === 'session.resolveHome') {
        return { resolvedPath: '/home/orca' }
      }
      return { ok: true }
    })
    const sftp = { end: vi.fn() }
    const { mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const mockConn = {
      sftp: vi.fn().mockResolvedValue(sftp)
    } as unknown as SshConnection
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await session.establish(mockConn)

    const codexRuntimeConfigCalls = muxRequestMock.mock.calls.filter(
      ([method]) => method === REMOTE_CODEX_RUNTIME_HOME_CONFIGURE_METHOD
    )
    expect(codexRuntimeConfigCalls).toEqual([
      [REMOTE_CODEX_RUNTIME_HOME_CONFIGURE_METHOD, { codexHomePath: null }]
    ])
    expect(registerSshPtyProvider).toHaveBeenCalledWith('target-1', expect.anything())
  })

  it('cleans legacy remote Codex hooks without reinstalling when status hooks are disabled', async () => {
    process.env.ORCA_FEATURE_REMOTE_AGENT_HOOKS = '1'
    muxRequestMock.mockImplementation(async (method: string) => {
      if (method === 'session.resolveHome') {
        return { resolvedPath: '/home/orca' }
      }
      return { ok: true }
    })
    const sftp = { end: vi.fn() }
    const { mockStore, mockPortForward, getMainWindow } = createMockDeps()
    ;(
      mockStore as unknown as { getSettings: () => { agentStatusHooksEnabled: boolean } }
    ).getSettings = vi.fn(() => ({ agentStatusHooksEnabled: false }))
    const mockConn = {
      sftp: vi.fn().mockResolvedValue(sftp)
    } as unknown as SshConnection
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await session.establish(mockConn)

    expect(cleanupLegacyRemoteCodexSystemHooksMock).toHaveBeenCalledWith(sftp, '/home/orca')
    expect(installRemoteManagedAgentHooksMock).not.toHaveBeenCalled()
    expect(registerSshPtyProvider).toHaveBeenCalledWith('target-1', expect.anything())
  })

  it('does not register providers when disabled-hook remote Codex cleanup fails', async () => {
    process.env.ORCA_FEATURE_REMOTE_AGENT_HOOKS = '1'
    cleanupLegacyRemoteCodexSystemHooksMock.mockRejectedValue(new Error('cleanup failed'))
    muxRequestMock.mockImplementation(async (method: string) => {
      if (method === 'session.resolveHome') {
        return { resolvedPath: '/home/orca' }
      }
      return { ok: true }
    })
    const sftp = { end: vi.fn() }
    const { mockStore, mockPortForward, getMainWindow } = createMockDeps()
    ;(
      mockStore as unknown as { getSettings: () => { agentStatusHooksEnabled: boolean } }
    ).getSettings = vi.fn(() => ({ agentStatusHooksEnabled: false }))
    const mockConn = {
      sftp: vi.fn().mockResolvedValue(sftp)
    } as unknown as SshConnection
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await expect(session.establish(mockConn)).rejects.toThrow('cleanup failed')

    expect(registerSshPtyProvider).not.toHaveBeenCalled()
  })

  it('does not register providers when stale relay Codex runtime home cannot be cleared', async () => {
    process.env.ORCA_FEATURE_REMOTE_AGENT_HOOKS = '1'
    muxRequestMock.mockImplementation(async (method: string) => {
      if (method === 'session.resolveHome') {
        return { resolvedPath: '/home/orca' }
      }
      if (method === REMOTE_CODEX_RUNTIME_HOME_CONFIGURE_METHOD) {
        throw new Error('configure failed')
      }
      return { ok: true }
    })
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await expect(session.establish(mockConn)).rejects.toThrow('configure failed')

    expect(installRemoteManagedAgentHooksMock).not.toHaveBeenCalled()
    expect(registerSshPtyProvider).not.toHaveBeenCalled()
  })

  it('does not register providers when relay Codex runtime home cannot be enabled', async () => {
    process.env.ORCA_FEATURE_REMOTE_AGENT_HOOKS = '1'
    installRemoteManagedAgentHooksMock.mockResolvedValue([
      {
        agent: 'codex',
        state: 'installed',
        configPath: '/home/orca/.orca/codex-runtime-home/home/hooks.json',
        managedHooksPresent: true,
        detail: null
      }
    ])
    let configureCalls = 0
    muxRequestMock.mockImplementation(async (method: string) => {
      if (method === 'session.resolveHome') {
        return { resolvedPath: '/home/orca' }
      }
      if (method === REMOTE_CODEX_RUNTIME_HOME_CONFIGURE_METHOD) {
        configureCalls += 1
        if (configureCalls === 2) {
          throw new Error('enable failed')
        }
        return { codexHomePath: null }
      }
      return { ok: true }
    })
    const sftp = { end: vi.fn() }
    const { mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const mockConn = {
      sftp: vi.fn().mockResolvedValue(sftp)
    } as unknown as SshConnection
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await expect(session.establish(mockConn)).rejects.toThrow('enable failed')

    expect(installRemoteManagedAgentHooksMock).toHaveBeenCalledWith(sftp, '/home/orca')
    expect(sftp.end).toHaveBeenCalledTimes(1)
    expect(registerSshPtyProvider).not.toHaveBeenCalled()
  })

  it('does not register providers if dispose wins during initial plugin sync', async () => {
    process.env.ORCA_FEATURE_REMOTE_AGENT_HOOKS = '1'
    let resolvePluginInstall!: () => void
    muxRequestMock.mockImplementation(async (method: string) => {
      if (method === AGENT_HOOK_INSTALL_PLUGINS_METHOD) {
        return new Promise((resolve) => {
          resolvePluginInstall = () => resolve({ ok: true })
        })
      }
      return { ok: true }
    })
    const { mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const mockConn = {} as SshConnection
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    const establish = session.establish(mockConn)
    await vi.waitFor(() =>
      expect(muxRequestMock).toHaveBeenCalledWith(
        AGENT_HOOK_INSTALL_PLUGINS_METHOD,
        expect.anything()
      )
    )
    session.dispose()
    resolvePluginInstall()

    await expect(establish).rejects.toThrow('Session disposed during establish')
    expect(registerSshPtyProvider).not.toHaveBeenCalled()
    expect(registerSshFilesystemProvider).not.toHaveBeenCalled()
    expect(registerSshGitProvider).not.toHaveBeenCalled()
  })

  it('rejects establish when not idle', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await session.establish(mockConn)
    await expect(session.establish(mockConn)).rejects.toThrow('Cannot establish relay session')
  })

  it('reverts to idle on establish failure', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    vi.mocked(deployAndLaunchRelay).mockRejectedValueOnce(new Error('deploy failed'))

    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await expect(session.establish(mockConn)).rejects.toThrow('deploy failed')
    expect(session.getState()).toBe('idle')
  })

  it('reconnect tears down old providers and registers new ones', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await session.establish(mockConn)
    const oldMux = session.getMux()

    vi.clearAllMocks()
    mockDeploySuccess()

    await session.reconnect(mockConn)

    expect(session.getState()).toBe('ready')
    expect(session.getMux()).not.toBe(oldMux)
    expect(unregisterSshPtyProvider).toHaveBeenCalledWith('target-1')
    expect(unregisterSshFilesystemProvider).toHaveBeenCalledWith('target-1')
    expect(unregisterSshGitProvider).toHaveBeenCalledWith('target-1')
    expect(registerSshPtyProvider).toHaveBeenCalledWith('target-1', expect.anything())
  })

  it('reconnect re-attaches live PTYs', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    vi.mocked(getPtyIdsForConnection).mockReturnValue(['pty-1', 'pty-2'])

    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)
    await session.establish(mockConn)
    vi.clearAllMocks()
    mockDeploySuccess()

    const { getSshPtyProvider } = await import('../ipc/pty')
    const mockAttach = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getSshPtyProvider).mockReturnValue({
      attach: mockAttach,
      dispose: vi.fn()
    } as unknown as ReturnType<typeof getSshPtyProvider>)
    vi.mocked(getPtyIdsForConnection).mockReturnValue(['pty-1', 'pty-2'])

    await session.reconnect(mockConn)

    expect(mockAttach).toHaveBeenCalledWith('pty-1')
    expect(mockAttach).toHaveBeenCalledWith('pty-2')
  })

  it('establish re-attaches owned PTYs after explicit disconnect', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const { getSshPtyProvider } = await import('../ipc/pty')
    const mockAttach = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getSshPtyProvider).mockReturnValue({
      attach: mockAttach,
      dispose: vi.fn()
    } as unknown as ReturnType<typeof getSshPtyProvider>)
    vi.mocked(getPtyIdsForConnection).mockReturnValue(['ssh:target-1@@pty-1'])

    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await session.establish(mockConn)

    expect(mockAttach).toHaveBeenCalledWith('pty-1')
    expect(setPtyOwnership).toHaveBeenCalledWith('ssh:target-1@@pty-1', 'target-1')
    expect(mockStore.markSshRemotePtyLease).toHaveBeenCalledWith('target-1', 'pty-1', 'attached')
  })

  it('establish re-attaches durable leases after app restart', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const { getSshPtyProvider } = await import('../ipc/pty')
    const mockAttach = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getSshPtyProvider).mockReturnValue({
      attach: mockAttach,
      dispose: vi.fn()
    } as unknown as ReturnType<typeof getSshPtyProvider>)
    vi.mocked(getPtyIdsForConnection).mockReturnValue([])
    vi.mocked(mockStore.getSshRemotePtyLeases).mockReturnValue([
      { targetId: 'target-1', ptyId: 'pty-live', state: 'detached' },
      { targetId: 'target-1', ptyId: 'pty-expired', state: 'expired' }
    ] as ReturnType<typeof mockStore.getSshRemotePtyLeases>)

    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await session.establish(mockConn)

    expect(mockAttach).toHaveBeenCalledWith('pty-live')
    expect(mockAttach).not.toHaveBeenCalledWith('pty-expired')
    expect(setPtyOwnership).toHaveBeenCalledWith('ssh:target-1@@pty-live', 'target-1')
    expect(mockStore.markSshRemotePtyLease).toHaveBeenCalledWith('target-1', 'pty-live', 'attached')
  })

  it('rejects establish if detach wins while reattach is in flight', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const { getSshPtyProvider } = await import('../ipc/pty')
    let resolveAttach!: () => void
    const mockAttach = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveAttach = resolve
      })
    )
    vi.mocked(getSshPtyProvider).mockReturnValue({
      attach: mockAttach,
      dispose: vi.fn()
    } as unknown as ReturnType<typeof getSshPtyProvider>)
    vi.mocked(getPtyIdsForConnection).mockReturnValue(['pty-1'])

    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)
    const establish = session.establish(mockConn)
    await vi.waitFor(() => expect(mockAttach).toHaveBeenCalledWith('pty-1'))
    session.detach()
    resolveAttach()

    await expect(establish).rejects.toThrow('Session disposed during establish')
    expect(setPtyOwnership).not.toHaveBeenCalledWith('pty-1', 'target-1')
    expect(mockStore.markSshRemotePtyLease).not.toHaveBeenCalledWith(
      'target-1',
      'pty-1',
      'attached'
    )
  })

  it('does not mark PTYs attached if detach wins while reattach is in flight', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)
    await session.establish(mockConn)
    vi.clearAllMocks()
    mockDeploySuccess()

    const { getSshPtyProvider } = await import('../ipc/pty')
    let resolveAttach!: () => void
    const mockAttach = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveAttach = resolve
      })
    )
    vi.mocked(getSshPtyProvider).mockReturnValue({
      attach: mockAttach,
      dispose: vi.fn()
    } as unknown as ReturnType<typeof getSshPtyProvider>)
    vi.mocked(getPtyIdsForConnection).mockReturnValue(['pty-1'])

    const reconnect = session.reconnect(mockConn)
    await vi.waitFor(() => expect(mockAttach).toHaveBeenCalledWith('pty-1'))
    session.detach()
    resolveAttach()
    await reconnect

    expect(setPtyOwnership).not.toHaveBeenCalledWith('pty-1', 'target-1')
    expect(mockStore.markSshRemotePtyLease).not.toHaveBeenCalledWith(
      'target-1',
      'pty-1',
      'attached'
    )
  })

  it('invalidates and broadcasts remote PTYs that cannot reattach after relay reconnect', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow, mockWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)
    await session.establish(mockConn)
    vi.clearAllMocks()
    mockDeploySuccess()

    const { getSshPtyProvider } = await import('../ipc/pty')
    const mockAttach = vi
      .fn()
      .mockRejectedValueOnce(new Error('PTY "pty-stale" not found'))
      .mockResolvedValueOnce(undefined)
    vi.mocked(getSshPtyProvider).mockReturnValue({
      attach: mockAttach,
      dispose: vi.fn()
    } as unknown as ReturnType<typeof getSshPtyProvider>)
    vi.mocked(getPtyIdsForConnection).mockReturnValue(['pty-stale', 'pty-live'])

    await session.reconnect(mockConn)

    expect(mockAttach).toHaveBeenCalledWith('pty-stale')
    expect(mockAttach).toHaveBeenCalledWith('pty-live')
    expect(clearProviderPtyState).toHaveBeenCalledWith('ssh:target-1@@pty-stale')
    expect(deletePtyOwnership).toHaveBeenCalledWith('ssh:target-1@@pty-stale')
    expect(mockWindow.webContents.send).toHaveBeenCalledWith('pty:exit', {
      id: 'ssh:target-1@@pty-stale',
      code: -1
    })
  })

  it('routes transient reattach failures through relay-lost retry handling', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)
    const onRelayLost = vi.fn()
    session.setOnRelayLost(onRelayLost)
    await session.establish(mockConn)
    vi.clearAllMocks()
    mockDeploySuccess()

    const { getSshPtyProvider } = await import('../ipc/pty')
    const mockAttach = vi.fn().mockRejectedValue(new Error('Multiplexer disposed'))
    vi.mocked(getSshPtyProvider).mockReturnValue({
      attach: mockAttach,
      dispose: vi.fn()
    } as unknown as ReturnType<typeof getSshPtyProvider>)
    vi.mocked(getPtyIdsForConnection).mockReturnValue(['pty-live'])

    await session.reconnect(mockConn)

    expect(mockAttach).toHaveBeenCalledWith('pty-live')
    expect(onRelayLost).toHaveBeenCalledWith('target-1')
    expect(mockStore.markSshRemotePtyLease).not.toHaveBeenCalledWith(
      'target-1',
      'pty-live',
      'expired'
    )
  })

  it('dispose transitions to disposed and unregisters providers', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)
    await session.establish(mockConn)

    session.dispose()

    expect(session.getState()).toBe('disposed')
    expect(unregisterSshPtyProvider).toHaveBeenCalledWith('target-1')
    expect(unregisterSshFilesystemProvider).toHaveBeenCalledWith('target-1')
    expect(unregisterSshGitProvider).toHaveBeenCalledWith('target-1')
  })

  it('dispose is idempotent', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)
    await session.establish(mockConn)

    session.dispose()
    session.dispose()

    expect(session.getState()).toBe('disposed')
  })

  it('reconnect on disposed session is a no-op', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)
    await session.establish(mockConn)
    session.dispose()
    vi.clearAllMocks()

    await session.reconnect(mockConn)

    expect(deployAndLaunchRelay).not.toHaveBeenCalled()
  })

  it('overlapping reconnects cancel the stale one', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)
    await session.establish(mockConn)

    // Why: make the first reconnect hang so the second one aborts it
    let resolveFirst!: () => void
    vi.mocked(deployAndLaunchRelay).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = () =>
          resolve({
            transport: { write: vi.fn(), onData: vi.fn(), onClose: vi.fn() },
            platform: 'linux-x64' as const
          })
      })
    )
    mockDeploySuccess()

    const firstReconnect = session.reconnect(mockConn)
    const secondReconnect = session.reconnect(mockConn)

    resolveFirst()
    await Promise.all([firstReconnect, secondReconnect])

    expect(session.getState()).toBe('ready')
  })

  it('passes grace time to deployAndLaunchRelay', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await session.establish(mockConn, 600)

    expect(deployAndLaunchRelay).toHaveBeenCalledWith(mockConn, undefined, 600, 'target-1')
  })

  it('restores the configured relay grace after establish', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await session.establish(mockConn, 600)

    expect(session.getMux()?.notify).toHaveBeenCalledWith(SSH_RELAY_CONFIGURE_GRACE_TIME_METHOD, {
      graceTimeSeconds: 600
    })
  })

  it('sets relay grace to unlimited before host sleep', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)
    await session.establish(mockConn)
    vi.mocked(session.getMux()!.notify).mockClear()

    session.prepareForHostSleep()

    expect(session.getMux()?.notify).toHaveBeenCalledWith(SSH_RELAY_CONFIGURE_GRACE_TIME_METHOD, {
      graceTimeSeconds: 0
    })
  })

  it('cleans up port forwards on dispose', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)
    await session.establish(mockConn)

    session.dispose()

    expect(mockPortForward.removeAllForwards).toHaveBeenCalledWith('target-1')
  })

  it('cleans up port forwards on reconnect', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)
    await session.establish(mockConn)
    vi.clearAllMocks()
    mockDeploySuccess()

    await session.reconnect(mockConn)

    expect(mockPortForward.removeAllForwards).toHaveBeenCalledWith('target-1')
  })

  it('establish cleans up mux and providers on partial registration failure', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    // Why: simulate registerRelayRoots failing after mux is created but
    // before providers are fully registered.
    mockStore.getRepos = vi.fn().mockImplementation(() => {
      throw new Error('store error during root registration')
    })

    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await expect(session.establish(mockConn)).rejects.toThrow('store error')
    expect(session.getState()).toBe('idle')
    expect(session.getMux()).toBeNull()
    expect(unregisterSshPtyProvider).toHaveBeenCalledWith('target-1')
    expect(unregisterSshFilesystemProvider).toHaveBeenCalledWith('target-1')
    expect(unregisterSshGitProvider).toHaveBeenCalledWith('target-1')
  })

  it('reconnect on idle session is a no-op', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)

    await session.reconnect(mockConn)

    expect(session.getState()).toBe('idle')
    expect(deployAndLaunchRelay).not.toHaveBeenCalled()
  })

  it('reconnect failure still allows retry from onStateChange', async () => {
    const { mockConn, mockStore, mockPortForward, getMainWindow } = createMockDeps()
    const session = new SshRelaySession('target-1', getMainWindow, mockStore, mockPortForward)
    await session.establish(mockConn)

    // Fail the first reconnect
    vi.mocked(deployAndLaunchRelay).mockRejectedValueOnce(new Error('deploy failed'))
    await session.reconnect(mockConn)
    expect(session.getState()).toBe('reconnecting')

    // Retry should work — reconnect accepts 'reconnecting' state
    mockDeploySuccess()
    await session.reconnect(mockConn)
    expect(session.getState()).toBe('ready')
  })
})
