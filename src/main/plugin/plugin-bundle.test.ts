import { describe, expect, it } from 'vitest'
import {
  PLUGIN_BUNDLE_MAX_BYTES,
  PLUGIN_BUNDLE_MAX_FILES,
  isSafeBundlePath,
  serializePluginBundle,
  verifyPluginBundle,
  type PluginBundleFile
} from './plugin-bundle'

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64')

function sampleFiles(): PluginBundleFile[] {
  return [
    { path: 'plugin.json', dataBase64: b64('{"id":"acme.foo"}') },
    { path: 'ui/index.html', dataBase64: b64('<!doctype html>') }
  ]
}

describe('isSafeBundlePath', () => {
  it('accepts relative posix paths', () => {
    expect(isSafeBundlePath('plugin.json')).toBe(true)
    expect(isSafeBundlePath('ui/index.html')).toBe(true)
  })

  it('rejects absolute, traversal, drive, and backslash paths', () => {
    for (const p of ['/etc/passwd', '../x', 'a/../../b', 'C:/x', 'a\\b', '', './x', 'a/./b']) {
      expect(isSafeBundlePath(p)).toBe(false)
    }
  })

  it('rejects paths containing control characters (NUL/tab/LF/CR/unit-sep/DEL)', () => {
    // Build inputs via fromCharCode so no control-char literals live in source.
    for (const code of [0x00, 0x09, 0x0a, 0x0d, 0x1f, 0x7f]) {
      expect(isSafeBundlePath(`a${String.fromCharCode(code)}b`)).toBe(false)
    }
  })
})

describe('plugin bundle round-trip', () => {
  it('serialize then verify returns the same files', () => {
    const bundle = serializePluginBundle('acme.foo', sampleFiles())
    const result = verifyPluginBundle(bundle)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.files).toEqual(sampleFiles())
    }
  })

  it('detects tampered file bytes via the integrity digest', () => {
    const bundle = serializePluginBundle('acme.foo', sampleFiles())
    bundle.files[0].dataBase64 = b64('{"id":"evil"}')
    expect(verifyPluginBundle(bundle)).toEqual({ ok: false, error: 'integrity_mismatch' })
  })

  it('integrity is order-independent (files reordered still verify)', () => {
    const bundle = serializePluginBundle('acme.foo', sampleFiles())
    bundle.files.reverse()
    expect(verifyPluginBundle(bundle).ok).toBe(true)
  })
})

describe('verifyPluginBundle guards', () => {
  it('rejects a non-object or shape-invalid bundle', () => {
    expect(verifyPluginBundle(null).ok).toBe(false)
    expect(verifyPluginBundle({ pluginId: 'x' }).ok).toBe(false)
    expect(verifyPluginBundle({ pluginId: 'x', files: 'no', integrity: 'h' }).ok).toBe(false)
  })

  it('rejects a malformed file entry', () => {
    const bundle = serializePluginBundle('acme.foo', sampleFiles())
    ;(bundle.files as unknown[])[0] = { path: 'x' }
    expect(verifyPluginBundle(bundle)).toEqual({ ok: false, error: 'invalid_file_entry' })
  })

  it('rejects an unsafe path before checking integrity', () => {
    const bundle = serializePluginBundle('acme.foo', [{ path: '../escape', dataBase64: b64('x') }])
    expect(verifyPluginBundle(bundle)).toEqual({ ok: false, error: 'unsafe_path' })
  })

  it('rejects a bundle over the byte cap', () => {
    const big = 'a'.repeat(PLUGIN_BUNDLE_MAX_BYTES + 1)
    const bundle = serializePluginBundle('acme.foo', [
      { path: 'big.bin', dataBase64: Buffer.from(big, 'utf8').toString('base64') }
    ])
    expect(verifyPluginBundle(bundle)).toEqual({ ok: false, error: 'too_large' })
  })

  it('rejects a bundle over the file-count cap', () => {
    const files: PluginBundleFile[] = Array.from(
      { length: PLUGIN_BUNDLE_MAX_FILES + 1 },
      (_, i) => ({ path: `f${i}.txt`, dataBase64: b64('x') })
    )
    expect(verifyPluginBundle(serializePluginBundle('acme.foo', files))).toEqual({
      ok: false,
      error: 'too_many_files'
    })
  })
})
