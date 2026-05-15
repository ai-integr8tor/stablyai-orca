import {
  getGiteaCompatibleAuthStatus,
  getGiteaCompatiblePullRequest,
  getGiteaCompatiblePullRequestForBranch,
  normalizeGiteaCompatibleApiBaseUrl,
  type GiteaCompatibleAuthStatus,
  type GiteaCompatibleClientConfig
} from '../gitea-compatible/client'
import { getForgejoRepoRef, type ForgejoRepoRef } from './repository-ref'

export type ForgejoAuthStatus = GiteaCompatibleAuthStatus

const FORGEJO_CLIENT_CONFIG: GiteaCompatibleClientConfig = {
  apiBaseUrlEnv: 'ORCA_FORGEJO_API_BASE_URL',
  tokenEnv: 'ORCA_FORGEJO_TOKEN',
  getRepoRef: getForgejoRepoRef
}

export function normalizeForgejoApiBaseUrl(value: string): string {
  return normalizeGiteaCompatibleApiBaseUrl(value)
}

export function getForgejoAuthStatus(): Promise<ForgejoAuthStatus> {
  return getGiteaCompatibleAuthStatus(FORGEJO_CLIENT_CONFIG)
}

export function getForgejoPullRequest(repoPath: string, prNumber: number) {
  return getGiteaCompatiblePullRequest(FORGEJO_CLIENT_CONFIG, repoPath, prNumber)
}

export function getForgejoPullRequestForBranch(
  repoPath: string,
  branch: string,
  linkedPRNumber?: number | null
) {
  return getGiteaCompatiblePullRequestForBranch(
    FORGEJO_CLIENT_CONFIG,
    repoPath,
    branch,
    linkedPRNumber
  )
}

export function getForgejoRepoSlug(repoPath: string): Promise<ForgejoRepoRef | null> {
  return getForgejoRepoRef(repoPath)
}
