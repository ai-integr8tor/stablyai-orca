import { describe, expect, it } from 'vitest'
import {
  isPluginCapability,
  isSafePluginId,
  PLUGIN_CAPABILITIES,
  SUPPORTED_HOST_API_MAJOR
} from './manifest'

describe('plugin capability union', () => {
  it('recognizes every declared capability', () => {
    for (const cap of PLUGIN_CAPABILITIES) {
      expect(isPluginCapability(cap)).toBe(true)
    }
  })

  it('rejects unknown / non-string values', () => {
    expect(isPluginCapability('process:exec')).toBe(false)
    expect(isPluginCapability('')).toBe(false)
    expect(isPluginCapability(undefined)).toBe(false)
    expect(isPluginCapability(42)).toBe(false)
  })

  it('is pre-stable (host API major 0)', () => {
    expect(SUPPORTED_HOST_API_MAJOR).toBe(0)
  })
})

describe('isSafePluginId', () => {
  it('accepts normal dotted/dashed ids', () => {
    for (const id of ['acme.foo', 'a', 'org.team.plugin-name', 'x_y', 'A1.b2']) {
      expect(isSafePluginId(id)).toBe(true)
    }
  })

  it('rejects path traversal and separators', () => {
    for (const id of ['../evil', '../../tmp/x', 'a/b', 'a\\b', 'a..b', '..', '.']) {
      expect(isSafePluginId(id)).toBe(false)
    }
  })

  it('rejects absolute-path-like ids', () => {
    expect(isSafePluginId('/etc/passwd')).toBe(false)
    expect(isSafePluginId('C:\\x')).toBe(false)
  })

  it('rejects prototype-pollution keys', () => {
    for (const id of ['__proto__', 'prototype', 'constructor']) {
      expect(isSafePluginId(id)).toBe(false)
    }
  })

  it('rejects empty and leading-symbol ids', () => {
    expect(isSafePluginId('')).toBe(false)
    expect(isSafePluginId('-leading')).toBe(false)
    expect(isSafePluginId('.leading')).toBe(false)
  })
})
