import { describe, expect, it } from 'vitest'
import { parsePluginListResult } from './mobile-plugin-list'

describe('parsePluginListResult', () => {
  it('maps a successful response into rows preserving id and title', () => {
    const rows = parsePluginListResult({
      ok: true,
      result: {
        plugins: [
          { id: 'acme.foo', title: 'Foo', icon: 'Activity', version: '1.0.0', ui: 'index.html' },
          { id: 'acme.bar', title: 'Bar', icon: 'Bell', version: '2.0.0', ui: 'index.html' }
        ]
      }
    })
    expect(rows).toEqual([
      { id: 'acme.foo', title: 'Foo', icon: 'Activity' },
      { id: 'acme.bar', title: 'Bar', icon: 'Bell' }
    ])
  })

  it('falls back to id for title and Plug for icon when missing', () => {
    const rows = parsePluginListResult({ ok: true, result: { plugins: [{ id: 'acme.baz' }] } })
    expect(rows).toEqual([{ id: 'acme.baz', title: 'acme.baz', icon: 'Plug' }])
  })

  it('returns an empty list for an empty plugins array', () => {
    expect(parsePluginListResult({ ok: true, result: { plugins: [] } })).toEqual([])
  })

  it('returns an empty list for a failed response', () => {
    expect(parsePluginListResult({ ok: false })).toEqual([])
    expect(parsePluginListResult(null)).toEqual([])
    expect(parsePluginListResult(undefined)).toEqual([])
  })

  it('skips malformed entries without a string id', () => {
    const rows = parsePluginListResult({
      ok: true,
      result: {
        plugins: [{ id: 'acme.ok', title: 'OK' }, { title: 'no id' }, null, 42, { id: '' }]
      }
    })
    expect(rows).toEqual([{ id: 'acme.ok', title: 'OK', icon: 'Plug' }])
  })
})
