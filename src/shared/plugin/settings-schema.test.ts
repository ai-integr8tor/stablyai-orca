import { describe, expect, it } from 'vitest'
import { validateAgainstSchema } from './settings-schema'

const SCHEMA = {
  type: 'object',
  properties: {
    apiBase: { type: 'string' },
    refreshSeconds: { type: 'integer' },
    mode: { type: 'string', enum: ['compact', 'full'] },
    tags: { type: 'array', items: { type: 'string' } }
  },
  required: ['apiBase'],
  additionalProperties: false
} as Record<string, unknown>

describe('validateAgainstSchema', () => {
  it('accepts a conforming object', () => {
    expect(
      validateAgainstSchema(
        { apiBase: 'https://x', refreshSeconds: 30, mode: 'compact', tags: ['a'] },
        SCHEMA
      )
    ).toEqual({ ok: true })
  })

  it('rejects a missing required property', () => {
    const result = validateAgainstSchema({ refreshSeconds: 10 }, SCHEMA)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join()).toContain('apiBase')
    }
  })

  it('rejects a wrong-typed property', () => {
    const result = validateAgainstSchema({ apiBase: 'x', refreshSeconds: 'soon' }, SCHEMA)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join()).toContain('refreshSeconds')
    }
  })

  it('rejects an out-of-enum value', () => {
    const result = validateAgainstSchema({ apiBase: 'x', mode: 'weird' }, SCHEMA)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join()).toContain('mode')
    }
  })

  it('rejects additional properties when additionalProperties is false', () => {
    const result = validateAgainstSchema({ apiBase: 'x', extra: 1 }, SCHEMA)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join()).toContain('extra')
    }
  })

  it('validates array item types', () => {
    const result = validateAgainstSchema({ apiBase: 'x', tags: ['ok', 5] }, SCHEMA)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join()).toContain('tags[1]')
    }
  })

  it('treats integers as valid numbers', () => {
    expect(validateAgainstSchema(3, { type: 'number' }).ok).toBe(true)
  })

  it('rejects all extra keys when additionalProperties is false and no properties are declared', () => {
    const result = validateAgainstSchema(
      { anything: 1 },
      { type: 'object', additionalProperties: false }
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join()).toContain('anything')
    }
  })
})
