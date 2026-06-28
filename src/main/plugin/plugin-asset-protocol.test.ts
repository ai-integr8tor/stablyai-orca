import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { parsePluginAssetUrl, resolvePluginAsset } from './plugin-asset-protocol'

const PLUGINS_DIR = '/plugins'
const active = (id: string): boolean => id === 'acme.foo'

describe('parsePluginAssetUrl', () => {
  it('parses id and asset path, preserving id case', () => {
    expect(parsePluginAssetUrl('orca-plugin://Acme.Foo/ui/index.html')).toEqual({
      pluginId: 'Acme.Foo',
      assetPath: 'ui/index.html'
    })
  })

  it('defaults to index.html when no path is given', () => {
    expect(parsePluginAssetUrl('orca-plugin://acme.foo')).toEqual({
      pluginId: 'acme.foo',
      assetPath: 'index.html'
    })
    expect(parsePluginAssetUrl('orca-plugin://acme.foo/')).toEqual({
      pluginId: 'acme.foo',
      assetPath: 'index.html'
    })
  })

  it('returns null for a non-orca-plugin url', () => {
    expect(parsePluginAssetUrl('https://example.com')).toBeNull()
  })
})

describe('resolvePluginAsset', () => {
  it('resolves a file within the plugin directory', () => {
    const result = resolvePluginAsset(PLUGINS_DIR, active, 'acme.foo', 'index.html')
    expect(result).toEqual({ ok: true, filePath: resolve(PLUGINS_DIR, 'acme.foo', 'index.html') })
  })

  it('rejects path traversal out of the plugin directory', () => {
    for (const p of ['../../etc/passwd', '..%2f..%2fsecret', '/etc/passwd']) {
      const result = resolvePluginAsset(PLUGINS_DIR, active, 'acme.foo', p)
      // '/etc/passwd' is stripped of leading slash -> resolves inside; the
      // traversal cases must be rejected.
      if (p.includes('..')) {
        expect(result.ok).toBe(false)
      }
    }
    expect(resolvePluginAsset(PLUGINS_DIR, active, 'acme.foo', '../../etc/passwd').ok).toBe(false)
  })

  it('rejects an inactive plugin', () => {
    expect(resolvePluginAsset(PLUGINS_DIR, active, 'acme.other', 'index.html')).toEqual({
      ok: false,
      reason: 'plugin not active'
    })
  })

  it('rejects an unsafe plugin id', () => {
    expect(resolvePluginAsset(PLUGINS_DIR, () => true, '../evil', 'index.html').ok).toBe(false)
  })
})
