import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { isStreamingMethod } from '../core'
import { ACCOUNT_METHODS } from './accounts'

function method(name: string) {
  const found = ACCOUNT_METHODS.find((candidate) => candidate.name === name)
  if (!found) {
    throw new Error(`Missing method ${name}`)
  }
  return found
}

describe('account RPC methods', () => {
  it('keeps explicit account-list refreshes on the forced refresh lane', async () => {
    const snapshot = { claude: null, codex: null }
    const runtime = {
      refreshAccountsForMobile: vi.fn().mockResolvedValue(undefined),
      getAccountsSnapshot: vi.fn(() => snapshot)
    } as unknown as OrcaRuntimeService
    const list = method('accounts.list')
    if (isStreamingMethod(list)) {
      throw new Error('accounts.list must be a request method')
    }

    await expect(list.handler(undefined, { runtime })).resolves.toBe(snapshot)
    expect(runtime.refreshAccountsForMobile).toHaveBeenCalledOnce()
  })

  it('uses a stale-aware refresh when a connection replays the subscription', async () => {
    const snapshot = { claude: null, codex: null }
    let cleanup: (() => void) | undefined
    const runtime = {
      getAccountsSnapshot: vi.fn(() => snapshot),
      onAccountsChanged: vi.fn(() => vi.fn()),
      registerSubscriptionCleanup: vi.fn((_id: string, nextCleanup: () => void) => {
        cleanup = nextCleanup
      }),
      refreshAccountsForMobile: vi.fn().mockResolvedValue(undefined),
      refreshAccountsForMobileSubscriber: vi.fn().mockResolvedValue(undefined)
    } as unknown as OrcaRuntimeService
    const subscribe = method('accounts.subscribe')
    if (!isStreamingMethod(subscribe)) {
      throw new Error('accounts.subscribe must be a streaming method')
    }
    const emit = vi.fn()

    const running = subscribe.handler(undefined, { runtime, connectionId: 'connection-1' }, emit)
    await vi.waitFor(() => {
      expect(runtime.refreshAccountsForMobileSubscriber).toHaveBeenCalledOnce()
    })

    expect(runtime.refreshAccountsForMobile).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'ready', snapshot }))
    cleanup?.()
    await running
  })

  it('kicks off a headless Codex login and returns its loginId', async () => {
    const runtime = {
      addCodexAccount: vi.fn(() => ({ loginId: 'login-1' }))
    } as unknown as OrcaRuntimeService
    const addCodex = method('accounts.addCodex')
    if (isStreamingMethod(addCodex)) {
      throw new Error('accounts.addCodex must be a request method')
    }

    await expect(
      addCodex.handler({ target: { runtime: 'wsl', wslDistro: 'Ubuntu' } }, { runtime })
    ).resolves.toEqual({ loginId: 'login-1' })
    expect(runtime.addCodexAccount).toHaveBeenCalledWith({ runtime: 'wsl', wslDistro: 'Ubuntu' })
  })

  it('kicks off a headless Claude login and returns its loginId', async () => {
    const runtime = {
      addClaudeAccount: vi.fn(() => ({ loginId: 'login-2' }))
    } as unknown as OrcaRuntimeService
    const addClaude = method('accounts.addClaude')
    if (isStreamingMethod(addClaude)) {
      throw new Error('accounts.addClaude must be a request method')
    }

    await expect(addClaude.handler({}, { runtime })).resolves.toEqual({ loginId: 'login-2' })
    expect(runtime.addClaudeAccount).toHaveBeenCalledWith(undefined)
  })

  it('long-polls a pending login and forwards timeoutMs/signal', async () => {
    const snapshot = {
      loginId: 'login-1',
      provider: 'codex',
      status: 'completed',
      outputTail: 'done'
    }
    const runtime = {
      pollAddAccount: vi.fn().mockResolvedValue(snapshot)
    } as unknown as OrcaRuntimeService
    const pollAdd = method('accounts.pollAdd')
    if (isStreamingMethod(pollAdd)) {
      throw new Error('accounts.pollAdd must be a request method')
    }
    const signal = new AbortController().signal

    await expect(
      pollAdd.handler({ loginId: 'login-1', timeoutMs: 5000 }, { runtime, signal })
    ).resolves.toBe(snapshot)
    expect(runtime.pollAddAccount).toHaveBeenCalledWith('login-1', { timeoutMs: 5000, signal })
  })

  it('submits pasted login input and returns an ack', async () => {
    const runtime = {
      submitAccountLoginInput: vi.fn()
    } as unknown as OrcaRuntimeService
    const submitLoginInput = method('accounts.submitLoginInput')
    if (isStreamingMethod(submitLoginInput)) {
      throw new Error('accounts.submitLoginInput must be a request method')
    }

    await expect(
      submitLoginInput.handler({ loginId: 'login-1', input: 'pasted-code' }, { runtime })
    ).resolves.toEqual({ submitted: true })
    expect(runtime.submitAccountLoginInput).toHaveBeenCalledWith('login-1', 'pasted-code')
  })
})
