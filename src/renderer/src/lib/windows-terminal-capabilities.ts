import { useEffect, useState } from 'react'

export type WindowsTerminalCapabilities = {
  wslAvailable: boolean
  pwshAvailable: boolean
}

const UNAVAILABLE_CAPABILITIES: WindowsTerminalCapabilities = {
  wslAvailable: false,
  pwshAvailable: false
}

let cachedCapabilities: WindowsTerminalCapabilities | null = null
let pendingCapabilities: Promise<WindowsTerminalCapabilities> | null = null
const subscribers = new Set<(capabilities: WindowsTerminalCapabilities) => void>()

function publish(capabilities: WindowsTerminalCapabilities): void {
  cachedCapabilities = capabilities
  for (const subscriber of subscribers) {
    subscriber(capabilities)
  }
}

export function getCachedWindowsTerminalCapabilities(): WindowsTerminalCapabilities {
  return cachedCapabilities ?? UNAVAILABLE_CAPABILITIES
}

export function loadWindowsTerminalCapabilities(): Promise<WindowsTerminalCapabilities> {
  if (cachedCapabilities) {
    return Promise.resolve(cachedCapabilities)
  }
  if (pendingCapabilities) {
    return pendingCapabilities
  }

  // Why: Settings and the tab bar need one shared answer. Separate probes can
  // leave Settings rendering without WSL while the "+" menu already shows it.
  pendingCapabilities = Promise.all([
    window.api.wsl.isAvailable().catch(() => false),
    window.api.pwsh.isAvailable().catch(() => false)
  ])
    .then(([wslAvailable, pwshAvailable]) => {
      const capabilities = { wslAvailable, pwshAvailable }
      pendingCapabilities = null
      publish(capabilities)
      return capabilities
    })
    .catch(() => {
      pendingCapabilities = null
      publish(UNAVAILABLE_CAPABILITIES)
      return UNAVAILABLE_CAPABILITIES
    })

  return pendingCapabilities
}

export function useWindowsTerminalCapabilities(enabled: boolean): WindowsTerminalCapabilities {
  const [capabilities, setCapabilities] = useState(getCachedWindowsTerminalCapabilities)

  useEffect(() => {
    if (!enabled) {
      setCapabilities(UNAVAILABLE_CAPABILITIES)
      return
    }

    setCapabilities(getCachedWindowsTerminalCapabilities())
    subscribers.add(setCapabilities)
    void loadWindowsTerminalCapabilities().then(setCapabilities)

    return () => {
      subscribers.delete(setCapabilities)
    }
  }, [enabled])

  return enabled ? capabilities : UNAVAILABLE_CAPABILITIES
}

export function resetWindowsTerminalCapabilitiesForTests(): void {
  cachedCapabilities = null
  pendingCapabilities = null
  subscribers.clear()
}
