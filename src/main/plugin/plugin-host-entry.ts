// NEEDS-RUNTIME-VERIFY: runs inside the forked plugin-host child process.
// Exercised in production only (requires the built `out/` entry + the parent
// fork wiring); its host side, PluginHost, is integration-tested with a fixture
// that speaks this same protocol. Loads the plugin's backend `main`, builds an
// async `context` whose host-backed calls round-trip to the parent over IPC,
// and drives the activate/deactivate lifecycle.

import type {
  BridgeResponse,
  Disposable,
  HostCommand,
  LifecycleEvent,
  PluginContext,
  WorkspaceSnapshot
} from '../../shared/plugin/api-contract'
import { LIFECYCLE_EVENTS } from '../../shared/plugin/api-contract'
import type { HostToPlugin, PluginToHost } from './plugin-host-protocol'

type PluginModule = {
  activate?: (context: PluginContext) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}

function send(message: PluginToHost): void {
  process.send?.(message)
}

// argv: [node, entry, pluginId, mainPath]
const mainPath = process.argv[3]

const pendingHostCalls = new Map<string, (response: BridgeResponse) => void>()
let requestSeq = 0
const uiHandlers = new Set<(message: unknown) => void>()
const eventHandlers = new Map<LifecycleEvent, Set<(payload?: unknown) => void>>()
const disposables: Disposable[] = []
let pluginModule: PluginModule | null = null

function callHost(method: string, params?: unknown): Promise<unknown> {
  const reqId = `req-${requestSeq++}`
  return new Promise((resolve, reject) => {
    pendingHostCalls.set(reqId, (response) => {
      if (response.ok) {
        resolve(response.result)
      } else {
        reject(new Error(response.error))
      }
    })
    send({ type: 'host-request', request: { reqId, method: method as never, params } })
  })
}

function subscribe<T>(set: Set<T>, handler: T): Disposable {
  set.add(handler)
  return {
    dispose() {
      set.delete(handler)
    }
  }
}

function eventSet(event: LifecycleEvent): Set<(payload?: unknown) => void> {
  let set = eventHandlers.get(event)
  if (!set) {
    set = new Set()
    eventHandlers.set(event, set)
  }
  return set
}

function buildContext(): PluginContext {
  const events = Object.fromEntries(
    LIFECYCLE_EVENTS.map((event) => [
      event,
      (cb: (payload?: unknown) => void) => subscribe(eventSet(event), cb)
    ])
  ) as PluginContext['events']

  return {
    workspace: {
      getSnapshot: () => callHost('workspace.getSnapshot') as Promise<WorkspaceSnapshot>,
      onDidChange: (cb) => subscribe(eventSet('onWorkspaceChanged'), cb)
    },
    commands: {
      register: () => ({ dispose() {} }),
      invokeHost: (name: HostCommand, params?: unknown) =>
        callHost('commands.invokeHost', { name, params })
    },
    settings: {
      get: <T = unknown>(key: string) =>
        callHost('settings.get', { key }) as Promise<T | undefined>,
      set: (key: string, value: unknown) =>
        callHost('settings.set', { key, value }) as Promise<void>,
      onDidChange: (cb) => subscribe(eventSet('onSettingsChanged'), cb)
    },
    ui: {
      postMessage: (message: unknown) => send({ type: 'ui', message }),
      onMessage: (cb) => subscribe(uiHandlers, cb)
    },
    events,
    log: (...args: unknown[]) => {
      process.stdout.write(`${args.map((a) => String(a)).join(' ')}\n`)
    },
    subscriptions: disposables
  }
}

async function runActivate(): Promise<void> {
  try {
    // The plugin backend is trusted CJS; require it directly.
    pluginModule = require(mainPath) as PluginModule
    await pluginModule.activate?.(buildContext())
    send({ type: 'ready' })
  } catch (error) {
    send({
      type: 'activate-error',
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

async function runDeactivate(): Promise<void> {
  try {
    await pluginModule?.deactivate?.()
  } finally {
    for (const disposable of disposables.splice(0)) {
      disposable.dispose()
    }
    process.exit(0)
  }
}

process.on('message', (raw: unknown) => {
  const message = raw as HostToPlugin
  switch (message.type) {
    case 'activate':
      void runActivate()
      break
    case 'deactivate':
      void runDeactivate()
      break
    case 'host-response': {
      const resolver = pendingHostCalls.get(message.response.reqId)
      if (resolver) {
        pendingHostCalls.delete(message.response.reqId)
        resolver(message.response)
      }
      break
    }
    case 'ui':
      for (const handler of uiHandlers) {
        handler(message.message)
      }
      break
    case 'event':
      for (const handler of eventSet(message.event)) {
        handler(message.payload)
      }
      break
  }
})
