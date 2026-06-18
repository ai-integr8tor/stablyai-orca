export const DEFAULT_GIT_REMOTE_OPERATION_TIMEOUT_MS = 120_000
export const GIT_REMOTE_OPERATION_OUTER_TIMEOUT_BUFFER_MS = 5_000

export function resolveGitRemoteOperationTimeoutMs(raw: unknown): number {
  const parsed = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GIT_REMOTE_OPERATION_TIMEOUT_MS
}

export function resolveGitRemoteOperationOuterTimeoutMs(raw: unknown): number {
  return resolveGitRemoteOperationTimeoutMs(raw) + GIT_REMOTE_OPERATION_OUTER_TIMEOUT_BUFFER_MS
}
