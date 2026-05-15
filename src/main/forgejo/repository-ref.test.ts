import { beforeEach, describe, expect, it, vi } from 'vitest'

const { gitExecFileAsyncMock } = vi.hoisted(() => ({
  gitExecFileAsyncMock: vi.fn()
}))

vi.mock('../git/runner', () => ({
  gitExecFileAsync: gitExecFileAsyncMock
}))

import { _resetForgejoRepoRefCache, getForgejoRepoRef, parseForgejoRepoRef } from './repository-ref'

const OLD_ENV = process.env

describe('Forgejo repository ref parsing', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV }
    delete process.env.ORCA_FORGEJO_API_BASE_URL
    gitExecFileAsyncMock.mockReset()
    _resetForgejoRepoRefCache()
  })

  it('parses known Forgejo HTTPS remotes and derives the API base URL', () => {
    expect(parseForgejoRepoRef('https://codeberg.org/team/project.git')).toEqual({
      host: 'codeberg.org',
      owner: 'team',
      repo: 'project',
      apiBaseUrl: 'https://codeberg.org/api/v1',
      webBaseUrl: 'https://codeberg.org'
    })
  })

  it('parses Forgejo-named SSH remotes', () => {
    expect(parseForgejoRepoRef('git@forgejo.example.test:team/project.git')).toEqual({
      host: 'forgejo.example.test',
      owner: 'team',
      repo: 'project',
      apiBaseUrl: 'https://forgejo.example.test/api/v1',
      webBaseUrl: 'https://forgejo.example.test'
    })
  })

  it('does not claim arbitrary self-hosted remotes without an explicit Forgejo API base', () => {
    expect(parseForgejoRepoRef('https://git.example.com/team/project.git')).toBeNull()
  })

  it('uses an explicit Forgejo API base as a self-hosted provider signal', () => {
    process.env.ORCA_FORGEJO_API_BASE_URL = 'https://git.example.com'
    expect(parseForgejoRepoRef('https://git.example.com/team/project.git')).toEqual({
      host: 'git.example.com',
      owner: 'team',
      repo: 'project',
      apiBaseUrl: 'https://git.example.com/api/v1',
      webBaseUrl: 'https://git.example.com'
    })
  })

  it('reads and caches the origin remote', async () => {
    gitExecFileAsyncMock.mockResolvedValueOnce({
      stdout: 'https://codeberg.org/team/project.git\n',
      stderr: ''
    })

    await expect(getForgejoRepoRef('/repo')).resolves.toMatchObject({
      host: 'codeberg.org',
      owner: 'team',
      repo: 'project'
    })
    await expect(getForgejoRepoRef('/repo')).resolves.toMatchObject({
      host: 'codeberg.org',
      owner: 'team',
      repo: 'project'
    })
    expect(gitExecFileAsyncMock).toHaveBeenCalledTimes(1)
    expect(gitExecFileAsyncMock).toHaveBeenCalledWith(['remote', 'get-url', 'origin'], {
      cwd: '/repo'
    })
  })
})
