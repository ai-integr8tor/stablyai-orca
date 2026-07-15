import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { AGENT_HOOK_METHODS } from './agent-hooks'

const { getManagedAgentHookStatusesMock, getActiveSshAgentHookInstallReportsMock } = vi.hoisted(
  () => ({
    getManagedAgentHookStatusesMock: vi.fn(),
    getActiveSshAgentHookInstallReportsMock: vi.fn()
  })
)

vi.mock('../../../agent-hooks/managed-agent-hook-controls', () => ({
  getManagedAgentHookStatuses: getManagedAgentHookStatusesMock
}))

vi.mock('../../../ipc/ssh', () => ({
  getActiveSshAgentHookInstallReports: getActiveSshAgentHookInstallReportsMock
}))

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

describe('agentHooks RPC methods', () => {
  it('returns local statuses alongside per-SSH-host install reports', async () => {
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
    getManagedAgentHookStatusesMock.mockReturnValueOnce(local)
    getActiveSshAgentHookInstallReportsMock.mockReturnValueOnce(remotes)
    const runtime = { getRuntimeId: () => 'test-runtime' } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: AGENT_HOOK_METHODS })

    const response = await dispatcher.dispatch(makeRequest('agentHooks.status'))

    expect(response).toMatchObject({ ok: true, result: { local, remotes } })
  })
})
