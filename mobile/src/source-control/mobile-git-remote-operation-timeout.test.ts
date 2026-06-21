import { describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import {
  getMobileGitRemoteOperationTimeout,
  isMobileGitRemoteOperationMethod,
  MOBILE_GIT_REMOTE_OPERATION_FALLBACK_TIMEOUT_MS,
  readMobileGitRemoteOperationTimeoutMs
} from './mobile-git-remote-operation-timeout'

function mockClient(sendRequest: RpcClient['sendRequest']): RpcClient {
  return {
    sendRequest,
    subscribe: vi.fn(),
    updateTerminalSubscriptionViewport: vi.fn(),
    close: vi.fn(),
    getState: vi.fn(() => 'connected')
  } as unknown as RpcClient
}

describe('mobile git remote operation timeout', () => {
  it('recognizes only remote source-control methods', () => {
    expect(isMobileGitRemoteOperationMethod('git.fetch')).toBe(true)
    expect(isMobileGitRemoteOperationMethod('git.pull')).toBe(true)
    expect(isMobileGitRemoteOperationMethod('git.push')).toBe(true)
    expect(isMobileGitRemoteOperationMethod('git.fastForward')).toBe(true)
    expect(isMobileGitRemoteOperationMethod('git.rebaseFromBase')).toBe(true)
    expect(isMobileGitRemoteOperationMethod('git.status')).toBe(false)
    expect(isMobileGitRemoteOperationMethod('git.commit')).toBe(false)
  })

  it('reads the runtime-reported source-control timeout', () => {
    expect(
      readMobileGitRemoteOperationTimeoutMs({ gitRemoteOperationOuterTimeoutMs: 185_000 })
    ).toBe(185_000)
    expect(readMobileGitRemoteOperationTimeoutMs({ gitRemoteOperationOuterTimeoutMs: -1 })).toBe(
      MOBILE_GIT_REMOTE_OPERATION_FALLBACK_TIMEOUT_MS
    )
  })

  it('requests the timeout from status.get', async () => {
    const sendRequest = vi.fn().mockResolvedValue({
      id: 'rpc-1',
      ok: true,
      result: { gitRemoteOperationOuterTimeoutMs: 185_000 },
      _meta: { runtimeId: 'runtime-1' }
    })

    await expect(getMobileGitRemoteOperationTimeout(mockClient(sendRequest))).resolves.toEqual({
      timeoutMs: 185_000,
      runtimeId: 'runtime-1',
      cacheable: true
    })
    expect(sendRequest).toHaveBeenCalledWith('status.get', undefined, { timeoutMs: 15_000 })
  })

  it('falls back when old runtimes do not report the timeout', async () => {
    const sendRequest = vi.fn().mockResolvedValue({
      id: 'rpc-1',
      ok: true,
      result: {},
      _meta: { runtimeId: 'runtime-1' }
    })

    await expect(getMobileGitRemoteOperationTimeout(mockClient(sendRequest))).resolves.toEqual({
      timeoutMs: MOBILE_GIT_REMOTE_OPERATION_FALLBACK_TIMEOUT_MS,
      runtimeId: 'runtime-1',
      cacheable: true
    })
  })

  it('falls back without caching when status.get returns a failure envelope', async () => {
    const sendRequest = vi.fn().mockResolvedValue({
      id: 'rpc-1',
      ok: false,
      error: { code: 'failed', message: 'Status failed' },
      _meta: { runtimeId: 'runtime-1' }
    })

    await expect(getMobileGitRemoteOperationTimeout(mockClient(sendRequest))).resolves.toEqual({
      timeoutMs: MOBILE_GIT_REMOTE_OPERATION_FALLBACK_TIMEOUT_MS,
      runtimeId: null,
      cacheable: false
    })
  })

  it('falls back without caching when status.get fails', async () => {
    const sendRequest = vi.fn().mockRejectedValue(new Error('Request timed out: status.get'))

    await expect(getMobileGitRemoteOperationTimeout(mockClient(sendRequest))).resolves.toEqual({
      timeoutMs: MOBILE_GIT_REMOTE_OPERATION_FALLBACK_TIMEOUT_MS,
      runtimeId: null,
      cacheable: false
    })
  })
})
