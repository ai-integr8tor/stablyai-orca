import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { isSafePluginId, PluginSettingsStore, pluginSettingsPath } from './plugin-settings-store'

const SCHEMA = {
  type: 'object',
  properties: { count: { type: 'integer' } },
  additionalProperties: false
} as Record<string, unknown>

let pluginsDir: string

beforeEach(() => {
  pluginsDir = mkdtempSync(join(tmpdir(), 'plugin-settings-'))
})

afterEach(() => {
  rmSync(pluginsDir, { recursive: true, force: true })
})

describe('isSafePluginId / pluginSettingsPath', () => {
  it('accepts dotted ids and rejects traversal/separators', () => {
    expect(isSafePluginId('acme.foo')).toBe(true)
    expect(isSafePluginId('../evil')).toBe(false)
    expect(isSafePluginId('a/b')).toBe(false)
    expect(isSafePluginId('..')).toBe(false)
  })

  it('throws for an unsafe id rather than escaping the directory', () => {
    expect(() => pluginSettingsPath(pluginsDir, '../other')).toThrow()
  })

  it('isolates each plugin in its own file', () => {
    const a = pluginSettingsPath(pluginsDir, 'acme.a')
    const b = pluginSettingsPath(pluginsDir, 'acme.b')
    expect(a).not.toBe(b)
    expect(a).toContain(join('acme.a', 'settings.json'))
  })
})

describe('PluginSettingsStore', () => {
  it('round-trips and persists settings per plugin', () => {
    const store = new PluginSettingsStore(pluginsDir, 'acme.foo')
    expect(store.set('theme', 'dark')).toEqual({ ok: true })
    expect(store.get('theme')).toBe('dark')

    const reopened = new PluginSettingsStore(pluginsDir, 'acme.foo')
    expect(reopened.get('theme')).toBe('dark')
    expect(reopened.getAll()).toEqual({ theme: 'dark' })
  })

  it('does not leak settings between plugins', () => {
    new PluginSettingsStore(pluginsDir, 'acme.a').set('secret', 'A')
    const b = new PluginSettingsStore(pluginsDir, 'acme.b')
    expect(b.get('secret')).toBeUndefined()
  })

  it('rejects a schema-invalid write and leaves the file untouched', () => {
    const store = new PluginSettingsStore(pluginsDir, 'acme.foo', SCHEMA)
    expect(store.set('count', 1)).toEqual({ ok: true })

    const bad = store.set('count', 'lots')
    expect(bad.ok).toBe(false)
    expect(store.get('count')).toBe(1) // unchanged

    const extra = store.set('nope', true)
    expect(extra.ok).toBe(false)
  })

  it('deletes a key', () => {
    const store = new PluginSettingsStore(pluginsDir, 'acme.foo')
    store.set('a', 1)
    store.delete('a')
    expect(store.get('a')).toBeUndefined()
    expect(existsSync(pluginSettingsPath(pluginsDir, 'acme.foo'))).toBe(true)
  })

  it('recovers to empty when the settings file is corrupt', () => {
    const path = pluginSettingsPath(pluginsDir, 'acme.foo')
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, 'not json{{{')
    const store = new PluginSettingsStore(pluginsDir, 'acme.foo')
    expect(store.getAll()).toEqual({})
  })
})
