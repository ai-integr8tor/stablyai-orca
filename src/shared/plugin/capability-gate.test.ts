import { describe, expect, it } from 'vitest'
import { gateBridgeMethod, projectWorkspaceSnapshot, validateHostCommand } from './capability-gate'
import { BRIDGE_METHODS, WORKSPACE_SNAPSHOT_KEYS } from './api-contract'

describe('gateBridgeMethod', () => {
  it('grants a declared capability', () => {
    expect(gateBridgeMethod(['workspace:read'], 'workspace.getSnapshot')).toEqual({ granted: true })
    expect(gateBridgeMethod(['settings'], 'settings.set')).toEqual({ granted: true })
  })

  it('denies an undeclared capability (deny-by-default)', () => {
    expect(gateBridgeMethod([], 'workspace.getSnapshot')).toEqual({
      granted: false,
      error: 'capability_denied'
    })
    expect(gateBridgeMethod(['workspace:read'], 'settings.get')).toEqual({
      granted: false,
      error: 'capability_denied'
    })
  })

  it('rejects an unknown method', () => {
    expect(gateBridgeMethod(['workspace:read'], 'workspace.deleteEverything')).toEqual({
      granted: false,
      error: 'unknown_method'
    })
  })

  it('has a capability mapping for every bridge method', () => {
    for (const method of BRIDGE_METHODS) {
      expect(gateBridgeMethod([], method).granted).toBe(false) // mapped, just undeclared
      expect(gateBridgeMethod([], method)).not.toEqual({ granted: false, error: 'unknown_method' })
    }
  })
})

describe('validateHostCommand', () => {
  it('accepts an https open-external-url', () => {
    expect(validateHostCommand('open-external-url', { url: 'https://example.com' })).toEqual({
      ok: true
    })
  })

  it('rejects a non-http(s) scheme', () => {
    expect(validateHostCommand('open-external-url', { url: 'file:///etc/passwd' }).ok).toBe(false)
    expect(validateHostCommand('open-external-url', { url: 'javascript:alert(1)' }).ok).toBe(false)
    expect(validateHostCommand('open-external-url', { url: 'not a url' }).ok).toBe(false)
  })

  it('accepts copy-to-clipboard with string text and rejects non-string', () => {
    expect(validateHostCommand('copy-to-clipboard', { text: 'hi' })).toEqual({ ok: true })
    expect(validateHostCommand('copy-to-clipboard', { text: 42 }).ok).toBe(false)
  })

  it('rejects an unlisted host command', () => {
    expect(validateHostCommand('spawn-shell', {})).toEqual({ ok: false, error: 'unknown_method' })
  })
})

describe('projectWorkspaceSnapshot', () => {
  it('keeps exactly the bounded keys and drops everything else', () => {
    const projected = projectWorkspaceSnapshot({
      workspaceName: 'orca',
      currentBranch: 'main',
      isDirty: true,
      openFileCount: 3,
      // sensitive fields a host service must never leak:
      absolutePath: '/Users/me/secret',
      remoteUrl: 'git@github.com:me/secret.git',
      token: 'ghp_xxx'
    })
    expect(Object.keys(projected).sort()).toEqual([...WORKSPACE_SNAPSHOT_KEYS].sort())
    expect(projected).not.toHaveProperty('absolutePath')
    expect(projected).not.toHaveProperty('token')
    expect(projected).toEqual({
      workspaceName: 'orca',
      currentBranch: 'main',
      isDirty: true,
      openFileCount: 3
    })
  })

  it('coerces missing / wrong-typed fields to safe defaults', () => {
    expect(projectWorkspaceSnapshot({})).toEqual({
      workspaceName: '',
      currentBranch: null,
      isDirty: false,
      openFileCount: 0
    })
    expect(projectWorkspaceSnapshot(null)).toEqual({
      workspaceName: '',
      currentBranch: null,
      isDirty: false,
      openFileCount: 0
    })
  })
})
