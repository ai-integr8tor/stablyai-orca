import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provisionPlugin } from './plugin-provision'
import { serializePluginBundle, type PluginBundleFile } from '../main/plugin/plugin-bundle'
import { discoverPlugins } from '../main/plugin/plugin-discovery'

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64')

function manifest(id = 'acme.foo'): string {
  return JSON.stringify({
    id,
    name: 'Foo',
    version: '1.0.0',
    hostApiVersion: '0.1.0',
    main: 'main.js',
    contributes: { sidebar: { title: 'Foo', icon: 'Activity', ui: 'index.html' } },
    capabilities: ['workspace:read']
  })
}

function bundleFiles(manifestId = 'acme.foo', html = '<!doctype html>'): PluginBundleFile[] {
  return [
    { path: 'plugin.json', dataBase64: b64(manifest(manifestId)) },
    { path: 'main.js', dataBase64: b64('exports.activate=()=>{}') },
    { path: 'index.html', dataBase64: b64(html) }
  ]
}

let tmp: string
let pluginsDir: string
let config: { pluginsDir: string; stagingDir: string }

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'relay-provision-'))
  pluginsDir = join(tmp, 'plugins')
  config = { pluginsDir, stagingDir: `${pluginsDir}-staging` }
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('provisionPlugin', () => {
  it('writes a valid bundle so discoverPlugins finds it', () => {
    const bundle = serializePluginBundle('acme.foo', bundleFiles())
    expect(provisionPlugin(bundle, config)).toEqual({ ok: true })
    const found = discoverPlugins(pluginsDir).valid.map((p) => p.manifest.id)
    expect(found).toEqual(['acme.foo'])
    expect(readFileSync(join(pluginsDir, 'acme.foo', 'index.html'), 'utf8')).toBe('<!doctype html>')
    // The staged temp dir is renamed into place, leaving no leftover under staging.
    expect(readdirSync(config.stagingDir)).toEqual([])
  })

  it('writes nothing on an integrity mismatch', () => {
    const bundle = serializePluginBundle('acme.foo', bundleFiles())
    bundle.files[2].dataBase64 = b64('<tampered>')
    expect(provisionPlugin(bundle, config)).toEqual({ ok: false, error: 'integrity_mismatch' })
    expect(existsSync(join(pluginsDir, 'acme.foo'))).toBe(false)
  })

  it('rejects a manifest whose id does not match the bundle id', () => {
    // bundle pluginId is acme.foo but the embedded manifest says acme.bar
    const bundle = serializePluginBundle('acme.foo', bundleFiles('acme.bar'))
    expect(provisionPlugin(bundle, config)).toEqual({ ok: false, error: 'manifest_id_mismatch' })
    expect(existsSync(join(pluginsDir, 'acme.foo'))).toBe(false)
  })

  it('rejects an unsafe plugin id before touching the filesystem', () => {
    const bundle = serializePluginBundle('../evil', bundleFiles('../evil'))
    expect(provisionPlugin(bundle, config)).toEqual({ ok: false, error: 'unsafe_plugin_id' })
    expect(existsSync(config.stagingDir)).toBe(false)
  })

  it('reports a missing manifest and writes nothing', () => {
    const bundle = serializePluginBundle('acme.foo', [
      { path: 'index.html', dataBase64: b64('<!doctype html>') }
    ])
    expect(provisionPlugin(bundle, config)).toEqual({ ok: false, error: 'missing_manifest' })
    expect(existsSync(join(pluginsDir, 'acme.foo'))).toBe(false)
  })

  it('rejects an invalid manifest', () => {
    const bundle = serializePluginBundle('acme.foo', [
      { path: 'plugin.json', dataBase64: b64('{"id":"acme.foo"}') }
    ])
    expect(provisionPlugin(bundle, config)).toEqual({ ok: false, error: 'invalid_manifest' })
  })

  it('atomically replaces an existing plugin on re-provision', () => {
    provisionPlugin(serializePluginBundle('acme.foo', bundleFiles('acme.foo', 'v1')), config)
    provisionPlugin(serializePluginBundle('acme.foo', bundleFiles('acme.foo', 'v2')), config)
    expect(readFileSync(join(pluginsDir, 'acme.foo', 'index.html'), 'utf8')).toBe('v2')
  })
})
