import type { GlobalSettings, Repo, WorktreeLocationMode } from './types'

export const DEFAULT_WORKTREE_LOCATION_MODE: WorktreeLocationMode = 'sibling'

export function resolveWorktreeLocationMode(
  repo: Pick<Repo, 'worktreeLocationMode'>,
  settings: Partial<Pick<GlobalSettings, 'defaultWorktreeLocationMode'>>
): WorktreeLocationMode {
  return (
    repo.worktreeLocationMode ??
    settings.defaultWorktreeLocationMode ??
    DEFAULT_WORKTREE_LOCATION_MODE
  )
}

export function isNestedWorktreeLocation(
  repo: Pick<Repo, 'worktreeLocationMode'>,
  settings: Partial<Pick<GlobalSettings, 'defaultWorktreeLocationMode'>>
): boolean {
  return resolveWorktreeLocationMode(repo, settings) === 'nested'
}
