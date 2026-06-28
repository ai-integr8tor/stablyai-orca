import { describe, expect, it } from 'vitest'
import { validatePluginManifest } from './manifest-validate'
import type { PluginManifest } from './manifest'

function validRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'acme.workspace-status',
    name: 'Workspace Status',
    version: '1.0.0',
    hostApiVersion: '0.1.0',
    main: 'dist/main.js',
    contributes: {
      sidebar: { title: 'Status', icon: 'Activity', ui: 'ui/index.html' }
    },
    capabilities: ['workspace:read', 'commands'],
    ...overrides
  }
}

describe('validatePluginManifest', () => {
  it('accepts a valid manifest (no settings)', () => {
    const result = validatePluginManifest(validRaw())
    expect(result.ok).toBe(true)
    if (result.ok) {
      const manifest: PluginManifest = result.manifest
      expect(manifest.id).toBe('acme.workspace-status')
      expect(manifest.capabilities).toEqual(['workspace:read', 'commands'])
    }
  })

  it('accepts a valid manifest with a settings contribution', () => {
    const result = validatePluginManifest(
      validRaw({
        contributes: {
          sidebar: { title: 'Status', icon: 'Activity', ui: 'ui/index.html' },
          settings: { ui: 'ui/settings.html' }
        }
      })
    )
    expect(result.ok).toBe(true)
  })

  it('reports each missing required field by name', () => {
    const result = validatePluginManifest({ contributes: {}, capabilities: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const joined = result.errors.join('\n')
      expect(joined).toContain('id:')
      expect(joined).toContain('name:')
      expect(joined).toContain('version:')
      expect(joined).toContain('main:')
      expect(joined).toContain('hostApiVersion:')
    }
  })

  it('rejects a multi-file / non-.html ui entry', () => {
    const result = validatePluginManifest(
      validRaw({ contributes: { sidebar: { title: 'S', icon: 'Activity', ui: 'ui/' } } })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join('\n')).toContain('single .html file')
    }
  })

  it('rejects a traversing or absolute ui path', () => {
    const traverse = validatePluginManifest(
      validRaw({ contributes: { sidebar: { title: 'S', icon: 'Activity', ui: '../evil.html' } } })
    )
    const absolute = validatePluginManifest(
      validRaw({ contributes: { sidebar: { title: 'S', icon: 'Activity', ui: '/etc/x.html' } } })
    )
    expect(traverse.ok).toBe(false)
    expect(absolute.ok).toBe(false)
    if (!traverse.ok) {
      expect(traverse.errors.join('\n')).toContain('..')
    }
    if (!absolute.ok) {
      expect(absolute.errors.join('\n')).toContain('absolute')
    }
  })

  it('rejects an unknown capability and names the offending value', () => {
    const result = validatePluginManifest(
      validRaw({ capabilities: ['workspace:read', 'process:exec'] })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join('\n')).toContain('process:exec')
    }
  })

  it('rejects an icon that is not a valid Lucide name (format check)', () => {
    const result = validatePluginManifest(
      validRaw({ contributes: { sidebar: { title: 'S', icon: 'my-icon', ui: 'ui/index.html' } } })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join('\n')).toContain('icon')
    }
  })

  it('rejects a newer-major hostApiVersion with an actionable message', () => {
    const result = validatePluginManifest(validRaw({ hostApiVersion: '1.0.0' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join('\n')).toContain('newer version of Orca')
    }
  })

  it('accepts any 0.x hostApiVersion (pre-stable)', () => {
    expect(validatePluginManifest(validRaw({ hostApiVersion: '0.4.2' })).ok).toBe(true)
  })

  it('rejects a non-object manifest', () => {
    expect(validatePluginManifest(null).ok).toBe(false)
    expect(validatePluginManifest('nope').ok).toBe(false)
  })

  it('rejects an unsafe id (path traversal) at the trust boundary', () => {
    for (const id of ['../../../tmp/evil', '/etc/x', 'a/b']) {
      const result = validatePluginManifest(validRaw({ id }))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors.join('\n')).toContain('id:')
      }
    }
  })

  it('rejects prototype-pollution ids (__proto__, constructor, prototype)', () => {
    for (const id of ['__proto__', 'constructor', 'prototype']) {
      expect(validatePluginManifest(validRaw({ id })).ok).toBe(false)
    }
  })

  it('rejects a non-object contributes.settings', () => {
    const result = validatePluginManifest(
      validRaw({
        contributes: { sidebar: { title: 'S', icon: 'Activity', ui: 'i.html' }, settings: true }
      })
    )
    expect(result.ok).toBe(false)
  })
})
