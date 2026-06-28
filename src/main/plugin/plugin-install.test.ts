import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installFromLocalFolder } from './plugin-install'

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
let pluginsDir: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'plugin-install-'))
  pluginsDir = join(tmp, 'installed')
  mkdirSync(pluginsDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function makeSource(manifest: Record<string, unknown>): string {
  const src = join(tmp, 'source')
  mkdirSync(src, { recursive: true })
  writeFileSync(join(src, 'plugin.json'), JSON.stringify(manifest))
  writeFileSync(join(src, 'index.html'), '<!doctype html><body>hi</body>')
  return src
}

describe('installFromLocalFolder', () => {
  it('copies a valid plugin into pluginsDir/<id> and reports id+version', () => {
    const src = makeSource(validManifest())
    const result = installFromLocalFolder(src, pluginsDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.id).toBe('acme.foo')
      expect(existsSync(join(pluginsDir, 'acme.foo', 'plugin.json'))).toBe(true)
      expect(existsSync(join(pluginsDir, 'acme.foo', 'index.html'))).toBe(true)
    }
  })

  it('writes nothing when the source manifest is invalid', () => {
    const src = makeSource(validManifest({ capabilities: ['process:exec'] }))
    const result = installFromLocalFolder(src, pluginsDir)
    expect(result.ok).toBe(false)
    expect(readdirSync(pluginsDir)).toEqual([])
  })

  it('replaces an existing install on reinstall', () => {
    const src1 = makeSource(validManifest({ version: '1.0.0' }))
    installFromLocalFolder(src1, pluginsDir)
    const src2 = makeSource(validManifest({ version: '2.0.0' }))
    const result = installFromLocalFolder(src2, pluginsDir)
    expect(result.ok && result.version).toBe('2.0.0')
  })

  it('fails cleanly for a non-existent source', () => {
    const result = installFromLocalFolder(join(tmp, 'ghost'), pluginsDir)
    expect(result.ok).toBe(false)
  })
})
