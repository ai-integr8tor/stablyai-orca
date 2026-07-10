// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import {
  getJiraCreateUserSearchCacheKey,
  shouldSearchJiraCreateUsers
} from './jira-create-user-picker'

describe('shouldSearchJiraCreateUsers', () => {
  it('requires both a query and project key before searching Jira users', () => {
    expect(shouldSearchJiraCreateUsers('', 'ORCA')).toBe(false)
    expect(shouldSearchJiraCreateUsers('   ', 'ORCA')).toBe(false)
    expect(shouldSearchJiraCreateUsers('alex', '')).toBe(false)
    expect(shouldSearchJiraCreateUsers('alex', '   ')).toBe(false)
    expect(shouldSearchJiraCreateUsers(' alex ', ' ORCA ')).toBe(true)
  })
})

describe('getJiraCreateUserSearchCacheKey', () => {
  it('normalizes repeated searches within the same Jira project and site', () => {
    expect(getJiraCreateUserSearchCacheKey(' ORCA ', ' Alex ', 'site-1')).toBe(
      getJiraCreateUserSearchCacheKey('ORCA', 'alex', 'site-1')
    )
  })

  it('keeps separate Jira sites distinct', () => {
    expect(getJiraCreateUserSearchCacheKey('ORCA', 'alex', 'site-1')).not.toBe(
      getJiraCreateUserSearchCacheKey('ORCA', 'alex', 'site-2')
    )
  })
})
