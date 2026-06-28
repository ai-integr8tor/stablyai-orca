import { useCallback, useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// NEEDS-RUNTIME-VERIFY: Settings → Plugins management UI. Lists installed
// plugins, toggles activation, removes, and installs from a local folder via
// window.api.plugins. The trusted-runtime model means every plugin runs with
// full machine access — the pane states this prominently. (Preview-gating and
// the multi-source install dialog are follow-ups; v1a is local-folder install.)

type PluginRow = { id: string; version: string; active: boolean; title: string; icon: string }

export function PluginsPane(): React.JSX.Element {
  const [plugins, setPlugins] = useState<PluginRow[]>([])
  const [sourceDir, setSourceDir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setPlugins(await window.api.plugins.list())
    } catch {
      setPlugins([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const install = useCallback(async () => {
    if (!sourceDir.trim()) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.plugins.installFromSource(sourceDir.trim())
      if (!result.ok) {
        setError(
          result.errors?.join('; ') ?? translate('plugins.pane.installFailed', 'Install failed')
        )
      } else {
        setSourceDir('')
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [sourceDir, refresh])

  const toggle = useCallback(
    async (plugin: PluginRow) => {
      await (plugin.active
        ? window.api.plugins.deactivate(plugin.id)
        : window.api.plugins.activate(plugin.id))
      await refresh()
    },
    [refresh]
  )

  const remove = useCallback(
    async (plugin: PluginRow) => {
      await window.api.plugins.remove(plugin.id)
      await refresh()
    },
    [refresh]
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        {translate(
          'plugins.pane.trustWarning',
          'Plugins run with full access to your computer (files, network, processes). Only install plugins you trust.'
        )}
      </p>

      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-muted-foreground text-xs" htmlFor="plugin-source">
            {translate(
              'plugins.pane.installFromSource',
              'Install a plugin (npm name, git URL, .tgz, or local path)'
            )}
          </label>
          <Input
            id="plugin-source"
            value={sourceDir}
            placeholder={translate(
              'plugins.pane.sourcePlaceholder',
              '@acme/orca-foo or /path/to/plugin'
            )}
            onChange={(event) => setSourceDir(event.target.value)}
          />
        </div>
        <Button disabled={busy || !sourceDir.trim()} onClick={() => void install()}>
          {translate('plugins.pane.install', 'Install')}
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}

      {plugins.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {translate('plugins.pane.empty', 'No plugins installed yet.')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {plugins.map((plugin) => (
            <li
              key={plugin.id}
              className="flex items-center justify-between rounded-md border border-border p-3"
            >
              <div className="flex flex-col">
                <span className="text-sm">{plugin.title}</span>
                <span className="text-muted-foreground text-xs">
                  {translate('plugins.pane.idVersion', '{{id}} · v{{version}}', {
                    id: plugin.id,
                    version: plugin.version
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => void toggle(plugin)}>
                  {plugin.active
                    ? translate('plugins.pane.deactivate', 'Deactivate')
                    : translate('plugins.pane.activate', 'Activate')}
                </Button>
                <Button variant="destructive" onClick={() => void remove(plugin)}>
                  {translate('plugins.pane.remove', 'Remove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
