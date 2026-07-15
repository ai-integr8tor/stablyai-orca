import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultPersistedState } from '../../shared/constants'
import type { PersistedState } from '../../shared/types'

const {
  applyAgentStatusHooksEnabledMock,
  callMock,
  getCliStatusMock,
  getDefaultUserDataPathMock,
  getManagedAgentHookStatusesMock
} = vi.hoisted(() => ({
  applyAgentStatusHooksEnabledMock: vi.fn(),
  callMock: vi.fn(),
  getCliStatusMock: vi.fn(() =>
    Promise.resolve({
      id: 'test-status',
      ok: true,
      result: {
        app: { running: false, pid: null },
        runtime: { state: 'not_running', reachable: false, runtimeId: null },
        graph: { state: 'not_running' }
      },
      _meta: { runtimeId: 'test' }
    })
  ),
  getDefaultUserDataPathMock: vi.fn(),
  getManagedAgentHookStatusesMock: vi.fn()
}))

vi.mock('../runtime-client', () => {
  class RuntimeClient {
    call = callMock
    getCliStatus = getCliStatusMock
  }

  class RuntimeClientError extends Error {
    readonly code: string

    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }

  class RuntimeRpcFailureError extends Error {}

  return {
    RuntimeClient,
    RuntimeClientError,
    RuntimeRpcFailureError,
    getDefaultUserDataPath: getDefaultUserDataPathMock
  }
})

vi.mock('../../main/agent-hooks/managed-agent-hook-controls', () => ({
  applyAgentStatusHooksEnabled: applyAgentStatusHooksEnabledMock,
  getManagedAgentHookStatuses: getManagedAgentHookStatusesMock
}))

import { main } from '../index'

function readDataFile(userDataPath: string): PersistedState {
  return JSON.parse(readFileSync(join(userDataPath, 'orca-data.json'), 'utf-8')) as PersistedState
}

function writeDataFile(userDataPath: string, state: PersistedState): void {
  mkdirSync(userDataPath, { recursive: true })
  writeFileSync(join(userDataPath, 'orca-data.json'), JSON.stringify(state, null, 2), 'utf-8')
}

async function runAgentHooksOff(userDataPath: string): Promise<void> {
  getDefaultUserDataPathMock.mockReturnValue(userDataPath)
  await main(['agent', 'hooks', 'off', '--json'], userDataPath)
}

describe('agent hooks CLI handler', () => {
  let userDataPath: string

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'orca-agent-hooks-cli-'))
    applyAgentStatusHooksEnabledMock.mockReturnValue([])
    callMock.mockReset()
    getCliStatusMock.mockClear()
    getManagedAgentHookStatusesMock.mockReturnValue([])
    process.exitCode = undefined
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(userDataPath, { recursive: true, force: true })
  })

  it('reports per-SSH-host hook installs from the runtime when it is reachable', async () => {
    getDefaultUserDataPathMock.mockReturnValue(userDataPath)
    getCliStatusMock.mockResolvedValueOnce({
      id: 'test-status',
      ok: true,
      result: {
        app: { running: true, pid: 123 },
        runtime: { state: 'running', reachable: true, runtimeId: 'rt-1' },
        graph: { state: 'running' }
      },
      _meta: { runtimeId: 'test' }
    } as never)
    const local = [
      {
        agent: 'codex',
        state: 'installed',
        configPath: '/local/hooks.json',
        managedHooksPresent: true,
        detail: null
      }
    ]
    const remotes = [
      {
        targetId: 'ssh-1',
        remoteHome: '/home/dev',
        state: 'partial',
        detail: '1 agent hook install(s) failed on the remote host',
        statuses: [
          {
            agent: 'codex',
            state: 'error',
            configPath: '/home/dev/.codex/hooks.json',
            managedHooksPresent: false,
            detail: 'Could not parse remote Codex hooks.json'
          }
        ]
      }
    ]
    callMock.mockResolvedValueOnce({
      id: 'test-call',
      ok: true,
      result: { local, remotes },
      _meta: { runtimeId: 'rt-1' }
    })

    await main(['agent', 'hooks', 'status', '--json'], userDataPath)

    expect(callMock).toHaveBeenCalledWith('agentHooks.status', undefined, { timeoutMs: 10_000 })
    const printed = vi.mocked(console.log).mock.calls.at(-1)?.[0] as string
    const parsed = JSON.parse(printed)
    expect(parsed.result).toMatchObject({
      appliedBy: 'runtime',
      statuses: local,
      remotes
    })
  })

  it('surfaces an RPC failure from a reachable runtime instead of reporting local-only status', async () => {
    getDefaultUserDataPathMock.mockReturnValue(userDataPath)
    getCliStatusMock.mockResolvedValueOnce({
      id: 'test-status',
      ok: true,
      result: {
        app: { running: true, pid: 123 },
        runtime: { state: 'running', reachable: true, runtimeId: 'rt-1' },
        graph: { state: 'running' }
      },
      _meta: { runtimeId: 'test' }
    } as never)
    callMock.mockRejectedValueOnce(new Error('agentHooks.status timed out'))

    await main(['agent', 'hooks', 'status', '--json'], userDataPath)

    // Why: a reachable runtime whose status RPC fails must not silently print
    // a local-only report — that reads as `installed` while SSH host state is
    // unknown, the exact misleading green this command exists to prevent.
    expect(process.exitCode).toBe(1)
    const printed = [
      ...vi.mocked(console.error).mock.calls.flat(),
      ...vi.mocked(console.log).mock.calls.flat()
    ].join('\n')
    expect(printed).toContain('agentHooks.status timed out')
  })

  it('falls back to local-only status when the runtime is unreachable', async () => {
    getDefaultUserDataPathMock.mockReturnValue(userDataPath)
    const local = [
      {
        agent: 'codex',
        state: 'installed',
        configPath: '/local/hooks.json',
        managedHooksPresent: true,
        detail: null
      }
    ]
    getManagedAgentHookStatusesMock.mockReturnValue(local)

    await main(['agent', 'hooks', 'status', '--json'], userDataPath)

    expect(callMock).not.toHaveBeenCalled()
    const printed = vi.mocked(console.log).mock.calls.at(-1)?.[0] as string
    const parsed = JSON.parse(printed)
    expect(parsed.result).toMatchObject({
      appliedBy: 'offline',
      statuses: local,
      remotes: null
    })
  })

  it('keeps new card style off when creating offline settings for a fresh profile', async () => {
    await runAgentHooksOff(userDataPath)

    const persisted = readDataFile(userDataPath)

    expect(persisted.settings.experimentalNewWorktreeCardStyle).toBe(false)
    expect(persisted.settings.agentStatusHooksEnabled).toBe(false)
  })

  it('keeps missing new card style off when updating offline settings', async () => {
    const existing = getDefaultPersistedState(userDataPath)
    delete existing.settings.experimentalNewWorktreeCardStyle
    writeDataFile(userDataPath, existing)

    await runAgentHooksOff(userDataPath)

    expect(readDataFile(userDataPath).settings.experimentalNewWorktreeCardStyle).toBe(false)
  })

  it('preserves an existing explicit new card style opt-in when updating offline settings', async () => {
    const existing = getDefaultPersistedState(userDataPath)
    existing.settings.experimentalNewWorktreeCardStyle = true
    writeDataFile(userDataPath, existing)

    await runAgentHooksOff(userDataPath)

    expect(readDataFile(userDataPath).settings.experimentalNewWorktreeCardStyle).toBe(true)
  })
})
