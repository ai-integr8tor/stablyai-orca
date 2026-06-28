import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginStore, type PluginInstallSource } from './plugin-store'

const SOURCE: PluginInstallSource = { kind: 'local', path: '/tmp/src' }

let tmp: string
let stateFile: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'plugin-store-'))
  stateFile = join(tmp, 'nested', 'plugins-state.json')
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('PluginStore', () => {
  it('records an installed plugin as inactive and persists it', () => {
    const store = new PluginStore(stateFile)
    store.recordInstalled({ id: 'acme.foo', version: '1.0.0', source: SOURCE })

    expect(existsSync(stateFile)).toBe(true)
    const reloaded = new PluginStore(stateFile)
    const entry = reloaded.get('acme.foo')
    expect(entry?.active).toBe(false)
    expect(entry?.version).toBe('1.0.0')
  })

  it('setActive is idempotent and reports only real changes', () => {
    const store = new PluginStore(stateFile)
    store.recordInstalled({ id: 'acme.foo', version: '1.0.0', source: SOURCE })

    expect(store.setActive('acme.foo', true)).toBe(true)
    expect(store.setActive('acme.foo', true)).toBe(false) // no-op
    expect(store.get('acme.foo')?.active).toBe(true)
    expect(store.setActive('missing', true)).toBe(false)
  })

  it('preserves the active flag across a reinstall', () => {
    const store = new PluginStore(stateFile)
    store.recordInstalled({ id: 'acme.foo', version: '1.0.0', source: SOURCE })
    store.setActive('acme.foo', true)
    store.recordInstalled({ id: 'acme.foo', version: '1.1.0', source: SOURCE })

    const entry = store.get('acme.foo')
    expect(entry?.active).toBe(true)
    expect(entry?.version).toBe('1.1.0')
  })

  it('removes an entry', () => {
    const store = new PluginStore(stateFile)
    store.recordInstalled({ id: 'acme.foo', version: '1.0.0', source: SOURCE })
    expect(store.remove('acme.foo')).toBe(true)
    expect(store.remove('acme.foo')).toBe(false)
    expect(new PluginStore(stateFile).list()).toEqual([])
  })

  it('resets to empty state when the state file is corrupt', () => {
    mkdirSync(join(tmp, 'nested'), { recursive: true })
    writeFileSync(stateFile, 'not json{{{')
    const store = new PluginStore(stateFile)
    expect(store.list()).toEqual([])
  })

  it('writes valid JSON to disk', () => {
    const store = new PluginStore(stateFile)
    store.recordInstalled({ id: 'acme.foo', version: '1.0.0', source: SOURCE })
    expect(() => JSON.parse(readFileSync(stateFile, 'utf8'))).not.toThrow()
  })
})
