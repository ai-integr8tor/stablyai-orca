import { gitExecFileAsync } from '../git/runner'

export type GiteaCompatibleRepoRef = {
  host: string
  owner: string
  repo: string
  apiBaseUrl: string
  webBaseUrl: string
}

export type GiteaCompatibleRepoRefOptions = {
  excludedHosts?: readonly string[]
  recognizedHosts?: readonly string[]
  isRecognizedHost?: (host: string) => boolean
  allowUnknownHosts?: boolean
}

type RepoRefResolverOptions = GiteaCompatibleRepoRefOptions | (() => GiteaCompatibleRepoRefOptions)

const DEFAULT_EXCLUDED_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org'] as const

function currentOptions(options: RepoRefResolverOptions): GiteaCompatibleRepoRefOptions {
  return typeof options === 'function' ? options() : options
}

function hostSet(values: readonly string[] | undefined): Set<string> {
  return new Set((values ?? []).map((host) => host.toLowerCase()))
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parsePath(pathname: string): { owner: string; repo: string; basePath: string } | null {
  const withoutSuffix = pathname.replace(/\.git$/i, '')
  const parts = withoutSuffix
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 2) {
    return null
  }

  const owner = decodeSegment(parts.at(-2) ?? '')
  const repo = decodeSegment(parts.at(-1) ?? '')
  if (!owner || !repo) {
    return null
  }

  return {
    owner,
    repo,
    basePath: parts.slice(0, -2).join('/')
  }
}

function apiBaseUrlFromWebBase(webBaseUrl: string): string {
  return `${webBaseUrl.replace(/\/+$/, '')}/api/v1`
}

function shouldClaimHost(host: string, options: GiteaCompatibleRepoRefOptions): boolean {
  const normalizedHost = host.toLowerCase()
  const excludedHosts = hostSet(options.excludedHosts ?? DEFAULT_EXCLUDED_HOSTS)
  if (!normalizedHost || excludedHosts.has(normalizedHost)) {
    return false
  }

  const recognizedHosts = hostSet(options.recognizedHosts)
  if (recognizedHosts.has(normalizedHost) || options.isRecognizedHost?.(normalizedHost)) {
    return true
  }

  return options.allowUnknownHosts ?? true
}

function makeRepoRef(
  host: string,
  path: string,
  webBaseUrl: string,
  options: GiteaCompatibleRepoRefOptions
): GiteaCompatibleRepoRef | null {
  const normalizedHost = host.toLowerCase()
  if (!shouldClaimHost(normalizedHost, options)) {
    return null
  }

  const parsed = parsePath(path)
  if (!parsed) {
    return null
  }

  return {
    host: normalizedHost,
    owner: parsed.owner,
    repo: parsed.repo,
    apiBaseUrl: apiBaseUrlFromWebBase(webBaseUrl),
    webBaseUrl
  }
}

export function parseGiteaCompatibleRepoRef(
  remoteUrl: string,
  options: GiteaCompatibleRepoRefOptions = {}
): GiteaCompatibleRepoRef | null {
  const trimmed = remoteUrl.trim()
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    const scpLike = trimmed.match(/^(?:[^@/:]+@)?([^:\s/]+):([^\s]+?)(?:\.git)?$/)
    if (scpLike) {
      const host = scpLike[1]
      const path = scpLike[2]
      return makeRepoRef(host, path, `https://${host.toLowerCase()}`, options)
    }
  }

  try {
    const url = new URL(trimmed)
    const protocol = url.protocol.toLowerCase()
    if (!['http:', 'https:', 'ssh:', 'git+ssh:'].includes(protocol)) {
      return null
    }

    const parsed = parsePath(url.pathname)
    if (!parsed) {
      return null
    }

    const webOrigin =
      protocol === 'http:' || protocol === 'https:'
        ? `${protocol}//${url.host}`
        : `https://${url.hostname.toLowerCase()}`
    const webBaseUrl = parsed.basePath ? `${webOrigin}/${parsed.basePath}` : webOrigin
    return makeRepoRef(url.hostname, url.pathname, webBaseUrl, options)
  } catch {
    return null
  }
}

export function createGiteaCompatibleRepoRefResolver(options: RepoRefResolverOptions): {
  reset: () => void
  getRepoRefForRemote: (
    repoPath: string,
    remoteName: string
  ) => Promise<GiteaCompatibleRepoRef | null>
  getRepoRef: (repoPath: string) => Promise<GiteaCompatibleRepoRef | null>
} {
  const repoRefCache = new Map<string, GiteaCompatibleRepoRef | null>()

  const reset = (): void => {
    repoRefCache.clear()
  }

  const getRepoRefForRemote = async (
    repoPath: string,
    remoteName: string
  ): Promise<GiteaCompatibleRepoRef | null> => {
    const cacheKey = `${repoPath}\0${remoteName}`
    if (repoRefCache.has(cacheKey)) {
      return repoRefCache.get(cacheKey)!
    }
    try {
      const { stdout } = await gitExecFileAsync(['remote', 'get-url', remoteName], {
        cwd: repoPath
      })
      const result = parseGiteaCompatibleRepoRef(stdout, currentOptions(options))
      repoRefCache.set(cacheKey, result)
      return result
    } catch {
      repoRefCache.set(cacheKey, null)
      return null
    }
  }

  return {
    reset,
    getRepoRefForRemote,
    getRepoRef: (repoPath: string): Promise<GiteaCompatibleRepoRef | null> =>
      getRepoRefForRemote(repoPath, 'origin')
  }
}
