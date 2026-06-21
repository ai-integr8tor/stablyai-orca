import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_GIT_REMOTE_OPERATION_TIMEOUT_MS } from '../../shared/git-remote-operation-timeout'

const mocks = vi.hoisted(() => ({
  gitExecFileAsync: vi.fn()
}))

vi.mock('./runner', () => ({
  gitExecFileAsync: mocks.gitExecFileAsync
}))

import { gitSyncForkDefaultBranch } from './fork-sync'

type GitExecOptions = {
  cwd?: string
  signal?: AbortSignal
  timeout?: number
  wslDistro?: string
}

type GitCall = {
  args: string[]
  options: GitExecOptions
}

function mockSuccessfulForkSync(): GitCall[] {
  const calls: GitCall[] = []
  mocks.gitExecFileAsync.mockImplementation(async (args: string[], options: GitExecOptions) => {
    calls.push({ args, options })
    if (args[0] === 'remote' && args[1] === 'get-url') {
      return { stdout: 'git@github.com:stablyai/orca.git\n', stderr: '' }
    }
    if (args[0] === 'remote') {
      return { stdout: 'origin\nupstream\n', stderr: '' }
    }
    if (args[0] === 'ls-remote') {
      return {
        stdout: 'ref: refs/heads/main\tHEAD\n0123456789012345678901234567890123456789\tHEAD\n',
        stderr: ''
      }
    }
    if (args[0] === 'rev-parse') {
      const ref = args[2] ?? ''
      return {
        stdout: ref.includes('upstream')
          ? '2222222222222222222222222222222222222222\n'
          : '1111111111111111111111111111111111111111\n',
        stderr: ''
      }
    }
    if (args[0] === 'rev-list') {
      return { stdout: '0\t0\n', stderr: '' }
    }
    return { stdout: '', stderr: '' }
  })
  return calls
}

describe('gitSyncForkDefaultBranch', () => {
  const originalRemoteOperationTimeout = process.env.ORCA_GIT_REMOTE_OPERATION_TIMEOUT_MS

  beforeEach(() => {
    mocks.gitExecFileAsync.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalRemoteOperationTimeout === undefined) {
      delete process.env.ORCA_GIT_REMOTE_OPERATION_TIMEOUT_MS
    } else {
      process.env.ORCA_GIT_REMOTE_OPERATION_TIMEOUT_MS = originalRemoteOperationTimeout
    }
  })

  it('uses the remote-operation timeout for fork-sync git subprocesses', async () => {
    const calls = mockSuccessfulForkSync()

    await gitSyncForkDefaultBranch('/repo', { owner: 'stablyai', repo: 'orca' })

    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((call) => call.options.cwd === '/repo')).toBe(true)
    expect(calls.every((call) => call.options.signal instanceof AbortSignal)).toBe(true)
    expect(
      calls.every((call) => call.options.timeout === DEFAULT_GIT_REMOTE_OPERATION_TIMEOUT_MS)
    ).toBe(true)
  })

  it('honors the remote-operation timeout env override', async () => {
    process.env.ORCA_GIT_REMOTE_OPERATION_TIMEOUT_MS = '180000'
    const calls = mockSuccessfulForkSync()

    await gitSyncForkDefaultBranch('/repo', { owner: 'stablyai', repo: 'orca' })

    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((call) => call.options.timeout === 180_000)).toBe(true)
  })

  it('normalizes timeout-triggered aborts', async () => {
    vi.useFakeTimers()
    process.env.ORCA_GIT_REMOTE_OPERATION_TIMEOUT_MS = '1000'
    mocks.gitExecFileAsync.mockImplementation(
      (_args: string[], options: GitExecOptions) =>
        new Promise((_, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => {
              reject(
                Object.assign(new Error('The operation was aborted.'), {
                  name: 'AbortError'
                })
              )
            },
            { once: true }
          )
        })
    )

    const promise = gitSyncForkDefaultBranch('/repo', { owner: 'stablyai', repo: 'orca' })
    const rejection = expect(promise).rejects.toThrow(
      'Push timed out. Check your remote connection or credentials, then try again.'
    )
    await vi.advanceTimersByTimeAsync(1000)

    await rejection
  })
})
