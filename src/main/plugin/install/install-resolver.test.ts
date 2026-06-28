import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAndInstall, type InstallAdapters } from './install-resolver'
import { emptyLockfile } from './install-integrity'

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'acme.foo',
    name: 'Foo',
    version: '1.0.0',
    hostApiVersion: '0.1.0',
    main: 'main.js',
    contributes: { sidebar: { title: 'Foo', icon: 'Activity', ui: 'index.html' } },
    capabilities: ['workspace:read'],
    ...overrides
  }
}

function writeManifestInto(dir: string, m: Record<string, unknown> = manifest()): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plugin.json'), JSON.stringify(m))
}

let tmp: string
let pluginsDir: string
let stagingDir: string

// Fake adapters: stage a manifest as if fetched/cloned/extracted.
function adapters(m: Record<string, unknown> = manifest()): InstallAdapters {
  return {
    fetchRegistryTarball: async () => ({ bytes: Buffer.from('reg-bytes'), version: '1.2.3' }),
    fetchTarball: async () => Buffer.from('tar-bytes'),
    extractTarball: async (_bytes, destDir) => writeManifestInto(destDir, m),
    cloneGit: async (_url, destDir) => {
      writeManifestInto(destDir, m)
      return { commit: 'abc1234' }
    }
  }
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'install-resolver-'))
  pluginsDir = join(tmp, 'installed')
  stagingDir = join(tmp, 'staging')
  mkdirSync(pluginsDir, { recursive: true })
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('resolveAndInstall', () => {
  it('installs a registry plugin and records integrity + resolved version', async () => {
    const result = await resolveAndInstall(
      { kind: 'registry', name: 'acme.foo', version: null },
      { pluginsDir, stagingDir, adapters: adapters(), lockfile: emptyLockfile() }
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.version).toBe('1.2.3') // resolved by the registry adapter
      expect(existsSync(join(pluginsDir, 'acme.foo', 'plugin.json'))).toBe(true)
      expect(result.lockfile.plugins['acme.foo'].integrity.startsWith('sha256-')).toBe(true)
    }
  })

  it('installs a git plugin pinned by commit', async () => {
    const result = await resolveAndInstall(
      { kind: 'git', url: 'github:acme/foo' },
      { pluginsDir, stagingDir, adapters: adapters(), lockfile: emptyLockfile() }
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.lockfile.plugins['acme.foo'].integrity).toBe('git-abc1234')
    }
  })

  it('rejects an http (non-https) tarball before fetching', async () => {
    const result = await resolveAndInstall(
      { kind: 'tarball', url: 'http://x.com/p.tgz' },
      { pluginsDir, stagingDir, adapters: adapters(), lockfile: emptyLockfile() }
    )
    expect(result.ok).toBe(false)
  })

  it('rejects an invalid manifest and stages nothing into pluginsDir', async () => {
    const result = await resolveAndInstall(
      { kind: 'registry', name: 'acme.foo', version: null },
      {
        pluginsDir,
        stagingDir,
        adapters: adapters(manifest({ capabilities: ['process:exec'] })),
        lockfile: emptyLockfile()
      }
    )
    expect(result.ok).toBe(false)
    expect(existsSync(join(pluginsDir, 'acme.foo'))).toBe(false)
    expect(existsSync(stagingDir)).toBe(false) // cleaned up
  })

  it('rejects an unsafe plugin id from a fetched manifest', async () => {
    const result = await resolveAndInstall(
      { kind: 'registry', name: 'evil', version: null },
      {
        pluginsDir,
        stagingDir,
        adapters: adapters(manifest({ id: '../../escape' })),
        lockfile: emptyLockfile()
      }
    )
    expect(result.ok).toBe(false)
  })

  it('installs a local source by copying the folder', async () => {
    const src = join(tmp, 'src')
    writeManifestInto(src)
    const result = await resolveAndInstall(
      { kind: 'local', path: src },
      { pluginsDir, stagingDir, adapters: adapters(), lockfile: emptyLockfile() }
    )
    expect(result.ok).toBe(true)
    expect(existsSync(join(pluginsDir, 'acme.foo', 'plugin.json'))).toBe(true)
  })

  // Registry adapter with controllable bytes/version, for reinstall integrity.
  function registryAdapters(bytes: string, version = '1.2.3'): InstallAdapters {
    return {
      fetchRegistryTarball: async () => ({ bytes: Buffer.from(bytes), version }),
      fetchTarball: async () => Buffer.from('tar-bytes'),
      extractTarball: async (_b, destDir) => writeManifestInto(destDir, manifest()),
      cloneGit: async (_u, destDir) => {
        writeManifestInto(destDir, manifest())
        return { commit: 'abc1234' }
      }
    }
  }

  const installRegistry = (bytes: string, version: string, lockfile = emptyLockfile()) =>
    resolveAndInstall(
      { kind: 'registry', name: 'acme.foo', version: null },
      { pluginsDir, stagingDir, adapters: registryAdapters(bytes, version), lockfile }
    )

  it('rejects a same-version reinstall whose fetched bytes differ from the lock', async () => {
    const first = await installRegistry('reg-bytes', '1.2.3')
    expect(first.ok).toBe(true)
    const lock = first.ok ? first.lockfile : emptyLockfile()
    // Same id + version, but the registry now serves different bytes (compromise).
    const second = await installRegistry('tampered-bytes', '1.2.3', lock)
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.errors[0]).toContain('integrity mismatch')
    }
  })

  it('allows a same-version reinstall when the bytes match the lock', async () => {
    const first = await installRegistry('reg-bytes', '1.2.3')
    const lock = first.ok ? first.lockfile : emptyLockfile()
    const second = await installRegistry('reg-bytes', '1.2.3', lock)
    expect(second.ok).toBe(true)
  })

  it('allows a reinstall at a different version (upgrade) without an integrity check', async () => {
    const first = await installRegistry('reg-bytes', '1.2.3')
    const lock = first.ok ? first.lockfile : emptyLockfile()
    // A genuine upgrade resolves a new version + new bytes — must not be blocked.
    const second = await installRegistry('v2-bytes', '2.0.0', lock)
    expect(second.ok).toBe(true)
  })
})
