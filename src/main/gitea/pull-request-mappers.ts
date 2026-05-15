import {
  deriveGiteaCompatibleCommitStatus,
  mapGiteaCompatibleMergeable,
  mapGiteaCompatiblePullRequest,
  mapGiteaCompatiblePullRequestState,
  type GiteaCompatiblePullRequestInfo,
  type RawGiteaCompatibleCombinedStatus,
  type RawGiteaCompatibleCommitStatus,
  type RawGiteaCompatiblePullRequest
} from '../gitea-compatible/pull-request-mappers'

export type RawGiteaPullRequest = RawGiteaCompatiblePullRequest
export type GiteaPullRequestInfo = GiteaCompatiblePullRequestInfo
export type RawGiteaCombinedStatus = RawGiteaCompatibleCombinedStatus
export type RawGiteaCommitStatus = RawGiteaCompatibleCommitStatus

export const deriveGiteaCommitStatus = deriveGiteaCompatibleCommitStatus
export const mapGiteaPullRequestState = mapGiteaCompatiblePullRequestState
export const mapGiteaMergeable = mapGiteaCompatibleMergeable
export const mapGiteaPullRequest = mapGiteaCompatiblePullRequest
