import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerRelayPluginHandlers, type RelayDispatcherLike } from './plugin-handler'
import type { PluginHostConfig } from '../main/plugin/plugin-host-process'
import type { PluginHostLike } from '../main/plugin/plugin-runtime'
import { serializePluginBundle } from '../main/plugin/plugin-bundle'
import { discoverPlugins } from '../main/plugin/plugin-discovery'

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'acme.foo',
    name: 'Foo',
    version: '1.0.0',
    hostApiVersion: '0.1.0',
    main: 'main.js',
    contributes: { sidebar: { title: 'Foo', icon: 'Activity', ui: 'index.html' } },
    capabilities: ['workspace:read'],
    ...overrides
  }
}

type Handler = (params: Record<string, unknown>, ctx: { clientId?: number }) => Promise<unknown>
type FakeHost = PluginHostLike & { config: PluginHostConfig; posted: unknown[]; stopped: boolean }
type Notification = { clientId: number; method: string; params?: Record<string, unknown> }

let tmp: string
let handlers: Map<string, Handler>
let notifications: Notification[]
let detachListeners: ((clientId: number) => void)[]
let hosts: FakeHost[]
let failStart: boolean

function fakeDispatcher(): RelayDispatcherLike {
  handlers = new Map()
  notifications = []
  detachListeners = []
  return {
    onRequest: (method, handler) => handlers.set(method, handler),
    notifyClient: (clientId, method, params) => notifications.push({ clientId, method, params }),
    onClientDetached: (listener) => {
      detachListeners.push(listener)
      return () => {}
    }
  }
}

function fakeHostFactory(config: PluginHostConfig): FakeHost {
  const host: FakeHost = {
    config,
    posted: [],
    stopped: false,
    start: () => (failStart ? Promise.reject(new Error('boom')) : Promise.resolve()),
    stop: () => {
      host.stopped = true
      return Promise.resolve()
    },
    isRunning: () => !host.stopped && !failStart,
    postUi: (message) => host.posted.push(message),
    terminate: () => {
      host.stopped = true
    }
  }
  hosts.push(host)
  return host
}

function installFixture(id = 'acme.foo'): void {
  const dir = join(tmp, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plugin.json'), JSON.stringify(manifest({ id })))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><body>hi</body>')
}

const ctx = (clientId: number): { clientId: number } => ({ clientId })

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'relay-plugin-'))
  hosts = []
  failStart = false
  registerRelayPluginHandlers(fakeDispatcher(), {
    pluginsDir: tmp,
    stateFilePath: join(tmp, 'state.json'),
    getWorkspaceSnapshot: () => ({
      workspaceName: 'w',
      currentBranch: 'main',
      isDirty: false,
      openFileCount: 1
    }),
    hostFactory: fakeHostFactory
  })
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('relay plugin handlers', () => {
  it('plugin.list returns discovered plugins', async () => {
    installFixture()
    const result = (await handlers.get('plugin.list')!({}, {})) as { plugins: { id: string }[] }
    expect(result.plugins.map((p) => p.id)).toEqual(['acme.foo'])
  })

  it('plugin.getEntry returns the single UI html', async () => {
    installFixture()
    const result = (await handlers.get('plugin.getEntry')!({ pluginId: 'acme.foo' }, {})) as {
      ok: boolean
      html?: string
    }
    expect(result.ok).toBe(true)
    expect(result.html).toContain('<body>hi</body>')
  })

  it('plugin.getEntry rejects an unknown plugin', async () => {
    const result = (await handlers.get('plugin.getEntry')!({ pluginId: 'nope' }, {})) as {
      ok: boolean
    }
    expect(result.ok).toBe(false)
  })

  it('plugin.getEntry reports entry_missing when the UI file is absent', async () => {
    const dir = join(tmp, 'acme.foo')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'plugin.json'), JSON.stringify(manifest()))
    const result = (await handlers.get('plugin.getEntry')!({ pluginId: 'acme.foo' }, {})) as {
      ok: boolean
      error?: string
    }
    expect(result).toEqual({ ok: false, error: 'entry_missing' })
  })

  it('plugin.activate starts the backend for an installed plugin', async () => {
    installFixture()
    const result = (await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(1))) as {
      ok: boolean
    }
    expect(result.ok).toBe(true)
    expect(hosts).toHaveLength(1)
    expect(hosts[0].config.pluginId).toBe('acme.foo')
  })

  it('plugin.activate rejects an unknown id before forking', async () => {
    const result = (await handlers.get('plugin.activate')!({ pluginId: 'nope' }, ctx(1))) as {
      ok: boolean
      error?: string
    }
    expect(result).toEqual({ ok: false, error: 'unknown_plugin' })
    expect(hosts).toHaveLength(0)
  })

  it('plugin.activate rejects a traversal-shaped id before forking', async () => {
    const result = (await handlers.get('plugin.activate')!({ pluginId: '../evil' }, ctx(1))) as {
      ok: boolean
    }
    expect(result.ok).toBe(false)
    expect(hosts).toHaveLength(0)
  })

  it('plugin.deactivate rejects a traversal-shaped id', async () => {
    const result = (await handlers.get('plugin.deactivate')!({ pluginId: '../evil' }, ctx(1))) as {
      ok: boolean
      error?: string
    }
    expect(result).toEqual({ ok: false, error: 'invalid_params' })
  })

  it('plugin.postUi lazily activates and forwards the message to the child', async () => {
    installFixture()
    const result = (await handlers.get('plugin.postUi')!(
      { pluginId: 'acme.foo', message: { reqId: 'r1', method: 'settings.get' } },
      ctx(1)
    )) as { ok: boolean }
    expect(result.ok).toBe(true)
    expect(hosts).toHaveLength(1)
    expect(hosts[0].posted).toEqual([{ reqId: 'r1', method: 'settings.get' }])
  })

  it('plugin.postUi returns activation_failed when the backend cannot start', async () => {
    installFixture()
    failStart = true
    const result = (await handlers.get('plugin.postUi')!(
      { pluginId: 'acme.foo', message: {} },
      ctx(1)
    )) as { ok: boolean; error?: string }
    expect(result).toEqual({ ok: false, error: 'activation_failed' })
  })

  it('plugin.postUi rejects an unknown id', async () => {
    const result = (await handlers.get('plugin.postUi')!(
      { pluginId: 'nope', message: {} },
      ctx(1)
    )) as {
      ok: boolean
      error?: string
    }
    expect(result).toEqual({ ok: false, error: 'unknown_plugin' })
  })

  it('routes child uiMessages only to the client that opened the plugin', async () => {
    installFixture()
    // Client 1 opens the plugin; client 2 never does.
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(1))
    hosts[0].config.onUiMessage!({ reqId: 'r1', ok: true, result: null })
    expect(notifications).toEqual([
      {
        clientId: 1,
        method: 'plugin.uiMessage',
        params: { pluginId: 'acme.foo', message: { reqId: 'r1', ok: true, result: null } }
      }
    ])
    // Nothing was sent to any other client — no cross-client leak.
    expect(notifications.every((n) => n.clientId === 1)).toBe(true)
  })

  it('stops delivering to a client after it detaches', async () => {
    installFixture()
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(1))
    detachListeners.forEach((fn) => fn(1))
    hosts[0].config.onUiMessage!({ reqId: 'r1', ok: true })
    expect(notifications).toHaveLength(0)
  })

  it('plugin.deactivate stops the backend for the only subscriber', async () => {
    installFixture()
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(1))
    const result = (await handlers.get('plugin.deactivate')!({ pluginId: 'acme.foo' }, ctx(1))) as {
      ok: boolean
    }
    expect(result.ok).toBe(true)
    expect(hosts[0].stopped).toBe(true)
  })

  it('keeps the shared backend running until the last subscriber deactivates', async () => {
    installFixture()
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(1))
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(2))
    // One shared child for both clients.
    expect(hosts).toHaveLength(1)
    await handlers.get('plugin.deactivate')!({ pluginId: 'acme.foo' }, ctx(1))
    expect(hosts[0].stopped).toBe(false)
    await handlers.get('plugin.deactivate')!({ pluginId: 'acme.foo' }, ctx(2))
    expect(hosts[0].stopped).toBe(true)
  })

  it('stops the child only when the last subscriber detaches', async () => {
    installFixture()
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(1))
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(2))
    detachListeners.forEach((fn) => fn(1))
    await Promise.resolve()
    expect(hosts[0].stopped).toBe(false)
    detachListeners.forEach((fn) => fn(2))
    await Promise.resolve()
    expect(hosts[0].stopped).toBe(true)
  })

  it('plugin.deactivate with no clientId fully stops the backend', async () => {
    installFixture()
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(1))
    await handlers.get('plugin.deactivate')!({ pluginId: 'acme.foo' }, {})
    expect(hosts[0].stopped).toBe(true)
  })

  it('plugin.deactivate on a never-activated plugin is a no-op success', async () => {
    installFixture()
    const result = (await handlers.get('plugin.deactivate')!({ pluginId: 'acme.foo' }, ctx(1))) as {
      ok: boolean
    }
    expect(result.ok).toBe(true)
    expect(hosts).toHaveLength(0)
  })

  it('deactivate by a non-subscriber leaves another client’s child running', async () => {
    installFixture()
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(1))
    // Client 2 never activated this plugin; its deactivate must not stop client 1's child.
    await handlers.get('plugin.deactivate')!({ pluginId: 'acme.foo' }, ctx(2))
    expect(hosts[0].stopped).toBe(false)
  })

  it('detaching a client releases every plugin it had open', async () => {
    installFixture('acme.foo')
    installFixture('acme.bar')
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(1))
    await handlers.get('plugin.activate')!({ pluginId: 'acme.bar' }, ctx(1))
    expect(hosts).toHaveLength(2)
    detachListeners.forEach((fn) => fn(1))
    await Promise.resolve()
    expect(hosts.every((h) => h.stopped)).toBe(true)
  })

  it('plugin.provision writes a valid bundle, then discoverPlugins finds it', async () => {
    const bundle = serializePluginBundle('acme.bar', [
      { path: 'plugin.json', dataBase64: b64(JSON.stringify(manifest({ id: 'acme.bar' }))) },
      { path: 'index.html', dataBase64: b64('<!doctype html>') }
    ])
    const result = (await handlers.get('plugin.provision')!({ bundle }, {})) as { ok: boolean }
    expect(result.ok).toBe(true)
    expect(discoverPlugins(tmp).valid.map((p) => p.manifest.id)).toContain('acme.bar')
  })

  it('plugin.provision rejects an invalid bundle param through the dispatch layer', async () => {
    const result = (await handlers.get('plugin.provision')!({ bundle: null }, {})) as {
      ok: boolean
      error?: string
    }
    expect(result).toEqual({ ok: false, error: 'invalid_bundle' })
  })
})

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64')

describe('relay plugin discovery cache', () => {
  // Register a fresh handler set whose discovery scans are counted, so cache
  // hits/invalidations are assertable without real-filesystem churn.
  function registerCounting(): { scans: () => number } {
    let scans = 0
    registerRelayPluginHandlers(fakeDispatcher(), {
      pluginsDir: tmp,
      stateFilePath: join(tmp, 'state.json'),
      getWorkspaceSnapshot: () => ({
        workspaceName: 'w',
        currentBranch: 'main',
        isDirty: false,
        openFileCount: 1
      }),
      hostFactory: fakeHostFactory,
      discover: (dir) => {
        scans++
        return discoverPlugins(dir)
      }
    })
    return { scans: () => scans }
  }

  it('scans once for back-to-back list/activate/getEntry (cache hit)', async () => {
    installFixture()
    const counter = registerCounting()
    await handlers.get('plugin.list')!({}, {})
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(1))
    await handlers.get('plugin.getEntry')!({ pluginId: 'acme.foo' }, {})
    expect(counter.scans()).toBe(1)
  })

  it('invalidates on a successful provision so the new plugin activates', async () => {
    installFixture('acme.foo')
    const counter = registerCounting()
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(1)) // scan 1, cached
    const bundle = serializePluginBundle('acme.bar', [
      { path: 'plugin.json', dataBase64: b64(JSON.stringify(manifest({ id: 'acme.bar' }))) },
      { path: 'index.html', dataBase64: b64('<!doctype html>') }
    ])
    const provisioned = (await handlers.get('plugin.provision')!({ bundle }, {})) as { ok: boolean }
    expect(provisioned.ok).toBe(true)
    const activated = (await handlers.get('plugin.activate')!(
      { pluginId: 'acme.bar' },
      ctx(1)
    )) as { ok: boolean }
    expect(activated.ok).toBe(true) // not a stale unknown_plugin
    expect(counter.scans()).toBe(2) // cache was cleared by the provision
  })

  it('does not invalidate on a failed provision', async () => {
    installFixture()
    const counter = registerCounting()
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(1)) // scan 1, cached
    const failed = (await handlers.get('plugin.provision')!({ bundle: null }, {})) as {
      ok: boolean
    }
    expect(failed.ok).toBe(false)
    await handlers.get('plugin.list')!({}, {}) // cache read, no re-scan
    expect(counter.scans()).toBe(1)
  })

  it('rejects an unsafe pluginId before touching discovery (id-safety gate first)', async () => {
    const counter = registerCounting()
    const result = (await handlers.get('plugin.activate')!({ pluginId: '../evil' }, ctx(1))) as {
      ok: boolean
      error?: string
    }
    expect(result).toEqual({ ok: false, error: 'unknown_plugin' })
    expect(counter.scans()).toBe(0) // discovery never ran
  })

  it('plugin.getEntry also gates an unsafe pluginId before touching discovery', async () => {
    const counter = registerCounting()
    const result = (await handlers.get('plugin.getEntry')!({ pluginId: '../evil' }, {})) as {
      ok: boolean
      error?: string
    }
    expect(result).toEqual({ ok: false, error: 'unknown_plugin' })
    expect(counter.scans()).toBe(0)
  })

  it('plugin.postUi reads the cache instead of re-scanning', async () => {
    installFixture()
    const counter = registerCounting()
    await handlers.get('plugin.list')!({}, {}) // warm the cache (scan 1)
    await handlers.get('plugin.postUi')!({ pluginId: 'acme.foo', message: {} }, ctx(1))
    expect(counter.scans()).toBe(1)
  })

  it('a newly-provisioned plugin appears in plugin.list (cache invalidated)', async () => {
    const counter = registerCounting()
    await handlers.get('plugin.list')!({}, {}) // scan 1, cached (empty)
    const bundle = serializePluginBundle('acme.bar', [
      { path: 'plugin.json', dataBase64: b64(JSON.stringify(manifest({ id: 'acme.bar' }))) },
      { path: 'index.html', dataBase64: b64('<!doctype html>') }
    ])
    const provisioned = (await handlers.get('plugin.provision')!({ bundle }, {})) as { ok: boolean }
    expect(provisioned.ok).toBe(true)
    const listed = (await handlers.get('plugin.list')!({}, {})) as { plugins: { id: string }[] }
    expect(listed.plugins.map((p) => p.id)).toContain('acme.bar')
    expect(counter.scans()).toBe(2) // re-scanned after invalidation
  })

  it('keeps a fresh cache per handler instance (no cross-instance leakage)', async () => {
    installFixture()
    const first = registerCounting()
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(1))
    expect(first.scans()).toBe(1)
    // A second registration starts cold and must scan on its own first read.
    const second = registerCounting()
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, ctx(1))
    expect(second.scans()).toBe(1)
  })
})
