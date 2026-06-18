import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { gitExecFileAsyncMock } = vi.hoisted(() => ({
  gitExecFileAsyncMock: vi.fn()
}))

vi.mock('./runner', () => ({
  gitExecFileAsync: gitExecFileAsyncMock
}))

import {
  DEFAULT_GIT_REMOTE_OPERATION_TIMEOUT_MS,
  gitFastForward,
  gitFetch,
  gitPull,
  gitPullRebaseFromBase,
  gitPush
} from './remote'

const REMOTE_OPERATION_OPTIONS = {
  cwd: '/repo',
  timeout: DEFAULT_GIT_REMOTE_OPERATION_TIMEOUT_MS
}
const ORIGINAL_REMOTE_OPERATION_TIMEOUT_MS = process.env.ORCA_GIT_REMOTE_OPERATION_TIMEOUT_MS

describe('git remote operations', () => {
  beforeEach(() => {
    delete process.env.ORCA_GIT_REMOTE_OPERATION_TIMEOUT_MS
    gitExecFileAsyncMock.mockReset()
  })

  afterEach(() => {
    if (ORIGINAL_REMOTE_OPERATION_TIMEOUT_MS === undefined) {
      delete process.env.ORCA_GIT_REMOTE_OPERATION_TIMEOUT_MS
      return
    }
    process.env.ORCA_GIT_REMOTE_OPERATION_TIMEOUT_MS = ORIGINAL_REMOTE_OPERATION_TIMEOUT_MS
  })

  it('pushes to origin when no upstream is configured', async () => {
    gitExecFileAsyncMock.mockResolvedValue({ stdout: '', stderr: '' })
    gitExecFileAsyncMock.mockRejectedValueOnce(Object.assign(new Error('no branch'), { code: 1 }))

    await gitPush('/repo', true)

    expect(gitExecFileAsyncMock).toHaveBeenLastCalledWith(
      ['push', '--set-upstream', 'origin', 'HEAD'],
      REMOTE_OPERATION_OPTIONS
    )
  })

  it('pushes to the configured upstream remote and branch', async () => {
    gitExecFileAsyncMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'symbolic-ref') {
        return { stdout: 'review/pr-1738\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.review/pr-1738.remote')) {
        return { stdout: 'pr-prateek-orca\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.review/pr-1738.pushRemote')) {
        return { stdout: 'pr-prateek-orca\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.review/pr-1738.merge')) {
        return { stdout: 'refs/heads/prateek/fix-sidebar-agents-toggle\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.review/pr-1738.base')) {
        throw new Error('missing branch base')
      }
      return { stdout: '', stderr: '' }
    })

    await gitPush('/repo', false)

    expect(gitExecFileAsyncMock).toHaveBeenCalledWith(
      ['config', '--get', 'branch.review/pr-1738.remote'],
      { cwd: '/repo' }
    )
    expect(gitExecFileAsyncMock).toHaveBeenLastCalledWith(
      ['push', '--set-upstream', 'pr-prateek-orca', 'HEAD:prateek/fix-sidebar-agents-toggle'],
      REMOTE_OPERATION_OPTIONS
    )
  })

  it('does not combine remote.pushDefault with a base-branch merge target', async () => {
    gitExecFileAsyncMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'symbolic-ref') {
        return { stdout: 'feature/fix\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.feature/fix.remote')) {
        return { stdout: 'origin\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.feature/fix.pushRemote')) {
        throw new Error('missing pushRemote')
      }
      if (args[0] === 'config' && args.includes('remote.pushDefault')) {
        return { stdout: 'fork\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.feature/fix.merge')) {
        return { stdout: 'refs/heads/main\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.feature/fix.base')) {
        return { stdout: 'refs/remotes/origin/main\n', stderr: '' }
      }
      return { stdout: '', stderr: '' }
    })

    await gitPush('/repo', false)

    expect(gitExecFileAsyncMock).not.toHaveBeenCalledWith(
      ['push', '--set-upstream', 'fork', 'HEAD:main'],
      REMOTE_OPERATION_OPTIONS
    )
    expect(gitExecFileAsyncMock).toHaveBeenLastCalledWith(
      ['push', '--set-upstream', 'origin', 'HEAD'],
      REMOTE_OPERATION_OPTIONS
    )
  })

  it('keeps a fork head target when the contributor branch matches the base branch name', async () => {
    gitExecFileAsyncMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'symbolic-ref') {
        return { stdout: 'review/pr-1\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.review/pr-1.remote')) {
        return { stdout: 'fork\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.review/pr-1.pushRemote')) {
        return { stdout: 'fork\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.review/pr-1.merge')) {
        return { stdout: 'refs/heads/main\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.review/pr-1.base')) {
        return { stdout: 'refs/remotes/origin/main\n', stderr: '' }
      }
      return { stdout: '', stderr: '' }
    })

    await gitPush('/repo', false)

    expect(gitExecFileAsyncMock).toHaveBeenLastCalledWith(
      ['push', '--set-upstream', 'fork', 'HEAD:main'],
      REMOTE_OPERATION_OPTIONS
    )
  })

  it('pushes to a URL-valued branch pushRemote when no named remote exists', async () => {
    gitExecFileAsyncMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'symbolic-ref') {
        return { stdout: 'imp/chinese-translation\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.imp/chinese-translation.pushRemote')) {
        return { stdout: 'https://github.com/pynickle/orca.git\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('remote.pushDefault')) {
        throw new Error('missing pushDefault')
      }
      if (args[0] === 'config' && args.includes('branch.imp/chinese-translation.remote')) {
        return { stdout: 'https://github.com/pynickle/orca.git\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.imp/chinese-translation.merge')) {
        return { stdout: 'refs/heads/imp/chinese-translation\n', stderr: '' }
      }
      if (args[0] === 'remote' && args[1] === 'get-url') {
        return { stdout: 'https://github.com/stablyai/orca.git\n', stderr: '' }
      }
      if (args[0] === 'remote') {
        return { stdout: 'origin\n', stderr: '' }
      }
      return { stdout: '', stderr: '' }
    })

    await gitPush('/repo', false)

    expect(gitExecFileAsyncMock).toHaveBeenLastCalledWith(
      [
        'push',
        '--set-upstream',
        'https://github.com/pynickle/orca.git',
        'HEAD:imp/chinese-translation'
      ],
      REMOTE_OPERATION_OPTIONS
    )
  })

  it('normalizes a URL-valued branch remote to a matching named remote before pushing', async () => {
    gitExecFileAsyncMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'symbolic-ref') {
        return { stdout: 'imp/chinese-translation\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.imp/chinese-translation.pushRemote')) {
        throw new Error('missing pushRemote')
      }
      if (args[0] === 'config' && args.includes('remote.pushDefault')) {
        throw new Error('missing pushDefault')
      }
      if (args[0] === 'config' && args.includes('branch.imp/chinese-translation.remote')) {
        return { stdout: 'https://github.com/pynickle/orca.git\n', stderr: '' }
      }
      if (args[0] === 'config' && args.includes('branch.imp/chinese-translation.merge')) {
        return { stdout: 'refs/heads/imp/chinese-translation\n', stderr: '' }
      }
      if (args[0] === 'remote' && args[1] === 'get-url' && args[2] === 'origin') {
        return { stdout: 'https://github.com/stablyai/orca.git\n', stderr: '' }
      }
      if (args[0] === 'remote' && args[1] === 'get-url' && args[2] === 'pr-pynickle-orca') {
        return { stdout: 'https://github.com/pynickle/orca.git\n', stderr: '' }
      }
      if (args[0] === 'remote') {
        return { stdout: 'origin\npr-pynickle-orca\n', stderr: '' }
      }
      return { stdout: '', stderr: '' }
    })

    await gitPush('/repo', false)

    expect(gitExecFileAsyncMock).toHaveBeenLastCalledWith(
      ['push', '--set-upstream', 'pr-pynickle-orca', 'HEAD:imp/chinese-translation'],
      REMOTE_OPERATION_OPTIONS
    )
  })

  it('uses an explicit push target even when it differs from the local branch name', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await gitPush('/repo', false, {
      remoteName: 'origin',
      branchName: 'contributor/fix-sidebar'
    })

    expect(gitExecFileAsyncMock).toHaveBeenCalledWith(
      ['push', '--set-upstream', 'origin', 'HEAD:contributor/fix-sidebar'],
      REMOTE_OPERATION_OPTIONS
    )
    expect(gitExecFileAsyncMock.mock.calls).toEqual([
      [['check-ref-format', '--branch', 'contributor/fix-sidebar'], { cwd: '/repo' }],
      [
        ['push', '--set-upstream', 'origin', 'HEAD:contributor/fix-sidebar'],
        REMOTE_OPERATION_OPTIONS
      ]
    ])
  })

  it('passes --force-with-lease when requested', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: 'feature\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'origin\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'refs/heads/feature\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await gitPush('/repo', false, undefined, { forceWithLease: true })

    expect(gitExecFileAsyncMock).toHaveBeenLastCalledWith(
      ['push', '--force-with-lease', '--set-upstream', 'origin', 'HEAD:feature'],
      REMOTE_OPERATION_OPTIONS
    )
  })

  it('bounds push subprocesses with a remote operation timeout', async () => {
    gitExecFileAsyncMock
      .mockRejectedValueOnce(new Error('no branch'))
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await gitPush('/repo', false)

    expect(gitExecFileAsyncMock).toHaveBeenLastCalledWith(
      ['push', '--set-upstream', 'origin', 'HEAD'],
      REMOTE_OPERATION_OPTIONS
    )
  })

  it('maps non-fast-forward push failures to an actionable message', async () => {
    gitExecFileAsyncMock
      .mockRejectedValueOnce(new Error('no branch'))
      .mockRejectedValueOnce(new Error('remote rejected: non-fast-forward'))

    await expect(gitPush('/repo', false)).rejects.toThrow(
      'Push rejected: remote has newer commits (non-fast-forward). Please pull or sync first.'
    )
  })

  it('maps recursive submodule push failures to submodule-specific guidance', async () => {
    gitExecFileAsyncMock
      .mockRejectedValueOnce(new Error('no branch'))
      .mockRejectedValueOnce(
        new Error(
          "Command failed: git push\nPushing submodule 'find-cmux-followers'\n" +
            ' ! [rejected]        master -> master (fetch first)\n' +
            "Unable to push submodule 'find-cmux-followers'\n" +
            'fatal: failed to push all needed submodules'
        )
      )

    await expect(gitPush('/repo', false)).rejects.toThrow(
      "Submodule 'find-cmux-followers' has remote changes. Pull inside the submodule, then try again."
    )
  })

  it('passes through clean tail line when push error does not match known patterns', async () => {
    gitExecFileAsyncMock
      .mockRejectedValueOnce(new Error('no branch'))
      .mockRejectedValueOnce(
        new Error('Command failed: git push\nfatal: something obscure happened')
      )

    await expect(gitPush('/repo', false)).rejects.toThrow('fatal: something obscure happened')
  })

  it('strips embedded credentials from push error messages', async () => {
    gitExecFileAsyncMock
      .mockRejectedValueOnce(new Error('no branch'))
      .mockRejectedValueOnce(
        new Error(
          'Command failed: git push\nhttps://x-access-token:ghp_abc@github.com/foo/bar.git\nfatal: remote error'
        )
      )

    let caught: Error | undefined
    try {
      await gitPush('/repo', false)
    } catch (error) {
      caught = error as Error
    }

    expect(caught).toBeInstanceOf(Error)
    expect(caught?.message).not.toContain('ghp_abc')
    expect(caught?.message).not.toContain('x-access-token')
  })

  it('strips token-only credentials (https://TOKEN@host) from push error messages', async () => {
    gitExecFileAsyncMock
      .mockRejectedValueOnce(new Error('no branch'))
      .mockRejectedValueOnce(
        new Error(
          'Command failed: git push\nhttps://ghp_onlyToken@github.com/foo/bar.git\nfatal: remote error'
        )
      )

    let caught: Error | undefined
    try {
      await gitPush('/repo', false)
    } catch (error) {
      caught = error as Error
    }

    expect(caught).toBeInstanceOf(Error)
    expect(caught?.message).not.toContain('ghp_onlyToken')
  })

  it('falls back to a generic message for non-Error rejections', async () => {
    gitExecFileAsyncMock
      .mockRejectedValueOnce(new Error('no branch'))
      .mockRejectedValueOnce('string')

    await expect(gitPush('/repo', false)).rejects.toThrow('Git remote operation failed.')
  })

  it("runs pull with the user's configured strategy", async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: 'feature\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'origin/feature\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await gitPull('/repo')

    expect(gitExecFileAsyncMock.mock.calls).toEqual([
      [['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: '/repo' }],
      [['rev-parse', '--abbrev-ref', 'HEAD@{u}'], { cwd: '/repo' }],
      [['pull'], REMOTE_OPERATION_OPTIONS]
    ])
  })

  it('pulls the same-name origin branch for legacy base-tracking worktrees', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: 'feature\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'origin/main\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await gitPull('/repo')

    expect(gitExecFileAsyncMock.mock.calls).toEqual([
      [['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: '/repo' }],
      [['rev-parse', '--abbrev-ref', 'HEAD@{u}'], { cwd: '/repo' }],
      [['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/feature'], { cwd: '/repo' }],
      [['pull', 'origin', 'feature'], REMOTE_OPERATION_OPTIONS]
    ])
  })

  it('pulls from the explicit publish target when one is provided', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await gitPull('/repo', {
      remoteName: 'fork',
      branchName: 'feature/fix'
    })

    expect(gitExecFileAsyncMock.mock.calls).toEqual([
      [['check-ref-format', '--branch', 'feature/fix'], { cwd: '/repo' }],
      [['pull', 'fork', 'feature/fix'], REMOTE_OPERATION_OPTIONS]
    ])
  })

  it('fast-forwards with --ff-only using the configured upstream', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: 'feature\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'origin/feature\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await gitFastForward('/repo')

    expect(gitExecFileAsyncMock.mock.calls).toEqual([
      [['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: '/repo' }],
      [['rev-parse', '--abbrev-ref', 'HEAD@{u}'], { cwd: '/repo' }],
      [['pull', '--ff-only'], REMOTE_OPERATION_OPTIONS]
    ])
  })

  it('fast-forwards from the explicit publish target when one is provided', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await gitFastForward('/repo', {
      remoteName: 'fork',
      branchName: 'feature/fix'
    })

    expect(gitExecFileAsyncMock.mock.calls).toEqual([
      [['check-ref-format', '--branch', 'feature/fix'], { cwd: '/repo' }],
      [['pull', '--ff-only', 'fork', 'feature/fix'], REMOTE_OPERATION_OPTIONS]
    ])
  })

  it('rebases from the selected remote base ref', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: 'origin\nupstream\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await gitPullRebaseFromBase('/repo', 'upstream/main')

    expect(gitExecFileAsyncMock.mock.calls).toEqual([
      [['remote'], { cwd: '/repo' }],
      [['check-ref-format', '--branch', 'main'], { cwd: '/repo' }],
      [['pull', '--rebase', 'upstream', 'main'], REMOTE_OPERATION_OPTIONS]
    ])
  })

  it('uses the longest configured remote name when rebasing from a base ref', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: 'fork\nfork/team\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await gitPullRebaseFromBase('/repo', 'fork/team/feature/base')

    expect(gitExecFileAsyncMock).toHaveBeenLastCalledWith(
      ['pull', '--rebase', 'fork/team', 'feature/base'],
      REMOTE_OPERATION_OPTIONS
    )
  })

  it('normalizes pull authentication errors to a friendly message', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: 'feature\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'origin/feature\n', stderr: '' })
      .mockRejectedValueOnce(new Error('Authentication failed'))

    await expect(gitPull('/repo')).rejects.toThrow(
      'Authentication failed. Check your remote credentials.'
    )
  })

  it('normalizes pull dirty-worktree aborts to a friendly message', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: 'feature\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'origin/feature\n', stderr: '' })
      .mockRejectedValueOnce(
        new Error(
          'Command failed: git pull\n' +
            'error: Your local changes to the following files would be overwritten by merge:\n' +
            '\tsrc/app.ts\n' +
            'Please commit your changes or stash them before you merge.\n' +
            'Aborting'
        )
      )

    await expect(gitPull('/repo')).rejects.toThrow(
      'Pull would overwrite local changes. Commit, stash, or discard them before pulling.'
    )
  })

  it('normalizes pull untracked-file aborts to a friendly message', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: 'feature\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'origin/feature\n', stderr: '' })
      .mockRejectedValueOnce(
        new Error(
          'Command failed: git pull\n' +
            'error: The following untracked working tree files would be overwritten by merge:\n' +
            '\tsrc/new.ts\n' +
            'Please move or remove them before you merge.\n' +
            'Aborting'
        )
      )

    await expect(gitPull('/repo')).rejects.toThrow(
      'Pull would overwrite untracked files. Move, remove, or add them before pulling.'
    )
  })

  it('runs fetch with prune', async () => {
    gitExecFileAsyncMock.mockResolvedValue({ stdout: '', stderr: '' })

    await gitFetch('/repo')

    expect(gitExecFileAsyncMock).toHaveBeenCalledWith(
      ['fetch', '--prune'],
      REMOTE_OPERATION_OPTIONS
    )
  })

  it('uses ORCA_GIT_REMOTE_OPERATION_TIMEOUT_MS for fetch when set', async () => {
    process.env.ORCA_GIT_REMOTE_OPERATION_TIMEOUT_MS = '5000'
    gitExecFileAsyncMock.mockResolvedValue({ stdout: '', stderr: '' })

    await gitFetch('/repo')

    expect(gitExecFileAsyncMock).toHaveBeenCalledWith(['fetch', '--prune'], {
      cwd: '/repo',
      timeout: 5000
    })
  })

  it('falls back to the default fetch timeout when ORCA_GIT_REMOTE_OPERATION_TIMEOUT_MS is invalid', async () => {
    process.env.ORCA_GIT_REMOTE_OPERATION_TIMEOUT_MS = 'invalid'
    gitExecFileAsyncMock.mockResolvedValue({ stdout: '', stderr: '' })

    await gitFetch('/repo')

    expect(gitExecFileAsyncMock).toHaveBeenCalledWith(
      ['fetch', '--prune'],
      REMOTE_OPERATION_OPTIONS
    )
  })

  it('passes the selected WSL distro through fetch validation and execution', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await gitFetch(
      '/repo',
      {
        remoteName: 'fork',
        branchName: 'feature/fix'
      },
      { wslDistro: 'Ubuntu' }
    )

    expect(gitExecFileAsyncMock.mock.calls).toEqual([
      [['check-ref-format', '--branch', 'feature/fix'], { cwd: '/repo', wslDistro: 'Ubuntu' }],
      [
        ['fetch', '--prune', 'fork'],
        { cwd: '/repo', wslDistro: 'Ubuntu', timeout: DEFAULT_GIT_REMOTE_OPERATION_TIMEOUT_MS }
      ]
    ])
  })

  it('fetches the explicit publish target remote when provided', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await gitFetch('/repo', {
      remoteName: 'fork',
      branchName: 'feature/fix'
    })

    expect(gitExecFileAsyncMock.mock.calls).toEqual([
      [['check-ref-format', '--branch', 'feature/fix'], { cwd: '/repo' }],
      [['fetch', '--prune', 'fork'], REMOTE_OPERATION_OPTIONS]
    ])
  })

  it('fetches explicit publish target remotes whose names contain slashes', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await gitFetch('/repo', {
      remoteName: 'foo/bar',
      branchName: 'feature/fix'
    })

    expect(gitExecFileAsyncMock.mock.calls).toEqual([
      [['check-ref-format', '--branch', 'feature/fix'], { cwd: '/repo' }],
      [['fetch', '--prune', 'foo/bar'], REMOTE_OPERATION_OPTIONS]
    ])
  })

  it('normalizes fetch authentication errors to a friendly message', async () => {
    gitExecFileAsyncMock.mockRejectedValueOnce(new Error('Authentication failed'))

    await expect(gitFetch('/repo')).rejects.toThrow(
      'Authentication failed. Check your remote credentials.'
    )
  })
})
