import { describe, it, expect } from 'vitest'

import { fetchItunesVersion } from './itunes-lookup'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('fetchItunesVersion', () => {
  it('returns the production version and release notes', async () => {
    const fetchImpl = async () =>
      jsonResponse({
        resultCount: 1,
        results: [{ version: '0.0.21', releaseNotes: 'Bug fixes' }]
      })

    await expect(fetchItunesVersion({ fetchImpl })).resolves.toEqual({
      version: '0.0.21',
      releaseNotes: 'Bug fixes'
    })
  })

  it('returns null when the app is not in production (TestFlight-only, no results)', async () => {
    const fetchImpl = async () => jsonResponse({ resultCount: 0, results: [] })
    await expect(fetchItunesVersion({ fetchImpl })).resolves.toBeNull()
  })

  it('returns null on a non-200 response', async () => {
    const fetchImpl = async () => new Response('rate limited', { status: 429 })
    await expect(fetchItunesVersion({ fetchImpl })).resolves.toBeNull()
  })

  it('returns null when the network throws', async () => {
    const fetchImpl = async () => {
      throw new Error('offline')
    }
    await expect(fetchItunesVersion({ fetchImpl })).resolves.toBeNull()
  })

  it('returns null on a malformed body', async () => {
    const fetchImpl = async () => jsonResponse({ unexpected: true })
    await expect(fetchItunesVersion({ fetchImpl })).resolves.toBeNull()
  })
})
