import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_CONSENT_COPY,
  CAPABILITY_NOT_A_LIMIT_DISCLAIMER,
  capabilityConsentLines
} from './capability-consent'
import { PLUGIN_CAPABILITIES } from './manifest'

describe('capability consent copy', () => {
  it('has copy for every capability', () => {
    for (const cap of PLUGIN_CAPABILITIES) {
      expect(CAPABILITY_CONSENT_COPY[cap].trim().length).toBeGreaterThan(10)
    }
  })

  it('renders lines in canonical order regardless of declared order', () => {
    const lines = capabilityConsentLines(['settings', 'workspace:read'])
    expect(lines).toEqual([
      CAPABILITY_CONSENT_COPY['workspace:read'],
      CAPABILITY_CONSENT_COPY['settings']
    ])
  })

  it('returns no lines for an empty capability list', () => {
    expect(capabilityConsentLines([])).toEqual([])
  })

  it('disclaimer makes clear capabilities are not enforced limits', () => {
    expect(CAPABILITY_NOT_A_LIMIT_DISCLAIMER.toLowerCase()).toContain('not enforced limits')
    expect(CAPABILITY_NOT_A_LIMIT_DISCLAIMER.toLowerCase()).toContain('full access')
  })
})
