import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getProjectSlugMock,
  getMergeRequestForBranchMock,
  getRepoSlugMock,
  getPRForBranchMock,
  getBitbucketRepoSlugMock,
  getBitbucketPullRequestForBranchMock,
  getForgejoRepoSlugMock,
  getForgejoPullRequestForBranchMock,
  getGiteaRepoSlugMock,
  getGiteaPullRequestForBranchMock
} = vi.hoisted(() => ({
  getProjectSlugMock: vi.fn(),
  getMergeRequestForBranchMock: vi.fn(),
  getRepoSlugMock: vi.fn(),
  getPRForBranchMock: vi.fn(),
  getBitbucketRepoSlugMock: vi.fn(),
  getBitbucketPullRequestForBranchMock: vi.fn(),
  getForgejoRepoSlugMock: vi.fn(),
  getForgejoPullRequestForBranchMock: vi.fn(),
  getGiteaRepoSlugMock: vi.fn(),
  getGiteaPullRequestForBranchMock: vi.fn()
}))

vi.mock('../gitlab/client', () => ({
  getProjectSlug: getProjectSlugMock,
  getMergeRequestForBranch: getMergeRequestForBranchMock,
  getMergeRequest: vi.fn()
}))

vi.mock('../github/client', () => ({
  getRepoSlug: getRepoSlugMock,
  getPRForBranch: getPRForBranchMock
}))

vi.mock('../bitbucket/client', () => ({
  getBitbucketRepoSlug: getBitbucketRepoSlugMock,
  getBitbucketPullRequestForBranch: getBitbucketPullRequestForBranchMock,
  getBitbucketPullRequest: vi.fn()
}))

vi.mock('../forgejo/client', () => ({
  getForgejoRepoSlug: getForgejoRepoSlugMock,
  getForgejoPullRequestForBranch: getForgejoPullRequestForBranchMock,
  getForgejoPullRequest: vi.fn()
}))

vi.mock('../gitea/client', () => ({
  getGiteaRepoSlug: getGiteaRepoSlugMock,
  getGiteaPullRequestForBranch: getGiteaPullRequestForBranchMock,
  getGiteaPullRequest: vi.fn()
}))

import { getHostedReviewForBranch } from './hosted-review'

describe('getHostedReviewForBranch', () => {
  beforeEach(() => {
    getProjectSlugMock.mockReset()
    getMergeRequestForBranchMock.mockReset()
    getRepoSlugMock.mockReset()
    getPRForBranchMock.mockReset()
    getBitbucketRepoSlugMock.mockReset()
    getBitbucketPullRequestForBranchMock.mockReset()
    getForgejoRepoSlugMock.mockReset()
    getForgejoPullRequestForBranchMock.mockReset()
    getGiteaRepoSlugMock.mockReset()
    getGiteaPullRequestForBranchMock.mockReset()
  })

  it('maps GitLab merge requests into the hosted review surface', async () => {
    getProjectSlugMock.mockResolvedValue({ host: 'gitlab.com', path: 'g/p' })
    getMergeRequestForBranchMock.mockResolvedValue({
      number: 7,
      title: 'GitLab branch',
      state: 'opened',
      url: 'https://gitlab.com/g/p/-/merge_requests/7',
      pipelineStatus: 'success',
      updatedAt: '2026-05-10T00:00:00.000Z',
      mergeable: 'MERGEABLE'
    })

    await expect(
      getHostedReviewForBranch({ repoPath: '/repo', branch: 'refs/heads/feature' })
    ).resolves.toEqual({
      provider: 'gitlab',
      number: 7,
      title: 'GitLab branch',
      state: 'open',
      url: 'https://gitlab.com/g/p/-/merge_requests/7',
      status: 'success',
      updatedAt: '2026-05-10T00:00:00.000Z',
      mergeable: 'MERGEABLE'
    })
    expect(getPRForBranchMock).not.toHaveBeenCalled()
  })

  it('falls through to GitHub when origin is not GitLab', async () => {
    getProjectSlugMock.mockResolvedValue(null)
    getRepoSlugMock.mockResolvedValue({ owner: 'o', repo: 'r' })
    getPRForBranchMock.mockResolvedValue({
      number: 3,
      title: 'GitHub branch',
      state: 'open',
      url: 'https://github.com/o/r/pull/3',
      checksStatus: 'pending',
      updatedAt: '2026-05-10T00:00:00.000Z',
      mergeable: 'UNKNOWN'
    })

    await expect(
      getHostedReviewForBranch({
        repoPath: '/repo',
        branch: 'feature',
        linkedGitHubPR: 3
      })
    ).resolves.toMatchObject({
      provider: 'github',
      number: 3,
      status: 'pending'
    })
    expect(getPRForBranchMock).toHaveBeenCalledWith('/repo', 'feature', 3)
  })

  it('falls through to Bitbucket when origin is not GitLab or GitHub', async () => {
    getProjectSlugMock.mockResolvedValue(null)
    getRepoSlugMock.mockResolvedValue(null)
    getBitbucketRepoSlugMock.mockResolvedValue({ workspace: 'team', repoSlug: 'orca' })
    getBitbucketPullRequestForBranchMock.mockResolvedValue({
      number: 11,
      title: 'Bitbucket branch',
      state: 'open',
      url: 'https://bitbucket.org/team/orca/pull-requests/11',
      status: 'success',
      updatedAt: '2026-05-10T00:00:00.000Z',
      mergeable: 'UNKNOWN',
      headSha: 'abc123'
    })

    await expect(
      getHostedReviewForBranch({
        repoPath: '/repo',
        branch: 'feature/bitbucket',
        linkedBitbucketPR: 11
      })
    ).resolves.toEqual({
      provider: 'bitbucket',
      number: 11,
      title: 'Bitbucket branch',
      state: 'open',
      url: 'https://bitbucket.org/team/orca/pull-requests/11',
      status: 'success',
      updatedAt: '2026-05-10T00:00:00.000Z',
      mergeable: 'UNKNOWN',
      headSha: 'abc123'
    })
    expect(getBitbucketPullRequestForBranchMock).toHaveBeenCalledWith(
      '/repo',
      'feature/bitbucket',
      11
    )
  })

  it('falls through to Gitea when origin is not another hosted provider', async () => {
    getProjectSlugMock.mockResolvedValue(null)
    getRepoSlugMock.mockResolvedValue(null)
    getBitbucketRepoSlugMock.mockResolvedValue(null)
    getForgejoRepoSlugMock.mockResolvedValue(null)
    getGiteaRepoSlugMock.mockResolvedValue({
      host: 'git.example.com',
      owner: 'team',
      repo: 'orca'
    })
    getGiteaPullRequestForBranchMock.mockResolvedValue({
      number: 14,
      title: 'Gitea branch',
      state: 'open',
      url: 'https://git.example.com/team/orca/pulls/14',
      status: 'pending',
      updatedAt: '2026-05-15T00:00:00.000Z',
      mergeable: 'MERGEABLE',
      headSha: 'def456'
    })

    await expect(
      getHostedReviewForBranch({
        repoPath: '/repo',
        branch: 'feature/gitea',
        linkedGiteaPR: 14
      })
    ).resolves.toEqual({
      provider: 'gitea',
      number: 14,
      title: 'Gitea branch',
      state: 'open',
      url: 'https://git.example.com/team/orca/pulls/14',
      status: 'pending',
      updatedAt: '2026-05-15T00:00:00.000Z',
      mergeable: 'MERGEABLE',
      headSha: 'def456'
    })
    expect(getGiteaPullRequestForBranchMock).toHaveBeenCalledWith('/repo', 'feature/gitea', 14)
  })

  it('falls through to Forgejo before generic Gitea-compatible hosts', async () => {
    getProjectSlugMock.mockResolvedValue(null)
    getRepoSlugMock.mockResolvedValue(null)
    getBitbucketRepoSlugMock.mockResolvedValue(null)
    getForgejoRepoSlugMock.mockResolvedValue({
      host: 'code.example.com',
      owner: 'team',
      repo: 'orca'
    })
    getForgejoPullRequestForBranchMock.mockResolvedValue({
      number: 16,
      title: 'Forgejo branch',
      state: 'open',
      url: 'https://code.example.com/team/orca/pulls/16',
      status: 'success',
      updatedAt: '2026-05-15T00:00:00.000Z',
      mergeable: 'MERGEABLE',
      headSha: 'abc999'
    })

    await expect(
      getHostedReviewForBranch({
        repoPath: '/repo',
        branch: 'feature/forgejo',
        linkedForgejoPR: 16
      })
    ).resolves.toEqual({
      provider: 'forgejo',
      number: 16,
      title: 'Forgejo branch',
      state: 'open',
      url: 'https://code.example.com/team/orca/pulls/16',
      status: 'success',
      updatedAt: '2026-05-15T00:00:00.000Z',
      mergeable: 'MERGEABLE',
      headSha: 'abc999'
    })
    expect(getForgejoPullRequestForBranchMock).toHaveBeenCalledWith('/repo', 'feature/forgejo', 16)
    expect(getGiteaRepoSlugMock).not.toHaveBeenCalled()
  })
})
