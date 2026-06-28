import { useEffect, useState } from 'react'
import * as LucideIcons from 'lucide-react'
import { Plug } from 'lucide-react'
import type { ActivityBarItem } from './activity-bar-buttons'

type IconComponent = ActivityBarItem['icon']

// Resolve a manifest's Lucide icon NAME to a component, falling back to Plug for
// an unknown name (manifest validation only checks the name's format, not
// membership — that resolution happens here, where lucide-react is available).
// The namespace also exports non-icon helpers (createLucideIcon, toKebabCase…)
// whose names an untrusted manifest could request; only Lucide's forwardRef icon
// components (objects carrying `$$typeof`) are renderable, so anything else —
// including those plain-function helpers — falls back to Plug rather than
// crashing the sidebar.
export function resolveIcon(name: string): IconComponent {
  const candidate = (LucideIcons as Record<string, unknown>)[name]
  if (typeof candidate === 'object' && candidate !== null && '$$typeof' in candidate) {
    return candidate as IconComponent
  }
  return Plug
}

// NEEDS-RUNTIME-VERIFY: builds activity-bar items for ACTIVE plugins from the
// plugin registry (window.api.plugins.list()). Inactive/installed plugins are
// managed in Settings, not shown in the bar. Refetches on mount; a future
// onChanged subscription would keep it live.
export function usePluginActivityItems(): ActivityBarItem[] {
  const [items, setItems] = useState<ActivityBarItem[]>([])
  useEffect(() => {
    let cancelled = false
    window.api.plugins
      .list()
      .then((plugins) => {
        if (cancelled) {
          return
        }
        setItems(
          plugins
            .filter((plugin) => plugin.active)
            .map((plugin) => ({
              id: `plugin:${plugin.id}`,
              icon: resolveIcon(plugin.icon),
              title: plugin.title,
              shortcut: ''
            }))
        )
      })
      .catch(() => {
        // Registry unavailable (e.g. plugin system failed to init) — no tabs.
      })
    return () => {
      cancelled = true
    }
  }, [])
  return items
}
