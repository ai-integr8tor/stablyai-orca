// The client a plugin's UI bundle uses to talk to its backend. Detects the host
// substrate so one UI bundle works on both desktop and mobile:
//   - mobile (react-native-webview): window.ReactNativeWebView.postMessage +
//     'message' events carrying JSON strings.
//   - desktop (Electron <webview>/iframe): window.parent.postMessage + 'message'
//     events carrying structured data.
// Authors vendor this file (or import the published SDK). It is messaging-only
// (matching context.ui's generic post/subscribe); request/response is the
// author's convention on top.
//
// NEEDS-RUNTIME-VERIFY: the exact desktop post target (guest <webview> ->
// renderer) is confirmed when the renderer panel wiring lands and the app runs.
// Substrate detection and the mobile path are unit-tested here.

export type UiBridge = {
  postMessage(message: unknown): void
  onMessage(handler: (message: unknown) => void): () => void
  // Correlated request/response: stamps a reqId, resolves on the matching
  // response, and rejects after timeoutMs so a dropped connection can't leave a
  // pending call hanging forever. Built on postMessage/onMessage.
  request(message: object, options?: { timeoutMs?: number }): Promise<unknown>
}

// Default ceiling for a bridge round-trip; mirrors the mobile rpc-client request
// timeout so a stalled relay surfaces as a rejection in a comparable window.
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

type ReactNativeWebViewWindow = {
  ReactNativeWebView?: { postMessage(data: string): void }
  parent?: { postMessage(data: unknown, targetOrigin: string): void }
  postMessage?(data: unknown, targetOrigin: string): void
  addEventListener?(type: string, listener: (event: { data: unknown }) => void): void
  removeEventListener?(type: string, listener: (event: { data: unknown }) => void): void
}

export function isReactNativeSubstrate(win: ReactNativeWebViewWindow): boolean {
  return typeof win.ReactNativeWebView?.postMessage === 'function'
}

export function createUiBridge(win: ReactNativeWebViewWindow): UiBridge {
  const reactNative = isReactNativeSubstrate(win)

  const postMessage = (message: unknown): void => {
    if (reactNative) {
      win.ReactNativeWebView!.postMessage(JSON.stringify(message))
      return
    }
    // Desktop: post up to the embedder. NEEDS-RUNTIME-VERIFY target.
    const target = win.parent ?? win
    target.postMessage?.(message, '*')
  }

  const onMessage = (handler: (message: unknown) => void): (() => void) => {
    const listener = (event: { data: unknown }): void => {
      // RN delivers JSON strings; desktop delivers structured data.
      if (reactNative && typeof event.data === 'string') {
        try {
          handler(JSON.parse(event.data))
        } catch {
          handler(event.data)
        }
      } else {
        handler(event.data)
      }
    }
    win.addEventListener?.('message', listener)
    return () => win.removeEventListener?.('message', listener)
  }

  let reqCounter = 0
  const request = (message: object, options?: { timeoutMs?: number }): Promise<unknown> => {
    const reqId = `ui-${++reqCounter}`
    const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    return new Promise<unknown>((resolve, reject) => {
      // Declare finish before off/timer so neither callback can reference it in a
      // temporal dead zone even if a substrate ever delivers a message synchronously.
      let settled = false
      let timer: ReturnType<typeof setTimeout>
      const finish = (settle: () => void): void => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        off()
        settle()
      }
      const off = onMessage((incoming) => {
        if (
          typeof incoming === 'object' &&
          incoming !== null &&
          (incoming as { reqId?: unknown }).reqId === reqId
        ) {
          finish(() => resolve(incoming))
        }
      })
      timer = setTimeout(() => {
        finish(() => reject(new Error(`plugin bridge request '${reqId}' timed out`)))
      }, timeoutMs)
      postMessage({ ...message, reqId })
    })
  }

  return { postMessage, onMessage, request }
}
