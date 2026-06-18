import { mkdtemp, mkdir, readFile, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installFinderServices } from './finder-services-installer'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-finder-services-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function writeService(name: string, body: string): Promise<string> {
  const serviceRoot = join(root, 'resources', 'Finder Services', `${name}.workflow`)
  await mkdir(join(serviceRoot, 'Contents'), { recursive: true })
  await writeFile(join(serviceRoot, 'Contents', 'document.wflow'), body)
  return join(root, 'resources', 'Finder Services')
}

describe('installFinderServices', () => {
  it('copies bundled Finder workflows into the user Services folder on macOS', async () => {
    const sourceRoot = await writeService('New Orca Terminal Here', 'terminal workflow')
    const homePath = join(root, 'home')

    const result = await installFinderServices({
      platform: 'darwin',
      sourceRoot,
      homePath
    })

    expect(result).toEqual({ installed: 1, skipped: false })
    await expect(
      readFile(
        join(
          homePath,
          'Library',
          'Services',
          'New Orca Terminal Here.workflow',
          'Contents',
          'document.wflow'
        ),
        'utf8'
      )
    ).resolves.toBe('terminal workflow')
  })

  it('does not rewrite an already current Finder workflow', async () => {
    const sourceRoot = await writeService('New Orca Workspace Here', 'workspace workflow')
    const homePath = join(root, 'home')

    await installFinderServices({ platform: 'darwin', sourceRoot, homePath })
    const result = await installFinderServices({ platform: 'darwin', sourceRoot, homePath })

    expect(result).toEqual({ installed: 0, skipped: false })
  })

  it('skips non-macOS platforms without touching the user Services folder', async () => {
    const sourceRoot = await writeService('New Orca Terminal Here', 'terminal workflow')
    const homePath = join(root, 'home')

    const result = await installFinderServices({
      platform: 'linux',
      sourceRoot,
      homePath
    })

    expect(result).toEqual({ installed: 0, skipped: true })
    await expect(readFile(join(homePath, 'Library', 'Services'))).rejects.toThrow()
  })

  it('fails loudly on macOS when the bundled Finder workflows are missing', async () => {
    const homePath = join(root, 'home')

    await expect(
      installFinderServices({
        platform: 'darwin',
        sourceRoot: join(root, 'missing', 'Finder Services'),
        homePath
      })
    ).rejects.toThrow(`finder_services_bundle_missing:${join(root, 'missing', 'Finder Services')}`)
  })
})
