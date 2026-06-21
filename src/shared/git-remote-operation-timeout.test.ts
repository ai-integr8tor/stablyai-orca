import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GIT_REMOTE_OPERATION_TIMEOUT_MS,
  GIT_REMOTE_OPERATION_OUTER_TIMEOUT_BUFFER_MS,
  resolveGitRemoteOperationOuterTimeoutMs,
  resolveGitRemoteOperationTimeoutMs
} from './git-remote-operation-timeout'

describe('git remote operation timeout', () => {
  it('uses the default timeout for missing or invalid overrides', () => {
    expect(resolveGitRemoteOperationTimeoutMs(undefined)).toBe(
      DEFAULT_GIT_REMOTE_OPERATION_TIMEOUT_MS
    )
    expect(resolveGitRemoteOperationTimeoutMs('0')).toBe(DEFAULT_GIT_REMOTE_OPERATION_TIMEOUT_MS)
    expect(resolveGitRemoteOperationTimeoutMs('not-a-number')).toBe(
      DEFAULT_GIT_REMOTE_OPERATION_TIMEOUT_MS
    )
    expect(resolveGitRemoteOperationTimeoutMs(true)).toBe(DEFAULT_GIT_REMOTE_OPERATION_TIMEOUT_MS)
  })

  it('adds a buffer for outer RPC timeouts', () => {
    expect(resolveGitRemoteOperationOuterTimeoutMs(undefined)).toBe(
      DEFAULT_GIT_REMOTE_OPERATION_TIMEOUT_MS + GIT_REMOTE_OPERATION_OUTER_TIMEOUT_BUFFER_MS
    )
    expect(resolveGitRemoteOperationOuterTimeoutMs('invalid')).toBe(
      DEFAULT_GIT_REMOTE_OPERATION_TIMEOUT_MS + GIT_REMOTE_OPERATION_OUTER_TIMEOUT_BUFFER_MS
    )
    expect(resolveGitRemoteOperationOuterTimeoutMs('180000')).toBe(
      180_000 + GIT_REMOTE_OPERATION_OUTER_TIMEOUT_BUFFER_MS
    )
    expect(resolveGitRemoteOperationOuterTimeoutMs(180_000)).toBe(
      180_000 + GIT_REMOTE_OPERATION_OUTER_TIMEOUT_BUFFER_MS
    )
  })
})
