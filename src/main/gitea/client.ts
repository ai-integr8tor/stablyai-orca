import {
  getGiteaCompatibleAuthStatus,
  getGiteaCompatiblePullRequest,
  getGiteaCompatiblePullRequestForBranch,
  normalizeGiteaCompatibleApiBaseUrl,
  type GiteaCompatibleAuthStatus,
  type GiteaCompatibleClientConfig
} from '../gitea-compatible/client'
import { getGiteaRepoRef, type GiteaRepoRef } from './repository-ref'

export type GiteaAuthStatus = GiteaCompatibleAuthStatus

const GITEA_CLIENT_CONFIG: GiteaCompatibleClientConfig = {
  apiBaseUrlEnv: 'ORCA_GITEA_API_BASE_URL',
  tokenEnv: 'ORCA_GITEA_TOKEN',
  getRepoRef: getGiteaRepoRef
}

export function normalizeGiteaApiBaseUrl(value: string): string {
  return normalizeGiteaCompatibleApiBaseUrl(value)
}

export function getGiteaAuthStatus(): Promise<GiteaAuthStatus> {
  return getGiteaCompatibleAuthStatus(GITEA_CLIENT_CONFIG)
}

export function getGiteaPullRequest(repoPath: string, prNumber: number) {
  return getGiteaCompatiblePullRequest(GITEA_CLIENT_CONFIG, repoPath, prNumber)
}

export function getGiteaPullRequestForBranch(
  repoPath: string,
  branch: string,
  linkedPRNumber?: number | null
) {
  return getGiteaCompatiblePullRequestForBranch(
    GITEA_CLIENT_CONFIG,
    repoPath,
    branch,
    linkedPRNumber
  )
}

export function getGiteaRepoSlug(repoPath: string): Promise<GiteaRepoRef | null> {
  return getGiteaRepoRef(repoPath)
}
