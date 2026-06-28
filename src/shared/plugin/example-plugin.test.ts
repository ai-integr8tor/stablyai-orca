import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validatePluginManifest } from './manifest-validate'

// Keeps the shipped example plugin honest against the live contract: if the
// manifest schema tightens, this test fails until the example is updated.
const EXAMPLE_DIR = join(__dirname, '..', '..', '..', 'examples', 'hello-sidebar-plugin')

describe('example plugin (hello-sidebar)', () => {
  it('has a manifest that validates against the contract', () => {
    const raw = JSON.parse(readFileSync(join(EXAMPLE_DIR, 'plugin.json'), 'utf8'))
    const result = validatePluginManifest(raw)
    expect(result.ok).toBe(true)
  })

  it('declares single-file .html UI entries', () => {
    const raw = JSON.parse(readFileSync(join(EXAMPLE_DIR, 'plugin.json'), 'utf8')) as {
      contributes: { sidebar: { ui: string }; settings?: { ui: string } }
    }
    expect(raw.contributes.sidebar.ui.endsWith('.html')).toBe(true)
    expect(raw.contributes.settings?.ui.endsWith('.html')).toBe(true)
  })
})
