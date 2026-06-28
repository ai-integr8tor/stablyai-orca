import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import type { RpcClient } from '../../transport/rpc-client'
import { buildInjectedUiMessage, extractPluginUiMessage } from './mobile-plugin-bridge'

// NEEDS-RUNTIME-VERIFY: plugin HTML is fetched from the relay host (plugin.getEntry),
// not served on-device, because no Node runs on the phone. The async bridge runs
// the trusted backend on the relay: activate on open, post outbound webview
// messages via plugin.postUi, and inject inbound plugin.uiMessage payloads back
// into the WebView so the in-page ui-bridge-client can match reqIds.

type Props = { client: RpcClient; pluginId: string }

type GetEntryResult = { ok?: boolean; html?: string }

export function MobilePluginPanel({ client, pluginId }: Props): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const webViewRef = useRef<WebView>(null)

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setFailed(false)
    client
      .sendRequest('plugin.getEntry', { pluginId })
      .then(async (response) => {
        if (cancelled) {
          return
        }
        const result = response.ok ? (response.result as GetEntryResult) : undefined
        if (!result?.ok || typeof result.html !== 'string') {
          setFailed(true)
          return
        }
        setHtml(result.html)
        // Start the trusted backend child on the relay host. Surface a failed
        // start instead of leaving the user on a UI whose backend never ran.
        const activated = await client.sendRequest('plugin.activate', { pluginId })
        const activeOk =
          activated.ok && (activated.result as { ok?: boolean } | undefined)?.ok === true
        if (!cancelled && !activeOk) {
          setFailed(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
      // Stop the backend child when the panel closes / switches plugins so
      // children don't accumulate on the relay. Best-effort fire-and-forget.
      void client.sendRequest('plugin.deactivate', { pluginId })
    }
  }, [client, pluginId])

  // Deliver backend -> UI messages into the WebView. The relay pushes them as
  // plugin.uiMessage notifications; we inject only this plugin's traffic.
  useEffect(() => {
    return client.onNotification('plugin.uiMessage', (params) => {
      const match = extractPluginUiMessage(params, pluginId)
      if (match.matched) {
        webViewRef.current?.injectJavaScript(buildInjectedUiMessage(match.message))
      }
    })
  }, [client, pluginId])

  const onMessage = (event: WebViewMessageEvent): void => {
    try {
      const message = JSON.parse(event.nativeEvent.data)
      void client.sendRequest('plugin.postUi', { pluginId, message })
    } catch {
      // Ignore non-JSON messages from the plugin UI.
    }
  }

  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>This plugin failed to load.</Text>
      </View>
    )
  }
  if (html === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }
  return (
    <WebView
      ref={webViewRef}
      originWhitelist={['*']}
      source={{ html }}
      onMessage={onMessage}
      javaScriptEnabled
      style={styles.webview}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  error: { color: '#ff6b6b', fontSize: 13 },
  webview: { flex: 1, backgroundColor: 'transparent' }
})
