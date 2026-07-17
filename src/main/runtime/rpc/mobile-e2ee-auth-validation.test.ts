import { describe, expect, it } from 'vitest'
import type { DesktopMobileE2EEV2Session } from './mobile-e2ee-v2-desktop-session'
import { isValidMobileE2EEAuthVersion } from './mobile-e2ee-auth-validation'

describe('isValidMobileE2EEAuthVersion', () => {
  it('accepts the optional device name without weakening the v2 transcript check', () => {
    const session = {
      transcriptHashB64: 'bound-transcript'
    } as DesktopMobileE2EEV2Session

    expect(
      isValidMobileE2EEAuthVersion(
        {
          type: 'e2ee_auth',
          v: 2,
          transcriptHashB64: 'bound-transcript',
          deviceToken: 'valid-token',
          deviceName: 'iPhone 15 Pro Max'
        },
        session
      )
    ).toBe(true)
    expect(
      isValidMobileE2EEAuthVersion(
        {
          type: 'e2ee_auth',
          v: 2,
          transcriptHashB64: 'different-transcript',
          deviceToken: 'valid-token',
          deviceName: 'iPhone 15 Pro Max'
        },
        session
      )
    ).toBe(false)
  })
})
