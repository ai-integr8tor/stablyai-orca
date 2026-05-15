import {
  createGiteaCompatibleRepoRefResolver,
  parseGiteaCompatibleRepoRef,
  type GiteaCompatibleRepoRef,
  type GiteaCompatibleRepoRefOptions
} from '../gitea-compatible/repository-ref'

export type ForgejoRepoRef = GiteaCompatibleRepoRef

const KNOWN_FORGEJO_HOSTS = ['codeberg.org'] as const
const knownForgejoHosts = new Set<string>(KNOWN_FORGEJO_HOSTS)

function envValue(name: string): string | null {
  const value = process.env[name]?.trim() ?? ''
  return value.length > 0 ? value : null
}

function isForgejoHost(host: string): boolean {
  const normalizedHost = host.toLowerCase()
  return knownForgejoHosts.has(normalizedHost) || normalizedHost.includes('forgejo')
}

function forgejoRepoRefOptions(): GiteaCompatibleRepoRefOptions {
  return {
    excludedHosts: ['github.com', 'gitlab.com', 'bitbucket.org'],
    isRecognizedHost: isForgejoHost,
    // Why: a global API base URL is an explicit self-hosted Forgejo signal for
    // remotes whose hostname does not include "forgejo".
    allowUnknownHosts: envValue('ORCA_FORGEJO_API_BASE_URL') !== null
  }
}

const resolver = createGiteaCompatibleRepoRefResolver(forgejoRepoRefOptions)

/** @internal - exposed for tests only */
export function _resetForgejoRepoRefCache(): void {
  resolver.reset()
}

export function parseForgejoRepoRef(remoteUrl: string): ForgejoRepoRef | null {
  return parseGiteaCompatibleRepoRef(remoteUrl, forgejoRepoRefOptions())
}

export function getForgejoRepoRefForRemote(
  repoPath: string,
  remoteName: string
): Promise<ForgejoRepoRef | null> {
  return resolver.getRepoRefForRemote(repoPath, remoteName)
}

export function getForgejoRepoRef(repoPath: string): Promise<ForgejoRepoRef | null> {
  return resolver.getRepoRef(repoPath)
}
