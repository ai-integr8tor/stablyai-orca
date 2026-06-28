import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginManager, type PluginManagerConfig } from './plugin-manager'

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

let tmp: string
let config: PluginManagerConfig

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'plugin-manager-'))
  config = { pluginsDir: join(tmp, 'installed'), stateFilePath: join(tmp, 'state.json') }
  mkdirSync(config.pluginsDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function makeSource(manifest: Record<string, unknown> = validManifest()): string {
  const src = join(tmp, `source-${Math.random().toString(36).slice(2)}`)
  mkdirSync(src, { recursive: true })
  writeFileSync(join(src, 'plugin.json'), JSON.stringify(manifest))
  writeFileSync(join(src, 'index.html'), '<!doctype html>')
  return src
}

describe('PluginManager', () => {
  it('installs (inactive), activates, and persists across a new instance', () => {
    const manager = new PluginManager(config)
    const install = manager.installLocal(makeSource())
    expect(install.ok).toBe(true)
    expect(manager.get('acme.foo')?.active).toBe(false)

    expect(manager.activate('acme.foo')).toBe(true)
    expect(manager.get('acme.foo')?.active).toBe(true)

    // A fresh manager (simulated restart) reads persisted state.
    const reopened = new PluginManager(config)
    expect(reopened.get('acme.foo')?.active).toBe(true)
    expect(reopened.list()).toHaveLength(1)
  })

  it('double-activate is a no-op', () => {
    const manager = new PluginManager(config)
    manager.installLocal(makeSource())
    expect(manager.activate('acme.foo')).toBe(true)
    expect(manager.activate('acme.foo')).toBe(false)
  })

  it('activate returns false for an unknown plugin', () => {
    expect(new PluginManager(config).activate('nope')).toBe(false)
  })

  it('remove deactivates first, then deletes the directory and state entry', () => {
    const manager = new PluginManager(config)
    manager.installLocal(makeSource())
    manager.activate('acme.foo')
    expect(existsSync(join(config.pluginsDir, 'acme.foo'))).toBe(true)

    expect(manager.remove('acme.foo')).toBe(true)
    expect(manager.get('acme.foo')).toBeUndefined()
    expect(existsSync(join(config.pluginsDir, 'acme.foo'))).toBe(false)
    expect(manager.remove('acme.foo')).toBe(false)
  })

  it('does not record or write anything for an invalid install', () => {
    const manager = new PluginManager(config)
    const result = manager.installLocal(
      makeSource(validManifest({ capabilities: ['process:exec'] }))
    )
    expect(result.ok).toBe(false)
    expect(manager.list()).toEqual([])
    expect(readdirSync(config.pluginsDir)).toEqual([])
  })

  it('discover scans the plugins directory for installed bundles', () => {
    const manager = new PluginManager(config)
    manager.installLocal(makeSource())
    const discovered = manager.discover()
    expect(discovered.valid.map((p) => p.manifest.id)).toEqual(['acme.foo'])
  })

  it('deactivate flips an active plugin inactive, is idempotent, and false for unknown', () => {
    const manager = new PluginManager(config)
    manager.installLocal(makeSource())
    manager.activate('acme.foo')
    expect(manager.deactivate('acme.foo')).toBe(true)
    expect(manager.get('acme.foo')?.active).toBe(false)
    expect(manager.deactivate('acme.foo')).toBe(false) // already inactive
    expect(manager.deactivate('nope')).toBe(false)
    // persisted across a simulated restart
    expect(new PluginManager(config).get('acme.foo')?.active).toBe(false)
  })
})
