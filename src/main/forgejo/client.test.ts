import { beforeEach, describe, expect, it, vi } from 'vitest'

const { gitExecFileAsyncMock } = vi.hoisted(() => ({
  gitExecFileAsyncMock: vi.fn()
}))

vi.mock('../git/runner', () => ({
  gitExecFileAsync: gitExecFileAsyncMock
}))

import {
  getForgejoAuthStatus,
  getForgejoPullRequestForBranch,
  normalizeForgejoApiBaseUrl
} from './client'
import { _resetForgejoRepoRefCache } from './repository-ref'

const OLD_ENV = process.env

function forgejoPr(index = 7, branch = 'feature/forgejo') {
  return {
    number: index,
    title: 'Add Forgejo',
    state: 'open',
    html_url: `https://code.example.com/team/repo/pulls/${index}`,
    updated_at: '2026-05-15T00:00:00Z',
    mergeable: true,
    head: {
      ref: branch,
      label: `team:${branch}`,
      sha: 'abc123'
    }
  }
}

describe('Forgejo client', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV }
    process.env.ORCA_FORGEJO_TOKEN = 'forgejo-token'
    process.env.ORCA_FORGEJO_API_BASE_URL = 'https://code.example.com'
    delete process.env.ORCA_GITEA_TOKEN
    delete process.env.ORCA_GITEA_API_BASE_URL
    gitExecFileAsyncMock.mockReset()
    gitExecFileAsyncMock.mockResolvedValue({
      stdout: 'https://git.example.com/team/repo.git\n',
      stderr: ''
    })
    _resetForgejoRepoRefCache()
    vi.unstubAllGlobals()
  })

  it('normalizes Forgejo API base URLs', () => {
    expect(normalizeForgejoApiBaseUrl('https://git.example.com')).toBe(
      'https://git.example.com/api/v1'
    )
    expect(normalizeForgejoApiBaseUrl('https://git.example.com/api/v1/')).toBe(
      'https://git.example.com/api/v1'
    )
  })

  it('fetches a branch pull request and commit status', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const parsed = new URL(url)
      if (!init) {
        throw new Error('expected request init')
      }
      expect((init.headers as Record<string, string>).Authorization).toBe('token forgejo-token')
      if (parsed.pathname.endsWith('/commits/abc123/status')) {
        return Response.json({ state: 'success' })
      }
      return Response.json([forgejoPr()])
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getForgejoPullRequestForBranch('/repo', 'refs/heads/feature/forgejo')
    ).resolves.toEqual({
      number: 7,
      title: 'Add Forgejo',
      state: 'open',
      url: 'https://code.example.com/team/repo/pulls/7',
      status: 'success',
      updatedAt: '2026-05-15T00:00:00Z',
      mergeable: 'MERGEABLE',
      headSha: 'abc123'
    })

    const listUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(listUrl.origin).toBe('https://code.example.com')
    expect(listUrl.pathname).toBe('/api/v1/repos/team/repo/pulls')
    expect(listUrl.searchParams.get('state')).toBe('all')
  })

  it('reports configured token auth without a global API base URL', async () => {
    delete process.env.ORCA_FORGEJO_API_BASE_URL
    gitExecFileAsyncMock.mockResolvedValue({
      stdout: 'https://codeberg.org/team/repo.git\n',
      stderr: ''
    })
    await expect(getForgejoAuthStatus()).resolves.toEqual({
      configured: true,
      authenticated: true,
      account: null,
      baseUrl: null,
      tokenConfigured: true
    })
  })

  it('verifies token auth when a global API base URL is configured', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ login: 'forgejo-user' })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getForgejoAuthStatus()).resolves.toEqual({
      configured: true,
      authenticated: true,
      account: 'forgejo-user',
      baseUrl: 'https://code.example.com/api/v1',
      tokenConfigured: true
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://code.example.com/api/v1/user')
  })
})
