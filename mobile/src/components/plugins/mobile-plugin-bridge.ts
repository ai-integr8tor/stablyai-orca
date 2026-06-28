// Pure helpers for the mobile plugin async bridge. No React/native imports so
// the injectJavaScript snippet builder and the notification filter are
// unit-testable under node Vitest.
//
// Inbound delivery mirrors the in-webview ui-bridge-client (src/shared/plugin/
// ui-bridge-client.ts): on the RN substrate it listens for window 'message'
// events whose data is a JSON string, so we deliver a backend message by
// dispatching exactly that event inside the WebView.

export type PluginUiMatch = { matched: true; message: unknown } | { matched: false }

// Build the JS injected into the WebView to hand a backend message to the
// in-page bridge. The payload is double-encoded: JSON.stringify(message) is the
// string the bridge expects as event.data, and the outer stringify turns that
// into a safe JS string literal (escaping quotes/newlines).
export function buildInjectedUiMessage(message: unknown): string {
  const dataLiteral = JSON.stringify(JSON.stringify(message))
  // Trailing `true;` is the react-native-webview convention to avoid a warning
  // about injected scripts that don't return a value.
  return `(function(){try{window.dispatchEvent(new MessageEvent('message',{data:${dataLiteral}}));}catch(e){}})();true;`
}

// Filter a plugin.uiMessage notification to the panel's own pluginId. Returns
// matched:false for a different/absent pluginId so a panel ignores other
// plugins' traffic on the shared connection.
export function extractPluginUiMessage(
  params: Record<string, unknown>,
  pluginId: string
): PluginUiMatch {
  if (typeof params.pluginId !== 'string' || params.pluginId !== pluginId) {
    return { matched: false }
  }
  return { matched: true, message: params.message }
}
