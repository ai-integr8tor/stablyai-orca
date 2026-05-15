import type { CheckStatus, PRMergeableState } from '../../shared/types'

export type RawGiteaCompatiblePullRequest = {
  number?: number
  title?: string
  state?: string | null
  html_url?: string | null
  updated_at?: string | null
  merged?: boolean | null
  draft?: boolean | null
  mergeable?: boolean | null
  head?: {
    ref?: string | null
    label?: string | null
    sha?: string | null
  } | null
}

export type GiteaCompatiblePullRequestInfo = {
  number: number
  title: string
  state: 'open' | 'closed' | 'merged' | 'draft'
  url: string
  status: CheckStatus
  updatedAt: string
  mergeable: PRMergeableState
  headSha?: string
}

export type RawGiteaCompatibleCombinedStatus = {
  state?: string | null
  statuses?: RawGiteaCompatibleCommitStatus[] | null
}

export type RawGiteaCompatibleCommitStatus = {
  status?: string | null
  state?: string | null
}

function classifyGiteaCompatibleStatus(status: string | null | undefined): CheckStatus {
  switch (status?.trim().toLowerCase()) {
    case 'success':
      return 'success'
    case 'failure':
    case 'error':
    case 'warning':
      return 'failure'
    case 'pending':
      return 'pending'
    case 'skipped':
    default:
      return 'neutral'
  }
}

export function deriveGiteaCompatibleCommitStatus(
  rollup: RawGiteaCompatibleCombinedStatus | null
): CheckStatus {
  if (!rollup) {
    return 'neutral'
  }
  const combined = classifyGiteaCompatibleStatus(rollup.state)
  if (combined !== 'neutral') {
    return combined
  }
  const statuses = rollup.statuses ?? []
  if (statuses.length === 0) {
    return 'neutral'
  }

  let hasPending = false
  for (const status of statuses) {
    const classified = classifyGiteaCompatibleStatus(status.status ?? status.state)
    if (classified === 'failure') {
      return 'failure'
    }
    if (classified === 'pending') {
      hasPending = true
    }
  }
  if (hasPending) {
    return 'pending'
  }
  return statuses.every(
    (status) => classifyGiteaCompatibleStatus(status.status ?? status.state) === 'success'
  )
    ? 'success'
    : 'neutral'
}

export function mapGiteaCompatiblePullRequestState(
  raw: Pick<RawGiteaCompatiblePullRequest, 'draft' | 'merged' | 'state'>
): GiteaCompatiblePullRequestInfo['state'] {
  if (raw.merged) {
    return 'merged'
  }
  if (raw.draft) {
    return 'draft'
  }
  return raw.state?.trim().toLowerCase() === 'closed' ? 'closed' : 'open'
}

export function mapGiteaCompatibleMergeable(value: boolean | null | undefined): PRMergeableState {
  if (value === true) {
    return 'MERGEABLE'
  }
  if (value === false) {
    return 'CONFLICTING'
  }
  return 'UNKNOWN'
}

export function mapGiteaCompatiblePullRequest(
  raw: RawGiteaCompatiblePullRequest,
  status: CheckStatus
): GiteaCompatiblePullRequestInfo | null {
  if (typeof raw.number !== 'number' || !raw.title || !raw.html_url) {
    return null
  }
  const headSha = raw.head?.sha?.trim()
  return {
    number: raw.number,
    title: raw.title,
    state: mapGiteaCompatiblePullRequestState(raw),
    url: raw.html_url,
    status,
    updatedAt: raw.updated_at ?? '',
    mergeable: mapGiteaCompatibleMergeable(raw.mergeable),
    ...(headSha ? { headSha } : {})
  }
}
