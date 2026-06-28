import { describe, expect, it } from 'vitest'
import { buildInjectedUiMessage, extractPluginUiMessage } from './mobile-plugin-bridge'

describe('buildInjectedUiMessage', () => {
  it('dispatches a message event carrying the JSON-stringified payload', () => {
    const snippet = buildInjectedUiMessage({ reqId: 'r1', ok: true, result: 42 })
    expect(snippet).toContain("new MessageEvent('message'")
    // The event data is the JSON string of the payload, embedded as a JS literal.
    expect(snippet).toContain(JSON.stringify(JSON.stringify({ reqId: 'r1', ok: true, result: 42 })))
    expect(snippet.trimEnd().endsWith('true;')).toBe(true)
  })

  it('safely escapes payloads containing quotes and newlines', () => {
    const snippet = buildInjectedUiMessage({ text: 'he said "hi"\nbye' })
    // Must not break out of the JS string literal.
    expect(snippet).toContain(JSON.stringify(JSON.stringify({ text: 'he said "hi"\nbye' })))
  })
})

describe('extractPluginUiMessage', () => {
  it('returns the message when the pluginId matches', () => {
    const result = extractPluginUiMessage(
      { pluginId: 'acme.foo', message: { reqId: 'r1' } },
      'acme.foo'
    )
    expect(result).toEqual({ matched: true, message: { reqId: 'r1' } })
  })

  it('ignores a notification for a different pluginId', () => {
    expect(extractPluginUiMessage({ pluginId: 'other.bar', message: {} }, 'acme.foo')).toEqual({
      matched: false
    })
  })

  it('ignores a malformed notification with no string pluginId', () => {
    expect(extractPluginUiMessage({ message: {} }, 'acme.foo').matched).toBe(false)
    expect(extractPluginUiMessage({ pluginId: 42 }, 'acme.foo').matched).toBe(false)
  })

  it('matches even when the message is undefined (lifecycle-only notification)', () => {
    expect(extractPluginUiMessage({ pluginId: 'acme.foo' }, 'acme.foo')).toEqual({
      matched: true,
      message: undefined
    })
  })
})
