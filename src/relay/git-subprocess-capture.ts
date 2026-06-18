import { spawn, type ChildProcess } from 'child_process'
import { StringDecoder } from 'string_decoder'

export type RelayGitSubprocessOptions = {
  cwd: string
  env: NodeJS.ProcessEnv
  maxBuffer: number
  timeout?: number
  signal?: AbortSignal
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

function killSpawnedGitTree(child: ChildProcess): void {
  const pid = child.pid
  if (!pid) {
    child.kill()
    return
  }

  if (process.platform === 'win32') {
    try {
      // Why: git hooks and credential helpers can outlive git.exe on Windows;
      // taskkill walks the whole tree so the timed-out operation really stops.
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true
      })
      killer.on('error', () => child.kill())
      killer.unref()
    } catch {
      child.kill()
    }
    return
  }

  try {
    // Why: POSIX git fetch/push can leave ssh, hooks, or remote helpers behind
    // unless the detached process group is signaled as a unit.
    process.kill(-pid, 'SIGTERM')
  } catch {
    child.kill()
    return
  }

  const forceKillTimer = setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      /* process group already exited */
    }
  }, 2000)
  child.once('close', () => clearTimeout(forceKillTimer))
  forceKillTimer.unref?.()
}

function formatGitFailure(
  args: string[],
  stderr: string,
  code: number | null,
  signal: string | null
): string {
  const command = ['git', ...args].join(' ')
  const detail = stderr.trim()
  if (detail) {
    return `Command failed: ${command}\n${detail}`
  }
  if (signal) {
    return `Command failed: ${command}\nKilled by ${signal}`
  }
  return `Command failed: ${command} exited with code ${code ?? 'unknown'}`
}

export function runRelayGitSubprocess(
  args: string[],
  options: RelayGitSubprocessOptions
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(createAbortError())
      return
    }

    let settled = false
    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')
    let child: ChildProcess | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      options.signal?.removeEventListener('abort', onAbort)
      child?.stdout?.off('data', onStdoutData)
      child?.stderr?.off('data', onStderrData)
      child?.off('error', onError)
      child?.off('close', onClose)
    }
    const finish = (error: Error | null): void => {
      if (settled) {
        return
      }
      settled = true
      stdout += stdoutDecoder.end()
      stderr += stderrDecoder.end()
      cleanup()
      if (error) {
        reject(Object.assign(error, { stdout, stderr }))
        return
      }
      resolve({ stdout, stderr })
    }
    const terminate = (): void => {
      if (child) {
        killSpawnedGitTree(child)
      }
    }
    function onAbort(): void {
      terminate()
      finish(createAbortError())
    }
    function onStdoutData(chunk: Buffer): void {
      stdoutBytes += chunk.byteLength
      if (stdoutBytes > options.maxBuffer) {
        terminate()
        finish(new Error('git stdout exceeded maxBuffer.'))
        return
      }
      stdout += stdoutDecoder.write(chunk)
    }
    function onStderrData(chunk: Buffer): void {
      stderrBytes += chunk.byteLength
      if (stderrBytes > options.maxBuffer) {
        terminate()
        finish(new Error('git stderr exceeded maxBuffer.'))
        return
      }
      stderr += stderrDecoder.write(chunk)
    }
    function onError(error: Error): void {
      finish(error)
    }
    function onClose(code: number | null, signal: NodeJS.Signals | null): void {
      if (code === 0 && !signal) {
        finish(null)
        return
      }
      finish(new Error(formatGitFailure(args, stderr, code, signal)))
    }

    try {
      child = spawn('git', args, {
        cwd: options.cwd,
        detached: process.platform !== 'win32',
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
      return
    }

    child.stdout?.on('data', onStdoutData)
    child.stderr?.on('data', onStderrData)
    child.on('error', onError)
    child.on('close', onClose)
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted) {
      onAbort()
      return
    }

    if (options.timeout && options.timeout > 0) {
      timer = setTimeout(() => {
        terminate()
        finish(new Error('git timed out.'))
      }, options.timeout)
      timer.unref?.()
    }
  })
}
