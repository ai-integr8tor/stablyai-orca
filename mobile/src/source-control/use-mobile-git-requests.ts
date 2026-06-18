import { useCallback, useEffect, useRef } from 'react'
import type { ConnectionState, RpcSuccess } from '../transport/types'
import type { RpcClient } from '../transport/rpc-client'
import {
  isMobileGitUnavailable,
  type MobileGitStatusResult,
  type MobileGitUpstreamStatus
} from './mobile-git-status'
import type { GitCommitResult, GitRequestError } from './mobile-source-control-screen-state'
import {
  getMobileGitRemoteOperationTimeout,
  isMobileGitRemoteOperationMethod
} from './mobile-git-remote-operation-timeout'

type Params = {
  client: RpcClient | null
  connState: ConnectionState
  worktreeId: string
}

// The raw RPC layer for source-control git actions. Pure transport — owns no
// screen state, so it stays out of the giant state hook.
export function useMobileGitRequests({ client, connState, worktreeId }: Params) {
  const remoteOperationTimeoutRef = useRef<{
    client: RpcClient
    runtimeId: string
    timeoutMs: number
  } | null>(null)

  const invalidateTimeoutIfRuntimeChanged = useCallback(
    (runtimeId: string) => {
      if (
        remoteOperationTimeoutRef.current?.client === client &&
        remoteOperationTimeoutRef.current.runtimeId !== runtimeId
      ) {
        remoteOperationTimeoutRef.current = null
      }
    },
    [client]
  )

  useEffect(() => {
    if (!client) {
      remoteOperationTimeoutRef.current = null
      return undefined
    }
    return client.onStateChange((state) => {
      if (state !== 'connected') {
        // Why: the mobile RpcClient survives reconnects, but the paired
        // runtime process and its env-derived git timeout may have changed.
        remoteOperationTimeoutRef.current = null
      }
    })
  }, [client])

  const getGitRequestOptions = useCallback(
    async (method: string): Promise<{ timeoutMs: number } | undefined> => {
      if (!client || !isMobileGitRemoteOperationMethod(method)) {
        return undefined
      }
      if (remoteOperationTimeoutRef.current?.client === client) {
        return { timeoutMs: remoteOperationTimeoutRef.current.timeoutMs }
      }
      const timeout = await getMobileGitRemoteOperationTimeout(client)
      if (timeout.cacheable && timeout.runtimeId) {
        remoteOperationTimeoutRef.current = {
          client,
          runtimeId: timeout.runtimeId,
          timeoutMs: timeout.timeoutMs
        }
      }
      return { timeoutMs: timeout.timeoutMs }
    },
    [client]
  )

  const sendGitRequest = useCallback(
    async <T>(method: string, params?: Record<string, unknown>): Promise<T> => {
      if (!client || connState !== 'connected') {
        throw new Error('Waiting for desktop...')
      }
      const options = await getGitRequestOptions(method)
      const response = await client.sendRequest(
        method,
        {
          worktree: `id:${worktreeId}`,
          ...params
        },
        options
      )
      if (!response.ok) {
        invalidateTimeoutIfRuntimeChanged(response._meta.runtimeId)
        const error = new Error(
          response.error?.message || 'Source control action failed'
        ) as GitRequestError
        error.code = response.error?.code
        throw error
      }
      invalidateTimeoutIfRuntimeChanged(response._meta.runtimeId)
      return (response as RpcSuccess).result as T
    },
    [client, connState, getGitRequestOptions, invalidateTimeoutIfRuntimeChanged, worktreeId]
  )

  const sendCommitRequest = useCallback(
    async (message: string): Promise<GitCommitResult> => {
      const result = await sendGitRequest<GitCommitResult>('git.commit', { message })
      if (!result || result.success !== true) {
        throw new Error(result?.error || 'Commit failed')
      }
      return result
    },
    [sendGitRequest]
  )

  const readUpstreamStatusForSync = useCallback(async (): Promise<MobileGitUpstreamStatus> => {
    try {
      return await sendGitRequest<MobileGitUpstreamStatus>('git.upstreamStatus')
    } catch (err) {
      const code = err instanceof Error ? (err as GitRequestError).code : undefined
      const message = err instanceof Error ? err.message : String(err)
      if (!isMobileGitUnavailable(code, message)) {
        throw err
      }
      const status = await sendGitRequest<MobileGitStatusResult>('git.status')
      if (!status.upstreamStatus) {
        throw new Error('Branch status unavailable')
      }
      return status.upstreamStatus
    }
  }, [sendGitRequest])

  const runGitSyncSteps = useCallback(async () => {
    await sendGitRequest<unknown>('git.fetch')
    await sendGitRequest<unknown>('git.pull')
    const nextUpstream = await readUpstreamStatusForSync()
    if (nextUpstream.ahead > 0) {
      await sendGitRequest<unknown>('git.push')
    }
  }, [readUpstreamStatusForSync, sendGitRequest])

  return { sendGitRequest, sendCommitRequest, runGitSyncSteps }
}
