import { EventEmitter } from 'events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn()
}))

vi.mock('child_process', () => ({
  spawn: spawnMock
}))

import { runRelayGitSubprocess } from './git-subprocess-capture'

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  pid: number
  kill: ReturnType<typeof vi.fn>
}

function createMockChildProcess(pid: number): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.pid = pid
  child.kill = vi.fn()
  return child
}

async function withPlatform<T>(platform: NodeJS.Platform, fn: () => Promise<T>): Promise<T> {
  const original = process.platform
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
  try {
    return await fn()
  } finally {
    Object.defineProperty(process, 'platform', { configurable: true, value: original })
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  spawnMock.mockReset()
})

describe('runRelayGitSubprocess', () => {
  it('preserves split UTF-8 characters across stdout and stderr chunks', async () => {
    const child = createMockChildProcess(1234)
    spawnMock.mockReturnValue(child)

    const promise = runRelayGitSubprocess(['status'], {
      cwd: '/repo',
      env: {},
      maxBuffer: 1024
    })

    const stdout = Buffer.from('branch/éclair\n', 'utf8')
    const stdoutSplit = stdout.indexOf(0xc3) + 1
    child.stdout.emit('data', stdout.subarray(0, stdoutSplit))
    child.stdout.emit('data', stdout.subarray(stdoutSplit))

    const stderr = Buffer.from('path/雪.txt\n', 'utf8')
    const stderrSplit = stderr.indexOf(0xe9) + 1
    child.stderr.emit('data', stderr.subarray(0, stderrSplit))
    child.stderr.emit('data', stderr.subarray(stderrSplit))
    child.emit('close', 0, null)

    await expect(promise).resolves.toEqual({
      stdout: 'branch/éclair\n',
      stderr: 'path/雪.txt\n'
    })
  })

  it('kills timed-out POSIX git subprocesses as a process group', async () => {
    vi.useFakeTimers()
    await withPlatform('linux', async () => {
      const child = createMockChildProcess(1234)
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
      spawnMock.mockReturnValue(child)

      const promise = runRelayGitSubprocess(['fetch', '--prune'], {
        cwd: '/repo',
        env: {},
        maxBuffer: 1024,
        timeout: 1000
      })
      const rejection = expect(promise).rejects.toThrow('git timed out.')

      await vi.advanceTimersByTimeAsync(1000)
      await rejection

      expect(spawnMock).toHaveBeenCalledWith(
        'git',
        ['fetch', '--prune'],
        expect.objectContaining({
          cwd: '/repo',
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        })
      )
      expect(killSpy).toHaveBeenCalledWith(-1234, 'SIGTERM')
      expect(child.kill).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(2000)
      expect(killSpy).toHaveBeenCalledWith(-1234, 'SIGKILL')
    })
  })

  it('clears POSIX force-kill timers when the process exits after SIGTERM', async () => {
    vi.useFakeTimers()
    await withPlatform('linux', async () => {
      const child = createMockChildProcess(1234)
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
      spawnMock.mockReturnValue(child)

      const promise = runRelayGitSubprocess(['fetch', '--prune'], {
        cwd: '/repo',
        env: {},
        maxBuffer: 1024,
        timeout: 1000
      })
      const rejection = expect(promise).rejects.toThrow('git timed out.')

      await vi.advanceTimersByTimeAsync(1000)
      child.emit('close', null, 'SIGTERM')
      await rejection
      await vi.advanceTimersByTimeAsync(2000)

      expect(killSpy).toHaveBeenCalledWith(-1234, 'SIGTERM')
      expect(killSpy).not.toHaveBeenCalledWith(-1234, 'SIGKILL')
    })
  })
})
