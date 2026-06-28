import { describe, expect, it } from 'vitest'
import { Plug } from 'lucide-react'
import { resolveIcon } from './use-plugin-activity-items'

describe('resolveIcon', () => {
  it('resolves a real Lucide icon name to its component', () => {
    // Activity is a forwardRef icon component, not the Plug fallback.
    expect(resolveIcon('Activity')).not.toBe(Plug)
    expect(typeof resolveIcon('Activity')).toBe('object')
  })

  it('falls back to Plug for an unknown name', () => {
    expect(resolveIcon('NotARealIconName')).toBe(Plug)
  })

  it('falls back to Plug for a non-component namespace export (function helper)', () => {
    // createLucideIcon is a plain function on the namespace; rendering it would
    // crash, so it must not be returned as an icon.
    expect(resolveIcon('createLucideIcon')).toBe(Plug)
  })

  it('falls back to Plug for the icons namespace object', () => {
    expect(resolveIcon('icons')).toBe(Plug)
  })
})
