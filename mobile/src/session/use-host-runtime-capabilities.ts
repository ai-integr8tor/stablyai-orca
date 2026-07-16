import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { MOBILE_AI_VAULT_CAPABILITY } from '../agent-history/agent-history-capability'
import {
  CLIPBOARD_FILE_UPLOAD_RUNTIME_CAPABILITY,
  TERMINAL_QUERY_REPLY_INPUT_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState, RpcSuccess } from '../transport/types'

type StatusWithCapabilities = { capabilities?: string[] }

type HostRuntimeCapabilities = {
  readonly browserScreencastSupported: boolean | null
  // Why: hosts without aiVault.v1 reject aiVault.listSessions, so the header
  // entry stays hidden there (mirrors the gated host-list action) instead of
  // opening a dead-end "update this host" panel.
  readonly agentSessionHistorySupported: boolean | null
  // Why: old hosts strip fileName from the clipboard upload methods and would
  // save a PDF as `….png`, so the unfiltered picker unlocks only when the host
  // advertises clipboard.file-upload.v1. False until the probe resolves.
  readonly fileAttachmentsSupported: boolean
  // Why: read via a ref because stable terminal callbacks are created before
  // the capability probe resolves. Hosts without this capability strip
  // inputKind from terminal.send, so a forwarded xterm reply would become
  // floor-stealing shell input.
  readonly hostQueryReplyInputSupportedRef: MutableRefObject<boolean>
}

// Probes status.get once per connection and exposes which gated host features
// this session may use. Everything resets to "unsupported" on disconnect.
export function useHostRuntimeCapabilities(
  client: Pick<RpcClient, 'sendRequest'> | null,
  connState: ConnectionState
): HostRuntimeCapabilities {
  const [browserScreencastSupported, setBrowserScreencastSupported] = useState<boolean | null>(null)
  const [agentSessionHistorySupported, setAgentSessionHistorySupported] = useState<boolean | null>(
    null
  )
  const [fileAttachmentsSupported, setFileAttachmentsSupported] = useState(false)
  const hostQueryReplyInputSupportedRef = useRef(false)

  useEffect(() => {
    if (!client || connState !== 'connected') {
      setBrowserScreencastSupported(null)
      setAgentSessionHistorySupported(null)
      setFileAttachmentsSupported(false)
      hostQueryReplyInputSupportedRef.current = false
      return
    }
    let stale = false
    void client
      .sendRequest('status.get')
      .then((response) => {
        if (stale || !response.ok) {
          return
        }
        const status = (response as RpcSuccess).result as StatusWithCapabilities
        setBrowserScreencastSupported(
          status.capabilities?.includes('browser.screencast.v1') === true
        )
        setAgentSessionHistorySupported(
          status.capabilities?.includes(MOBILE_AI_VAULT_CAPABILITY) === true
        )
        setFileAttachmentsSupported(
          status.capabilities?.includes(CLIPBOARD_FILE_UPLOAD_RUNTIME_CAPABILITY) === true
        )
        hostQueryReplyInputSupportedRef.current =
          status.capabilities?.includes(TERMINAL_QUERY_REPLY_INPUT_RUNTIME_CAPABILITY) === true
      })
      .catch(() => {
        if (!stale) {
          setBrowserScreencastSupported(false)
          setAgentSessionHistorySupported(false)
          setFileAttachmentsSupported(false)
          hostQueryReplyInputSupportedRef.current = false
        }
      })
    return () => {
      stale = true
    }
  }, [client, connState])

  return {
    browserScreencastSupported,
    agentSessionHistorySupported,
    fileAttachmentsSupported,
    hostQueryReplyInputSupportedRef
  }
}
