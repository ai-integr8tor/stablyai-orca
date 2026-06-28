// NEEDS-RUNTIME-VERIFY: concrete InstallAdapters using only node built-ins +
// system `git`/`tar` (no arborist/pacote, so no new production deps). Network +
// subprocess behavior is verifiable only at runtime; the orchestration that
// drives these (resolveAndInstall) is unit-tested with fakes.

import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { InstallAdapters } from './install-resolver'

const execFileAsync = promisify(execFile)

function httpsGet(url: string, asJson: boolean): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method: 'GET', headers: asJson ? { accept: 'application/json' } : {} },
      (res) => {
        const status = res.statusCode ?? 0
        // Follow one level of redirect (registry tarballs commonly 3xx to a CDN).
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          httpsGet(new URL(res.headers.location, url).toString(), asJson).then(resolve, reject)
          return
        }
        if (status < 200 || status >= 300) {
          res.resume()
          reject(new Error(`GET ${url} failed: HTTP ${status}`))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

async function resolveRegistryTarballUrl(
  name: string,
  version: string | null
): Promise<{ tarball: string; version: string }> {
  // Public registry; a private/scoped registry would swap the base URL + auth.
  const meta = JSON.parse(
    (await httpsGet(`https://registry.npmjs.org/${name.replace('/', '%2f')}`, true)).toString(
      'utf8'
    )
  ) as {
    'dist-tags'?: { latest?: string }
    versions?: Record<string, { dist?: { tarball?: string } }>
  }
  const resolved = version ?? meta['dist-tags']?.latest
  const tarball = resolved ? meta.versions?.[resolved]?.dist?.tarball : undefined
  if (!resolved || !tarball) {
    throw new Error(`could not resolve ${name}@${version ?? 'latest'} from the registry`)
  }
  return { tarball, version: resolved }
}

export function createInstallAdapters(): InstallAdapters {
  return {
    fetchRegistryTarball: async (name, version) => {
      const { tarball, version: resolved } = await resolveRegistryTarballUrl(name, version)
      return { bytes: await httpsGet(tarball, false), version: resolved }
    },
    fetchTarball: (url) => httpsGet(url, false),
    extractTarball: async (bytes, destDir) => {
      mkdirSync(destDir, { recursive: true })
      const staging = mkdtempSync(join(tmpdir(), 'orca-plugin-tgz-'))
      const file = join(staging, 'bundle.tgz')
      try {
        writeFileSync(file, bytes)
        // npm tarballs nest under package/; --strip-components=1 flattens it.
        await execFileAsync('tar', ['-xzf', file, '-C', destDir, '--strip-components=1'])
      } finally {
        rmSync(staging, { recursive: true, force: true })
      }
    },
    cloneGit: async (url, destDir) => {
      const ref = url.replace(/^git\+/, '')
      await execFileAsync('git', ['clone', '--depth', '1', ref, destDir])
      const { stdout } = await execFileAsync('git', ['-C', destDir, 'rev-parse', 'HEAD'])
      return { commit: stdout.trim() }
    }
  }
}
