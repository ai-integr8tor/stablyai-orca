import { resolveGitRemoteOperationOuterTimeoutMs } from '../../../src/shared/git-remote-operation-timeout'
import type { RpcClient } from '../transport/rpc-client'

const MOBILE_GIT_REMOTE_OPERATION_STATUS_TIMEOUT_MS = 15_000

export const MOBILE_GIT_REMOTE_OPERATION_FALLBACK_TIMEOUT_MS =
  resolveGitRemoteOperationOuterTimeoutMs(undefined)

export type MobileGitRemoteOperationTimeout = {
  timeoutMs: number
  runtimeId: string | null
  cacheable: boolean
}

const MOBILE_GIT_REMOTE_OPERATION_METHODS = new Set([
  'git.fetch',
  'git.pull',
  'git.push',
  'git.fastForward',
  'git.rebaseFromBase',
  'git.forkSync'
])

export function isMobileGitRemoteOperationMethod(method: string): boolean {
  return MOBILE_GIT_REMOTE_OPERATION_METHODS.has(method)
}

export function readMobileGitRemoteOperationTimeoutMs(status: unknown): number {
  const value =
    status !== null && typeof status === 'object'
      ? (status as { gitRemoteOperationOuterTimeoutMs?: unknown }).gitRemoteOperationOuterTimeoutMs
      : undefined
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : MOBILE_GIT_REMOTE_OPERATION_FALLBACK_TIMEOUT_MS
}

export async function getMobileGitRemoteOperationTimeout(
  client: RpcClient
): Promise<MobileGitRemoteOperationTimeout> {
  try {
    const response = await client.sendRequest('status.get', undefined, {
      timeoutMs: MOBILE_GIT_REMOTE_OPERATION_STATUS_TIMEOUT_MS
    })
    return {
      timeoutMs: response.ok
        ? readMobileGitRemoteOperationTimeoutMs(response.result)
        : MOBILE_GIT_REMOTE_OPERATION_FALLBACK_TIMEOUT_MS,
      runtimeId: response.ok ? response._meta.runtimeId : null,
      cacheable: response.ok
    }
  } catch {
    return {
      timeoutMs: MOBILE_GIT_REMOTE_OPERATION_FALLBACK_TIMEOUT_MS,
      runtimeId: null,
      cacheable: false
    }
  }
}
