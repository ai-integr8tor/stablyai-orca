import { getRepositoryLocalCommandsSectionId } from '@/components/settings/repository-settings-targets'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/types'

export function findSetupScriptSettingsRepo(
  repos: readonly Repo[],
  repoId: string,
  repoHostId: ExecutionHostId
): Repo | null {
  return (
    repos.find((repo) => repo.id === repoId && getRepoExecutionHostId(repo) === repoHostId) ?? null
  )
}

export function openSetupScriptSettings(input: {
  repoId: string
  repoHostId: ExecutionHostId
  setSettingsSearchQuery: (query: string) => void
  openSettingsTarget: (target: {
    pane: 'repo'
    repoId: string
    repoHostId: ExecutionHostId
    sectionId: string
  }) => void
  openSettingsPage: () => void
}): void {
  const { openSettingsPage, openSettingsTarget, repoHostId, repoId, setSettingsSearchQuery } = input
  // Why: imported setup commands are local repo settings; a stale Settings
  // search should not hide the exact editor this action opens.
  setSettingsSearchQuery('')
  openSettingsTarget({
    pane: 'repo',
    repoId,
    repoHostId,
    sectionId: getRepositoryLocalCommandsSectionId(repoId, repoHostId)
  })
  openSettingsPage()
}
