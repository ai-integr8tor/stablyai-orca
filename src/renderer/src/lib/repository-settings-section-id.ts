import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import type { Repo } from '../../../shared/types'

const REPOSITORY_SECTION_PREFIX = 'repo-'

type RepositorySettingsIdentity = Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>

export type ParsedRepositorySettingsSectionId = {
  repoId: string
  hostId: ExecutionHostId | null
}

export function getRepositorySettingsSectionId(repo: RepositorySettingsIdentity): string {
  const hostId = getRepoExecutionHostId(repo)
  if (hostId === LOCAL_EXECUTION_HOST_ID) {
    return `${REPOSITORY_SECTION_PREFIX}${repo.id}`
  }
  return getRepositorySettingsSectionIdForHost(repo.id, hostId)
}

export function getRepositorySettingsSectionIdForHost(
  repoId: string,
  hostId: ExecutionHostId
): string {
  if (hostId === LOCAL_EXECUTION_HOST_ID) {
    return `${REPOSITORY_SECTION_PREFIX}${repoId}`
  }
  return `${REPOSITORY_SECTION_PREFIX}${encodeURIComponent(hostId)}:${encodeURIComponent(repoId)}`
}

export function parseRepositorySettingsSectionId(
  sectionId: string
): ParsedRepositorySettingsSectionId | null {
  if (!sectionId.startsWith(REPOSITORY_SECTION_PREFIX)) {
    return null
  }
  const encodedIdentity = sectionId.slice(REPOSITORY_SECTION_PREFIX.length)
  const separatorIndex = encodedIdentity.indexOf(':')
  if (separatorIndex > 0) {
    try {
      const hostId = normalizeExecutionHostId(
        decodeURIComponent(encodedIdentity.slice(0, separatorIndex))
      )
      if (hostId && hostId !== LOCAL_EXECUTION_HOST_ID) {
        return {
          repoId: decodeURIComponent(encodedIdentity.slice(separatorIndex + 1)),
          hostId
        }
      }
    } catch {
      // Legacy section ids use the raw repo id, so malformed escapes fall through unchanged.
    }
  }
  return { repoId: encodedIdentity, hostId: null }
}

export function findRepoForSettingsSection(repos: readonly Repo[], sectionId: string): Repo | null {
  const identity = parseRepositorySettingsSectionId(sectionId)
  if (!identity) {
    return null
  }
  const matchingRepos = repos.filter((repo) => repo.id === identity.repoId)
  if (identity.hostId) {
    return matchingRepos.find((repo) => getRepoExecutionHostId(repo) === identity.hostId) ?? null
  }
  // Why: legacy/local section ids predate host-qualified identities; prefer the
  // local row so a same-id remote sibling cannot silently take over its pane.
  return (
    matchingRepos.find((repo) => getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID) ??
    matchingRepos[0] ??
    null
  )
}
