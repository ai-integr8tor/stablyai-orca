import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverPlugins, readManifestRaw } from './plugin-discovery'

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

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'plugin-discovery-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function writePluginDir(
  name: string,
  manifest: Record<string, unknown> | null,
  usePackageJson = false
): string {
  const dir = join(tmp, name)
  mkdirSync(dir, { recursive: true })
  if (manifest !== null) {
    if (usePackageJson) {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name, version: '1.0.0', orca: manifest })
      )
    } else {
      writeFileSync(join(dir, 'plugin.json'), JSON.stringify(manifest))
    }
  }
  return dir
}

describe('readManifestRaw', () => {
  it('reads plugin.json when present', () => {
    const dir = writePluginDir('p1', validManifest())
    expect(readManifestRaw(dir)).toMatchObject({ id: 'acme.foo' })
  })

  it('falls back to package.json#orca', () => {
    const dir = writePluginDir('p2', validManifest({ id: 'acme.bar' }), true)
    expect(readManifestRaw(dir)).toMatchObject({ id: 'acme.bar' })
  })

  it('returns null when no manifest exists', () => {
    const dir = writePluginDir('p3', null)
    expect(readManifestRaw(dir)).toBeNull()
  })
})

describe('discoverPlugins', () => {
  it('returns empty when the plugins dir does not exist', () => {
    expect(discoverPlugins(join(tmp, 'nope'))).toEqual({ valid: [], invalid: [] })
  })

  it('separates valid and invalid plugins', () => {
    writePluginDir('good', validManifest({ id: 'acme.good' }))
    writePluginDir('viapkg', validManifest({ id: 'acme.viapkg' }), true)
    writePluginDir('bad', validManifest({ capabilities: ['process:exec'] }))
    writePluginDir('nomanifest', null)

    const result = discoverPlugins(tmp)
    const validIds = result.valid.map((p) => p.manifest.id).sort()
    expect(validIds).toEqual(['acme.good', 'acme.viapkg'])
    expect(result.invalid).toHaveLength(2)
    expect(result.invalid.some((i) => i.errors.join().includes('process:exec'))).toBe(true)
    expect(result.invalid.some((i) => i.errors.join().includes('no plugin.json'))).toBe(true)
  })

  it('treats a malformed plugin.json as an invalid plugin, not a crash', () => {
    const dir = join(tmp, 'broken')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'plugin.json'), '{ not valid json')
    const result = discoverPlugins(tmp)
    expect(result.valid).toEqual([])
    expect(result.invalid).toHaveLength(1)
  })

  it('rejects an unsafe id (path traversal) during discovery', () => {
    writePluginDir('traverse', validManifest({ id: '../../escape' }))
    const result = discoverPlugins(tmp)
    expect(result.valid).toEqual([])
    expect(result.invalid.some((i) => i.errors.join().includes('id:'))).toBe(true)
  })
})
