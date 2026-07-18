import { describe, it, expect } from 'vitest'

import { fetchVersionManifest } from './version-manifest'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('fetchVersionManifest', () => {
  it('returns the manifest version, build, notes and iosUrl', async () => {
    const fetchImpl = async () =>
      jsonResponse({
        version: '0.0.22',
        iosBuildNumber: '4',
        releaseNotes: 'Beta with recon fix',
        iosUrl: 'itms-beta://testflight'
      })

    await expect(fetchVersionManifest({ fetchImpl })).resolves.toEqual({
      version: '0.0.22',
      iosBuildNumber: '4',
      releaseNotes: 'Beta with recon fix',
      iosUrl: 'itms-beta://testflight'
    })
  })

  it('returns null on a non-200 response', async () => {
    const fetchImpl = async () => new Response('not found', { status: 404 })
    await expect(fetchVersionManifest({ fetchImpl })).resolves.toBeNull()
  })

  it('returns null when the network throws', async () => {
    const fetchImpl = async () => {
      throw new Error('offline')
    }
    await expect(fetchVersionManifest({ fetchImpl })).resolves.toBeNull()
  })

  it('returns null on a malformed body', async () => {
    const fetchImpl = async () => jsonResponse({ nope: true })
    await expect(fetchVersionManifest({ fetchImpl })).resolves.toBeNull()
  })
})
