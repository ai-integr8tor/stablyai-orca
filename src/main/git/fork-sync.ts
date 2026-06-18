import { normalizeGitErrorMessage } from '../../shared/git-remote-error'
import {
  syncForkDefaultBranch,
  type GitForkSyncExpectedUpstream,
  type GitForkSyncResult
} from '../../shared/git-fork-sync'
import type { GitRuntimeOptions } from './git-runtime-options'
import { gitOptionsForWorktree } from './git-runtime-options'
import { gitExecFileAsync } from './runner'
import { resolveGitRemoteOperationTimeoutMs } from '../../shared/git-remote-operation-timeout'

export async function gitSyncForkDefaultBranch(
  worktreePath: string,
  expectedUpstream: GitForkSyncExpectedUpstream,
  options: GitRuntimeOptions = {}
): Promise<GitForkSyncResult> {
  const timeoutMs = resolveGitRemoteOperationTimeoutMs(
    process.env.ORCA_GIT_REMOTE_OPERATION_TIMEOUT_MS
  )
  const controller = new AbortController()
  // Why: the overall timer aborts through AbortSignal; remember that path so
  // it normalizes as a remote timeout instead of a generic abort.
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  timeout.unref?.()
  try {
    return await syncForkDefaultBranch(
      (args) =>
        gitExecFileAsync(args, {
          ...gitOptionsForWorktree(worktreePath, options),
          timeout: timeoutMs,
          signal: controller.signal
        }),
      { expectedUpstream }
    )
  } catch (error) {
    const normalizedError = timedOut ? new Error('git timed out.') : error
    throw new Error(normalizeGitErrorMessage(normalizedError, 'push'))
  } finally {
    clearTimeout(timeout)
  }
}
