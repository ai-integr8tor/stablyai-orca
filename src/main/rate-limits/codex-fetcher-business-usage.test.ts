import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import businessUsageFixture from './codex-business-wham-usage-8664.fixture.json'

const { childSpawnMock, readFileMock, resolveCodexCommandMock } = vi.hoisted(() => ({
  childSpawnMock: vi.fn(),
  readFileMock: vi.fn(),
  resolveCodexCommandMock: vi.fn()
}))

vi.mock('node:child_process', () => ({
  spawn: childSpawnMock
}))

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock
}))

vi.mock('../codex-cli/command', () => ({
  resolveCodexCommand: resolveCodexCommandMock
}))

vi.mock('node-pty', () => ({
  spawn: vi.fn()
}))

vi.mock('./codex-auth-presence', () => ({
  probeCodexAuthPresence: vi.fn(() => 'present')
}))

import { fetchCodexRateLimits } from './codex-fetcher'
import { probeCodexAuthPresence } from './codex-auth-presence'

const codexAuthJson = '{"tokens":{"access_token":"access-token","account_id":"account-id"}}'
const rpcResetCreditPayload = {
  availableCount: 1,
  credits: [
    {
      status: 'available',
      expiresAt: '1719326400',
      grantedAt: '1718721600000'
    }
  ]
}
const expectedRpcResetCredits = {
  availableCount: 1,
  nextExpiresAt: 1719326400 * 1000,
  credits: [
    {
      status: 'available',
      expiresAt: 1719326400 * 1000,
      grantedAt: 1718721600000
    }
  ]
}
const backendResetCreditPayload = {
  available_count: 2,
  total_earned_count: 3,
  credits: [
    {
      status: 'available',
      expires_at: '2026-07-01T12:00:00Z',
      granted_at: '2026-06-24T12:00:00Z'
    },
    {
      status: 'used',
      expires_at: '2026-06-30T12:00:00Z',
      granted_at: '2026-06-23T12:00:00Z'
    }
  ]
}
const plusUsagePayload = {
  plan_type: 'plus',
  rate_limit: {
    primary_window: {
      used_percent: 12,
      limit_window_seconds: 3_600,
      reset_at: 1_800_000_000
    },
    secondary_window: {
      used_percent: 34,
      limit_window_seconds: 86_400,
      reset_at: 1_800_100_000
    }
  }
}
const expectedBackendResetCredits = {
  availableCount: 2,
  totalEarnedCount: 3,
  nextExpiresAt: Date.parse('2026-07-01T12:00:00Z'),
  credits: [
    {
      status: 'available',
      expiresAt: Date.parse('2026-07-01T12:00:00Z'),
      grantedAt: Date.parse('2026-06-24T12:00:00Z')
    },
    {
      status: 'used',
      expiresAt: Date.parse('2026-06-30T12:00:00Z'),
      grantedAt: Date.parse('2026-06-23T12:00:00Z')
    }
  ]
}

function makeRpcChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    stdin: { write: ReturnType<typeof vi.fn> }
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { write: vi.fn() }
  child.kill = vi.fn()
  return child
}

function mockRpcRateLimits(
  child: ReturnType<typeof makeRpcChild>,
  rateLimits: Record<string, unknown>,
  extraResult: Record<string, unknown> = {}
) {
  child.stdin.write.mockImplementation((line: string) => {
    const msg = JSON.parse(line) as { id?: number; method?: string }
    if (msg.method === 'initialize' || msg.method === 'account/rateLimits/read') {
      setTimeout(() => {
        child.stdout.emit(
          'data',
          Buffer.from(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: msg.id,
              result: msg.method === 'initialize' ? {} : { rateLimits, ...extraResult }
            })}\n`
          )
        )
      }, 0)
    }
  })
}

async function flushRpcResponses() {
  await vi.advanceTimersByTimeAsync(1)
  await vi.advanceTimersByTimeAsync(1)
}

describe('Codex Business host supplement behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    resolveCodexCommandMock.mockReturnValue('codex')
    vi.mocked(probeCodexAuthPresence).mockResolvedValue('present')
    readFileMock.mockRejectedValue(new Error('no auth fixture'))
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('supplements an empty native RPC result with Business usage', async () => {
    const rpcChild = makeRpcChild()
    childSpawnMock.mockReturnValue(rpcChild)
    readFileMock.mockResolvedValue(codexAuthJson)
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...businessUsageFixture, rate_limit_reset_credits: null })
    } as Response)
    mockRpcRateLimits(
      rpcChild,
      {},
      {
        rateLimitResetCredits: rpcResetCreditPayload
      }
    )

    const resultPromise = fetchCodexRateLimits()
    await flushRpcResponses()
    const result = await resultPromise

    expect(result).toMatchObject({
      session: { usedPercent: 39 },
      weekly: null,
      status: 'ok'
    })
    expect(result.rateLimitResetCredits).toEqual(expectedRpcResetCredits)
    expect(fetch).not.toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits',
      expect.anything()
    )
  })

  it('replaces stale RPC reset-credit metadata when the Business supplement supplies usable backend credits', async () => {
    const rpcChild = makeRpcChild()
    childSpawnMock.mockReturnValue(rpcChild)
    readFileMock.mockResolvedValue(codexAuthJson)
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...businessUsageFixture,
        rate_limit_reset_credits: backendResetCreditPayload
      })
    } as Response)
    mockRpcRateLimits(
      rpcChild,
      {},
      {
        rateLimitResetCredits: rpcResetCreditPayload
      }
    )

    const resultPromise = fetchCodexRateLimits()
    await flushRpcResponses()
    const result = await resultPromise

    expect(result).toMatchObject({
      session: { usedPercent: 39 },
      weekly: null,
      status: 'ok'
    })
    expect(result.rateLimitResetCredits).toEqual(expectedBackendResetCredits)
    expect(result.rateLimitResetCredits).not.toEqual(expectedRpcResetCredits)
    expect(fetch).not.toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits',
      expect.anything()
    )
  })

  it('preserves an empty RPC result when the backend payload is non-Business', async () => {
    const rpcChild = makeRpcChild()
    childSpawnMock.mockReturnValue(rpcChild)
    readFileMock.mockResolvedValue(codexAuthJson)
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => plusUsagePayload
    } as Response)
    mockRpcRateLimits(
      rpcChild,
      {},
      {
        rateLimitResetCredits: rpcResetCreditPayload
      }
    )

    const resultPromise = fetchCodexRateLimits()
    await flushRpcResponses()
    const result = await resultPromise

    expect(result).toMatchObject({
      session: null,
      weekly: null,
      status: 'ok',
      rateLimitResetCredits: expectedRpcResetCredits
    })
    expect(fetch).not.toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits',
      expect.anything()
    )
  })

  it('preserves existing RPC windows and skips the Business backend supplement', async () => {
    const rpcChild = makeRpcChild()
    childSpawnMock.mockReturnValue(rpcChild)
    readFileMock.mockResolvedValue(codexAuthJson)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => businessUsageFixture
    } as Response)
    mockRpcRateLimits(rpcChild, {
      primary: { usedPercent: 17 },
      secondary: { usedPercent: 23 }
    })

    const resultPromise = fetchCodexRateLimits()
    await vi.advanceTimersByTimeAsync(1)
    await expect(resultPromise).resolves.toMatchObject({
      session: { usedPercent: 17 },
      weekly: { usedPercent: 23 },
      status: 'ok'
    })
    expect(fetch).not.toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/wham/usage',
      expect.anything()
    )
  })

  it('preserves an empty RPC result when the Business supplement fails or is malformed', async () => {
    const rejectedRpcChild = makeRpcChild()
    const malformedRpcChild = makeRpcChild()
    childSpawnMock.mockReturnValueOnce(rejectedRpcChild).mockReturnValueOnce(malformedRpcChild)
    readFileMock.mockResolvedValue(codexAuthJson)
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('backend unavailable'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
    mockRpcRateLimits(rejectedRpcChild, {})

    const resultPromise = fetchCodexRateLimits()
    await flushRpcResponses()

    await expect(resultPromise).resolves.toMatchObject({
      session: null,
      weekly: null,
      status: 'ok'
    })

    mockRpcRateLimits(malformedRpcChild, {})

    const malformedResultPromise = fetchCodexRateLimits()
    await flushRpcResponses()

    await expect(malformedResultPromise).resolves.toMatchObject({
      session: null,
      weekly: null,
      status: 'ok'
    })
  })

  it('keeps caller abort precedence during the Business supplement', async () => {
    const rpcChild = makeRpcChild()
    childSpawnMock.mockReturnValue(rpcChild)
    readFileMock.mockResolvedValue(codexAuthJson)
    let resolveBackend!: (response: Response) => void
    vi.mocked(fetch).mockImplementation(
      () => new Promise<Response>((resolve) => (resolveBackend = resolve))
    )
    mockRpcRateLimits(rpcChild, {})

    const controller = new AbortController()
    const resultPromise = fetchCodexRateLimits({ signal: controller.signal })
    await flushRpcResponses()
    controller.abort()
    resolveBackend({ ok: true, json: async () => businessUsageFixture } as Response)

    await expect(resultPromise).resolves.toMatchObject({
      error: 'Rate-limit fetch aborted',
      status: 'error',
      session: null,
      weekly: null
    })
  })
})
