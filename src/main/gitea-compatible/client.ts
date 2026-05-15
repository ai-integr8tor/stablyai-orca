import {
  deriveGiteaCompatibleCommitStatus,
  mapGiteaCompatiblePullRequest,
  type GiteaCompatiblePullRequestInfo,
  type RawGiteaCompatibleCombinedStatus,
  type RawGiteaCompatiblePullRequest
} from './pull-request-mappers'
import type { GiteaCompatibleRepoRef } from './repository-ref'

const REQUEST_TIMEOUT_MS = 5000
const PULL_REQUEST_PAGE_LIMIT = 50
const MAX_PULL_REQUEST_PAGES = 5

type GiteaCompatibleAuthConfig = {
  apiBaseUrl: string | null
  token: string | null
}

export type GiteaCompatibleAuthStatus = {
  configured: boolean
  authenticated: boolean
  account: string | null
  baseUrl: string | null
  tokenConfigured: boolean
}

export type GiteaCompatibleClientConfig = {
  apiBaseUrlEnv: string
  tokenEnv: string
  getRepoRef: (repoPath: string) => Promise<GiteaCompatibleRepoRef | null>
}

type RequestOptions = {
  searchParams?: Record<string, string | number>
  timeoutMs?: number
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim() ?? ''
  return value.length > 0 ? value : null
}

export function normalizeGiteaCompatibleApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  return /\/api\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/api/v1`
}

function getAuthConfig(config: GiteaCompatibleClientConfig): GiteaCompatibleAuthConfig {
  const apiBaseUrl = envValue(config.apiBaseUrlEnv)
  return {
    apiBaseUrl: apiBaseUrl ? normalizeGiteaCompatibleApiBaseUrl(apiBaseUrl) : null,
    token: envValue(config.tokenEnv)
  }
}

function authHeaders(config: Pick<GiteaCompatibleAuthConfig, 'token'>): Record<string, string> {
  return config.token ? { Authorization: `token ${config.token}` } : {}
}

function configuredApiBaseUrl(
  config: GiteaCompatibleClientConfig,
  repo: GiteaCompatibleRepoRef
): string {
  return getAuthConfig(config).apiBaseUrl ?? repo.apiBaseUrl
}

function apiUrl(baseUrl: string, path: string, searchParams?: RequestOptions['searchParams']): URL {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`)
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, String(value))
    }
  }
  return url
}

async function requestJsonAtBase<T>(
  config: GiteaCompatibleClientConfig,
  baseUrl: string,
  path: string,
  options: RequestOptions = {}
): Promise<T | null> {
  const authConfig = getAuthConfig(config)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(apiUrl(baseUrl, path, options.searchParams), {
      headers: {
        Accept: 'application/json',
        ...authHeaders(authConfig)
      },
      signal: controller.signal
    })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function requestJson<T>(
  config: GiteaCompatibleClientConfig,
  repo: GiteaCompatibleRepoRef,
  path: string,
  options: RequestOptions = {}
): Promise<T | null> {
  return requestJsonAtBase(config, configuredApiBaseUrl(config, repo), path, options)
}

function encodedRepoPath(repo: GiteaCompatibleRepoRef): string {
  return `${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`
}

async function getCommitStatus(
  config: GiteaCompatibleClientConfig,
  repo: GiteaCompatibleRepoRef,
  headSha: string | undefined
): Promise<ReturnType<typeof deriveGiteaCompatibleCommitStatus>> {
  if (!headSha) {
    return 'neutral'
  }
  const data = await requestJson<RawGiteaCompatibleCombinedStatus>(
    config,
    repo,
    `/repos/${encodedRepoPath(repo)}/commits/${encodeURIComponent(headSha)}/status`
  )
  return deriveGiteaCompatibleCommitStatus(data)
}

async function normalizePullRequest(
  config: GiteaCompatibleClientConfig,
  repo: GiteaCompatibleRepoRef,
  raw: RawGiteaCompatiblePullRequest
): Promise<GiteaCompatiblePullRequestInfo | null> {
  const status = await getCommitStatus(config, repo, raw.head?.sha?.trim())
  return mapGiteaCompatiblePullRequest(raw, status)
}

function matchesBranch(raw: RawGiteaCompatiblePullRequest, branchName: string): boolean {
  const ref = raw.head?.ref?.trim()
  if (ref === branchName) {
    return true
  }
  const label = raw.head?.label?.trim()
  return label === branchName || label?.endsWith(`:${branchName}`) === true
}

export async function getGiteaCompatibleAuthStatus(
  config: GiteaCompatibleClientConfig
): Promise<GiteaCompatibleAuthStatus> {
  const authConfig = getAuthConfig(config)
  const tokenConfigured = authConfig.token !== null
  if (!authConfig.apiBaseUrl && !tokenConfigured) {
    return {
      configured: false,
      authenticated: false,
      account: null,
      baseUrl: null,
      tokenConfigured: false
    }
  }
  if (!authConfig.apiBaseUrl) {
    return {
      configured: true,
      authenticated: true,
      account: null,
      baseUrl: null,
      tokenConfigured
    }
  }

  if (!tokenConfigured) {
    const version = await requestJsonAtBase<{ version?: string }>(
      config,
      authConfig.apiBaseUrl,
      '/version',
      { timeoutMs: 4000 }
    )
    return {
      configured: version !== null,
      authenticated: false,
      account: null,
      baseUrl: authConfig.apiBaseUrl,
      tokenConfigured
    }
  }

  const user = await requestJsonAtBase<{
    login?: string | null
    username?: string | null
    full_name?: string | null
  }>(config, authConfig.apiBaseUrl, '/user', { timeoutMs: 4000 })
  return {
    configured: true,
    authenticated: user !== null,
    account: user?.login ?? user?.username ?? user?.full_name ?? null,
    baseUrl: authConfig.apiBaseUrl,
    tokenConfigured
  }
}

export async function getGiteaCompatiblePullRequest(
  config: GiteaCompatibleClientConfig,
  repoPath: string,
  prNumber: number
): Promise<GiteaCompatiblePullRequestInfo | null> {
  const repo = await config.getRepoRef(repoPath)
  if (!repo) {
    return null
  }
  const raw = await requestJson<RawGiteaCompatiblePullRequest>(
    config,
    repo,
    `/repos/${encodedRepoPath(repo)}/pulls/${encodeURIComponent(String(prNumber))}`
  )
  return raw ? normalizePullRequest(config, repo, raw) : null
}

export async function getGiteaCompatiblePullRequestForBranch(
  config: GiteaCompatibleClientConfig,
  repoPath: string,
  branch: string,
  linkedPRNumber?: number | null
): Promise<GiteaCompatiblePullRequestInfo | null> {
  const branchName = branch.replace(/^refs\/heads\//, '')
  if (!branchName && linkedPRNumber == null) {
    return null
  }

  const repo = await config.getRepoRef(repoPath)
  if (!repo) {
    return null
  }

  if (branchName) {
    for (let page = 1; page <= MAX_PULL_REQUEST_PAGES; page++) {
      const list = await requestJson<RawGiteaCompatiblePullRequest[]>(
        config,
        repo,
        `/repos/${encodedRepoPath(repo)}/pulls`,
        {
          searchParams: {
            state: 'all',
            sort: 'recentupdate',
            page,
            limit: PULL_REQUEST_PAGE_LIMIT
          }
        }
      )
      const raw = list?.find((item) => matchesBranch(item, branchName))
      if (raw) {
        return normalizePullRequest(config, repo, raw)
      }
      if (!list || list.length < PULL_REQUEST_PAGE_LIMIT) {
        break
      }
    }
  }

  if (typeof linkedPRNumber !== 'number') {
    return null
  }
  const raw = await requestJson<RawGiteaCompatiblePullRequest>(
    config,
    repo,
    `/repos/${encodedRepoPath(repo)}/pulls/${encodeURIComponent(String(linkedPRNumber))}`
  )
  return raw ? normalizePullRequest(config, repo, raw) : null
}
