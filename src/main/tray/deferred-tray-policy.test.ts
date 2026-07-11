import { describe, expect, it } from 'vitest'
import { shouldCreateDeferredTray } from './deferred-tray-policy'

describe('shouldCreateDeferredTray', () => {
  it('always creates the tray on win32', () => {
    expect(
      shouldCreateDeferredTray({
        platform: 'win32',
        keepServingOnClose: false,
        showTrayIconWhileClosed: false
      })
    ).toBe(true)
  })

  it('creates the tray on linux (createSystemTray no-ops there)', () => {
    expect(
      shouldCreateDeferredTray({
        platform: 'linux',
        keepServingOnClose: true,
        showTrayIconWhileClosed: true
      })
    ).toBe(true)
  })

  it('creates the macOS menu-bar icon only when both settings are on', () => {
    expect(
      shouldCreateDeferredTray({
        platform: 'darwin',
        keepServingOnClose: true,
        showTrayIconWhileClosed: true
      })
    ).toBe(true)
  })

  it('skips the macOS menu-bar icon when keepServingOnClose is off', () => {
    expect(
      shouldCreateDeferredTray({
        platform: 'darwin',
        keepServingOnClose: false,
        showTrayIconWhileClosed: true
      })
    ).toBe(false)
  })

  it('skips the macOS menu-bar icon when showTrayIconWhileClosed is off', () => {
    expect(
      shouldCreateDeferredTray({
        platform: 'darwin',
        keepServingOnClose: true,
        showTrayIconWhileClosed: false
      })
    ).toBe(false)
  })
})
