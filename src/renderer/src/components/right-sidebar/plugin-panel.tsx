import { useEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'

// NEEDS-RUNTIME-VERIFY: renders a plugin's sandboxed UI in an imperatively
// created <webview> (the repo manages webviews imperatively, not via JSX). The
// guest loads orca-plugin://<id>/ in its own partition with Node disabled —
// fault isolation, not a privilege boundary (the backend is trusted).
//
// The guest<->host message channel for a no-preload guest is the murky desktop
// bit the plan flags: a sandboxed guest cannot reach window.api, so messages
// must cross via the webview element. We listen for `ipc-message` and forward to
// the backend; whether the guest can emit without a minimal plugin preload is
// exactly what the runtime pass must confirm.

type PluginPanelProps = { pluginId: string }

type PanelStatus = 'loading' | 'ready' | 'error'

export function PluginPanel({ pluginId }: PluginPanelProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<PanelStatus>('loading')

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    setStatus('loading')
    const webview = document.createElement('webview') as Electron.WebviewTag
    webview.setAttribute('src', `orca-plugin://${pluginId}/index.html`)
    webview.setAttribute('partition', `persist:orca-plugin-${pluginId}`)
    webview.setAttribute('nodeintegration', 'off')
    webview.setAttribute('webpreferences', 'contextIsolation=yes, sandbox=yes, nodeIntegration=no')
    webview.style.width = '100%'
    webview.style.height = '100%'
    webview.style.border = '0'

    const onReady = (): void => setStatus('ready')
    const onFail = (): void => setStatus('error')
    const onCrash = (): void => setStatus('error')
    const onIpc = (event: Electron.IpcMessageEvent): void => {
      if (event.channel === 'plugin-ui') {
        void window.api.plugins.sendUiMessage(pluginId, event.args?.[0])
      }
    }

    webview.addEventListener('dom-ready', onReady)
    webview.addEventListener('did-fail-load', onFail)
    webview.addEventListener('render-process-gone', onCrash)
    webview.addEventListener('ipc-message', onIpc)
    container.appendChild(webview)

    return () => {
      webview.removeEventListener('dom-ready', onReady)
      webview.removeEventListener('did-fail-load', onFail)
      webview.removeEventListener('render-process-gone', onCrash)
      webview.removeEventListener('ipc-message', onIpc)
      webview.remove()
    }
  }, [pluginId])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {status === 'loading' && (
        <div className="text-muted-foreground p-3 text-xs">
          {translate('plugins.panel.loading', 'Loading plugin…')}
        </div>
      )}
      {status === 'error' && (
        <div className="text-destructive p-3 text-xs">
          {translate('plugins.panel.loadError', 'This plugin failed to load.')}
        </div>
      )}
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  )
}
