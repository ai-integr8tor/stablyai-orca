import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginManager } from './plugin-manager'
import { PluginRuntime, type PluginHostLike } from './plugin-runtime'
import type { PluginHostConfig } from './plugin-host-process'

function validManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

// When true, the next FakeHost.start() rejects — models an activate-error /
// crash-before-ready so the runtime's failed-start cleanup can be asserted.
let failStart = false

class FakeHost implements PluginHostLike {
  private up = false
  terminated = false
  readonly config: PluginHostConfig
  constructor(config: PluginHostConfig) {
    this.config = config
  }
  start(): Promise<void> {
    if (failStart) {
      return Promise.reject(new Error('start failed'))
    }
    this.up = true
    return Promise.resolve()
  }
  stop(): Promise<void> {
    this.up = false
    return Promise.resolve()
  }
  isRunning(): boolean {
    return this.up
  }
  postUi(): void {}
  terminate(): void {
    this.up = false
    this.terminated = true
  }
  // test helper: simulate a crash
  crash(): void {
    this.up = false
    this.config.onExit?.({ code: 1, signal: null, expected: false })
  }
}

let tmp: string
let pluginsDir: string
let manager: PluginManager
let hosts: FakeHost[]
let scheduled: (() => void)[]
let runtime: PluginRuntime

function makeSource(): string {
  const src = join(tmp, `source-${hosts.length}-${scheduled.length}`)
  mkdirSync(src, { recursive: true })
  writeFileSync(join(src, 'plugin.json'), JSON.stringify(validManifest()))
  writeFileSync(join(src, 'main.js'), 'module.exports={activate(){},deactivate(){}}')
  writeFileSync(join(src, 'index.html'), '<!doctype html>')
  return src
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'plugin-runtime-'))
  pluginsDir = join(tmp, 'installed')
  mkdirSync(pluginsDir, { recursive: true })
  manager = new PluginManager({ pluginsDir, stateFilePath: join(tmp, 'state.json') })
  hosts = []
  scheduled = []
  failStart = false
  runtime = new PluginRuntime({
    manager,
    pluginsDir,
    entryPath: 'unused',
    getWorkspaceSnapshot: () => ({
      workspaceName: 'w',
      currentBranch: 'main',
      isDirty: false,
      openFileCount: 0
    }),
    invokeCommand: async () => 'ok',
    hostFactory: (config) => {
      const host = new FakeHost(config)
      hosts.push(host)
      return host
    },
    scheduleRestart: (_ms, run) => {
      scheduled.push(run)
    }
  })
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('PluginRuntime', () => {
  it('activates an installed plugin: spawns a host and marks it active', async () => {
    manager.installLocal(makeSource())
    const result = await runtime.activate('acme.foo')
    expect(result.ok).toBe(true)
    expect(runtime.isRunning('acme.foo')).toBe(true)
    expect(manager.get('acme.foo')?.active).toBe(true)
    expect(hosts).toHaveLength(1)
  })

  it('fails to activate a plugin with no valid manifest on disk', async () => {
    const result = await runtime.activate('ghost')
    expect(result.ok).toBe(false)
    expect(runtime.isRunning('ghost')).toBe(false)
  })

  it('restarts a crashed plugin via the scheduled backoff', async () => {
    manager.installLocal(makeSource())
    await runtime.activate('acme.foo')
    expect(hosts).toHaveLength(1)

    hosts[0].crash()
    expect(runtime.isRunning('acme.foo')).toBe(false)
    expect(scheduled).toHaveLength(1)

    scheduled[0]() // fire the backoff restart
    await flush()
    expect(hosts).toHaveLength(2) // a fresh host was spawned
    expect(runtime.isRunning('acme.foo')).toBe(true)
  })

  it('deactivate stops the host and clears active state (no restart)', async () => {
    manager.installLocal(makeSource())
    await runtime.activate('acme.foo')
    await runtime.deactivate('acme.foo')
    expect(runtime.isRunning('acme.foo')).toBe(false)
    expect(manager.get('acme.foo')?.active).toBe(false)
    expect(scheduled).toHaveLength(0)
  })

  it('does not restart after a crash if the plugin was deactivated', async () => {
    manager.installLocal(makeSource())
    await runtime.activate('acme.foo')
    hosts[0].crash()
    manager.deactivate('acme.foo') // user deactivates before backoff fires
    scheduled[0]()
    await flush()
    expect(hosts).toHaveLength(1) // no respawn
  })

  it('stops restarting after maxRestarts crashes and marks the plugin errored', async () => {
    manager.installLocal(makeSource())
    await runtime.activate('acme.foo')
    // Default maxRestarts is 3: crash + restart three times; the fourth crash
    // must error out rather than restart (supervisor-driven restarts keep the
    // crash count instead of resetting it on every activate()).
    for (let i = 0; i < 3; i++) {
      hosts.at(-1)!.crash()
      expect(scheduled).toHaveLength(i + 1)
      scheduled[i]()
      await flush()
    }
    expect(hosts).toHaveLength(4) // initial + 3 restarts
    hosts.at(-1)!.crash() // fourth crash
    expect(runtime.state('acme.foo')).toBe('errored')
    expect(scheduled).toHaveLength(3) // no fourth restart was scheduled
  })

  it('terminates the host and reports failure when start() rejects (no orphan)', async () => {
    manager.installLocal(makeSource())
    failStart = true
    const result = await runtime.activate('acme.foo')
    expect(result.ok).toBe(false)
    expect(runtime.isRunning('acme.foo')).toBe(false)
    expect(hosts).toHaveLength(1)
    expect(hosts[0].terminated).toBe(true) // failed-start child was killed, not orphaned
  })
})
