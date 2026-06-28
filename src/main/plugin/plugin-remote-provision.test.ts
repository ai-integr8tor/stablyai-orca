import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  provisionToRelay,
  readPluginBundleFromDisk,
  shouldProvisionToRelay
} from './plugin-remote-provision'
import { verifyPluginBundle } from './plugin-bundle'
import { provisionPlugin } from '../../relay/plugin-provision'
import { discoverPlugins } from './plugin-discovery'

const manifest = JSON.stringify({
  id: 'acme.foo',
  name: 'Foo',
  version: '1.0.0',
  hostApiVersion: '0.1.0',
  main: 'main.js',
  contributes: { sidebar: { title: 'Foo', icon: 'Activity', ui: 'index.html' } },
  capabilities: ['workspace:read']
})

let tmp: string
let pluginsDir: string

function installPlugin(): void {
  const dir = join(pluginsDir, 'acme.foo')
  mkdirSync(join(dir, 'ui'), { recursive: true })
  writeFileSync(join(dir, 'plugin.json'), manifest)
  writeFileSync(join(dir, 'main.js'), 'exports.activate=()=>{}')
  writeFileSync(join(dir, 'ui', 'index.html'), '<!doctype html><body>hi</body>')
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'remote-provision-'))
  pluginsDir = join(tmp, 'plugins')
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('readPluginBundleFromDisk', () => {
  it('packages a plugin dir into a bundle that verifies', () => {
    installPlugin()
    const bundle = readPluginBundleFromDisk(pluginsDir, 'acme.foo')
    expect(bundle.pluginId).toBe('acme.foo')
    const verified = verifyPluginBundle(bundle)
    expect(verified.ok).toBe(true)
    if (verified.ok) {
      expect(verified.files.map((f) => f.path).sort()).toEqual([
        'main.js',
        'plugin.json',
        'ui/index.html'
      ])
    }
  })

  it('skips symlinks (never packages bytes from outside the dir)', () => {
    installPlugin()
    const secret = join(tmp, 'secret.txt')
    writeFileSync(secret, 'TOP SECRET')
    symlinkSync(secret, join(pluginsDir, 'acme.foo', 'link.txt'))
    const bundle = readPluginBundleFromDisk(pluginsDir, 'acme.foo')
    expect(bundle.files.some((f) => f.path === 'link.txt')).toBe(false)
  })
})

describe('desktop-package <-> relay-unpack round-trip', () => {
  it('a packaged plugin provisions cleanly into a fresh relay plugins dir', () => {
    installPlugin()
    const bundle = readPluginBundleFromDisk(pluginsDir, 'acme.foo')
    const relayDir = join(tmp, 'relay-plugins')
    const result = provisionPlugin(bundle, {
      pluginsDir: relayDir,
      stagingDir: `${relayDir}-staging`
    })
    expect(result).toEqual({ ok: true })
    expect(discoverPlugins(relayDir).valid.map((p) => p.manifest.id)).toEqual(['acme.foo'])
    expect(readFileSync(join(relayDir, 'acme.foo', 'ui', 'index.html'), 'utf8')).toContain('hi')
  })
})

describe('provisionToRelay', () => {
  const bundle = { pluginId: 'x', files: [], integrity: 'h' }

  it('forwards the bundle under params.bundle to plugin.provision and returns the result', async () => {
    const calls: { method: string; params?: Record<string, unknown> }[] = []
    const request = (method: string, params?: Record<string, unknown>): Promise<unknown> => {
      calls.push({ method, params })
      return Promise.resolve({ ok: true })
    }
    expect(await provisionToRelay(request, bundle)).toEqual({ ok: true, error: undefined })
    expect(calls).toEqual([{ method: 'plugin.provision', params: { bundle } }])
  })

  it('synthesizes a failure when the relay returns nothing', async () => {
    const request = (): Promise<unknown> => Promise.resolve(null)
    expect(await provisionToRelay(request, bundle)).toEqual({ ok: false, error: 'no_response' })
  })

  it('maps a rejected relay request to a typed failure (not a throw)', async () => {
    const request = (): Promise<unknown> => Promise.reject(new Error('connection closed'))
    expect(await provisionToRelay(request, bundle)).toEqual({
      ok: false,
      error: 'connection closed'
    })
  })
})

describe('shouldProvisionToRelay', () => {
  it('is true for a remote workspace, false otherwise', () => {
    expect(shouldProvisionToRelay({ isRemote: true })).toBe(true)
    expect(shouldProvisionToRelay({ isRemote: false })).toBe(false)
    expect(shouldProvisionToRelay(null)).toBe(false)
    expect(shouldProvisionToRelay(undefined)).toBe(false)
  })
})
