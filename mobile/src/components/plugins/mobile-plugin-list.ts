// Pure parsing for the mobile plugin list. No React/native imports so the
// plugin.list response → row mapping is unit-testable under node Vitest, the
// same split MobileSourceControl/session-panel-host use for their pure logic.

export type MobilePluginRow = { id: string; title: string; icon: string }

type RpcLike = { ok?: boolean; result?: unknown } | null | undefined

// Project a relay plugin.list response into selectable rows. Tolerant of a
// failed/empty response and of malformed entries (skips anything without a
// string id), so a single bad manifest can't blank the whole list.
export function parsePluginListResult(response: RpcLike): MobilePluginRow[] {
  if (!response?.ok || typeof response.result !== 'object' || response.result === null) {
    return []
  }
  const plugins = (response.result as { plugins?: unknown }).plugins
  if (!Array.isArray(plugins)) {
    return []
  }
  const rows: MobilePluginRow[] = []
  for (const entry of plugins) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }
    const { id, title, icon } = entry as { id?: unknown; title?: unknown; icon?: unknown }
    if (typeof id !== 'string' || id.length === 0) {
      continue
    }
    rows.push({
      id,
      title: typeof title === 'string' && title.length > 0 ? title : id,
      icon: typeof icon === 'string' && icon.length > 0 ? icon : 'Plug'
    })
  }
  return rows
}
