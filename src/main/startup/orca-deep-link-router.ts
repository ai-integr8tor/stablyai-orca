import path from 'node:path'
import type { App } from 'electron'
import { ORCA_URL_SCHEME, parseOrcaDeepLink } from '../../shared/orca-deep-link'

/**
 * Register `orca://` as a protocol the OS routes to this app. Packaged builds
 * also declare the scheme via electron-builder `protocols` (Info.plist
 * CFBundleURLTypes / Windows NSIS); this runtime call covers the dev-launched
 * (`electron .`) case and is harmless when the static registration already
 * exists.
 */
export function registerOrcaUrlScheme(app: Pick<App, 'setAsDefaultProtocolClient'>): void {
  // Why: under `electron .` (process.defaultApp), the OS must be told to launch
  // the Electron binary with the app path so the deep-link reaches our main,
  // not a bare Electron shell. Packaged builds register the app directly.
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(ORCA_URL_SCHEME, process.execPath, [
        path.resolve(process.argv[1])
      ])
    }
    return
  }
  app.setAsDefaultProtocolClient(ORCA_URL_SCHEME)
}

export type OrcaDeepLinkRouterDeps = {
  /** True once the runtime + main window exist and a focus can be honored. */
  isReady: () => boolean
  /** Bring the existing main window to the foreground. */
  focusWindow: () => void
  /** Reuse the canonical focus action behind `terminal focus`/notification clicks. */
  focusTerminalByHandle: (handle: string) => Promise<unknown>
  onError?: (error: unknown, url: string) => void
}

export type OrcaDeepLinkRouter = {
  /** Route a deep-link URL now, or defer it until the app is ready. */
  route: (url: string) => void
  /** Replay a deep-link that arrived before the app was ready (cold launch). */
  flushPending: () => void
}

/**
 * A single router for every `orca://` entry point — macOS `open-url`,
 * Windows/Linux argv, and in-terminal OSC 8 clicks forwarded from the renderer.
 * Unknown links are ignored; the window is only focused for a valid action so a
 * hostile terminal cannot steal focus with garbage `orca://` strings.
 */
export function createOrcaDeepLinkRouter(deps: OrcaDeepLinkRouterDeps): OrcaDeepLinkRouter {
  let pendingUrl: string | null = null

  const handle = (url: string): void => {
    const link = parseOrcaDeepLink(url)
    if (!link) {
      return
    }
    deps.focusWindow()
    void Promise.resolve(deps.focusTerminalByHandle(link.handle)).catch((error) => {
      deps.onError?.(error, url)
    })
  }

  const route = (url: string): void => {
    if (deps.isReady()) {
      handle(url)
      return
    }
    // Why: a cold-launch deep-link can arrive before the runtime/window exist.
    // Hold the most recent one and replay it once the app reports ready.
    pendingUrl = url
  }

  return {
    route,
    flushPending: () => {
      if (pendingUrl === null) {
        return
      }
      const url = pendingUrl
      pendingUrl = null
      route(url)
    }
  }
}
