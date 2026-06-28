import { describe, expect, it } from 'vitest'
import { parseInstallSource } from './install-source'

describe('parseInstallSource', () => {
  it('parses local paths', () => {
    expect(parseInstallSource('/abs/plugin')).toEqual({ kind: 'local', path: '/abs/plugin' })
    expect(parseInstallSource('./rel')).toEqual({ kind: 'local', path: './rel' })
    expect(parseInstallSource('../up')).toEqual({ kind: 'local', path: '../up' })
    expect(parseInstallSource('C:\\win\\plugin')?.kind).toBe('local')
  })

  it('parses tarballs', () => {
    expect(parseInstallSource('https://x.com/p.tgz')).toEqual({
      kind: 'tarball',
      url: 'https://x.com/p.tgz'
    })
    expect(parseInstallSource('https://x.com/p.tar.gz')?.kind).toBe('tarball')
  })

  it('parses git sources', () => {
    expect(parseInstallSource('git+https://github.com/a/b.git')?.kind).toBe('git')
    expect(parseInstallSource('github:acme/foo')?.kind).toBe('git')
    expect(parseInstallSource('https://github.com/a/b.git')?.kind).toBe('git')
  })

  it('parses registry specs with optional version and scope', () => {
    expect(parseInstallSource('@acme/orca-foo')).toEqual({
      kind: 'registry',
      name: '@acme/orca-foo',
      version: null
    })
    expect(parseInstallSource('@acme/orca-foo@1.2.3')).toEqual({
      kind: 'registry',
      name: '@acme/orca-foo',
      version: '1.2.3'
    })
    expect(parseInstallSource('orca-foo@2.0.0')).toEqual({
      kind: 'registry',
      name: 'orca-foo',
      version: '2.0.0'
    })
  })

  it('treats a plain http(s) url as a tarball download', () => {
    expect(parseInstallSource('https://x.com/bundle')?.kind).toBe('tarball')
  })

  it('returns null for empty input', () => {
    expect(parseInstallSource('   ')).toBeNull()
  })
})
