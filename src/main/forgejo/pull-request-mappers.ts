import type {
  GiteaCompatiblePullRequestInfo,
  RawGiteaCompatibleCombinedStatus,
  RawGiteaCompatibleCommitStatus,
  RawGiteaCompatiblePullRequest
} from '../gitea-compatible/pull-request-mappers'
import {
  deriveGiteaCompatibleCommitStatus,
  mapGiteaCompatibleMergeable,
  mapGiteaCompatiblePullRequest,
  mapGiteaCompatiblePullRequestState
} from '../gitea-compatible/pull-request-mappers'

export type RawForgejoPullRequest = RawGiteaCompatiblePullRequest
export type ForgejoPullRequestInfo = GiteaCompatiblePullRequestInfo
export type RawForgejoCombinedStatus = RawGiteaCompatibleCombinedStatus
export type RawForgejoCommitStatus = RawGiteaCompatibleCommitStatus

export const deriveForgejoCommitStatus = deriveGiteaCompatibleCommitStatus
export const mapForgejoPullRequestState = mapGiteaCompatiblePullRequestState
export const mapForgejoMergeable = mapGiteaCompatibleMergeable
export const mapForgejoPullRequest = mapGiteaCompatiblePullRequest
