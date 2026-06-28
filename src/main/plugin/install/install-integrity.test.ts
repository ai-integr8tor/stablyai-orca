import { describe, expect, it } from 'vitest'
import {
  checkAgainstLock,
  emptyLockfile,
  isSecureRemoteUrl,
  sha256,
  upsertLock,
  verifyIntegrity
} from './install-integrity'

describe('install integrity', () => {
  it('computes a stable sha256 and verifies it', () => {
    const digest = sha256('hello')
    expect(digest.startsWith('sha256-')).toBe(true)
    expect(sha256('hello')).toBe(digest) // stable
    expect(verifyIntegrity('hello', digest)).toBe(true)
    expect(verifyIntegrity('tampered', digest)).toBe(false)
  })

  it('first install has nothing to verify; reinstall verifies bytes', () => {
    let lock = emptyLockfile()
    expect(checkAgainstLock(lock, 'acme.foo', 'bytes-v1')).toEqual({ ok: true })

    lock = upsertLock(lock, {
      id: 'acme.foo',
      version: '1.0.0',
      source: { kind: 'registry', name: 'acme.foo', version: '1.0.0' },
      integrity: sha256('bytes-v1')
    })
    expect(checkAgainstLock(lock, 'acme.foo', 'bytes-v1')).toEqual({ ok: true })
    const bad = checkAgainstLock(lock, 'acme.foo', 'bytes-tampered')
    expect(bad.ok).toBe(false)
  })

  it('rejects non-https remote urls', () => {
    expect(isSecureRemoteUrl('https://x.com/p.tgz')).toBe(true)
    expect(isSecureRemoteUrl('http://x.com/p.tgz')).toBe(false)
  })
})
