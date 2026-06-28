import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRelayPluginRuntime, denyRelayHostCommand } from './relay-plugin-runtime'
import type { PluginHostConfig } from '../main/plugin/plugin-host-process'
import type { PluginHostLike } from '../main/plugin/plugin-runtime'

// Fake host: captures its config and never forks a real process, so the relay
// composition can be exercised in node without the built entry script.
type FakeHost = PluginHostLike & { config: PluginHostConfig }

let tmp: string
let captured: PluginHostConfig[]

function fakeHostFactory(config: PluginHostConfig): FakeHost {
  captured.push(config)
  return {
    config,
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    isRunning: () => true,
    postUi: () => {},
    terminate: () => {}
  }
}

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

function installFixture(id = 'acme.foo', overrides: Record<string, unknown> = {}): void {
  const dir = join(tmp, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plugin.json'), JSON.stringify(manifest({ id, ...overrides })))
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'relay-plugin-runtime-'))
  captured = []
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function build(onUiMessage: (pluginId: string, message: unknown) => void = () => {}) {
  return createRelayPluginRuntime({
    pluginsDir: tmp,
    stateFilePath: join(tmp, 'state.json'),
    getWorkspaceSnapshot: () => ({
      workspaceName: '',
      currentBranch: null,
      isDirty: false,
      openFileCount: 0
    }),
    onUiMessage,
    hostFactory: fakeHostFactory
  })
}

describe('relay plugin runtime', () => {
  it('denies host commands (device round-trip not available on the relay host)', async () => {
    await expect(denyRelayHostCommand('open-external-url')).rejects.toThrow(/device round-trip/)
  })

  it('forks the backend with no ELECTRON_RUN_AS_NODE (plain node on the relay)', async () => {
    installFixture()
    const { runtime } = build()
    const result = await runtime.activate('acme.foo')
    expect(result.ok).toBe(true)
    expect(captured).toHaveLength(1)
    // No forkEnv: the relay process is already node.
    expect(captured[0].env).toBeUndefined()
    expect(captured[0].pluginId).toBe('acme.foo')
  })

  it('forwards child UI messages to the injected onUiMessage with the pluginId', async () => {
    installFixture()
    const received: { pluginId: string; message: unknown }[] = []
    const { runtime } = build((pluginId, message) => received.push({ pluginId, message }))
    await runtime.activate('acme.foo')
    // Simulate the child posting an outbound message.
    captured[0].onUiMessage!({ reqId: 'r1', ok: true })
    expect(received).toEqual([{ pluginId: 'acme.foo', message: { reqId: 'r1', ok: true } }])
  })

  it('wires the gated host handler so the child can answer bridge requests', async () => {
    installFixture()
    const { runtime } = build()
    await runtime.activate('acme.foo')
    // workspace:read is declared, so the snapshot method is granted.
    const response = await captured[0].onHostRequest({
      reqId: 'r1',
      method: 'workspace.getSnapshot'
    })
    expect(response).toMatchObject({ reqId: 'r1', ok: true })
  })
})
