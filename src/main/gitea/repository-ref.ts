import {
  createGiteaCompatibleRepoRefResolver,
  parseGiteaCompatibleRepoRef,
  type GiteaCompatibleRepoRef,
  type GiteaCompatibleRepoRefOptions
} from '../gitea-compatible/repository-ref'

export type GiteaRepoRef = GiteaCompatibleRepoRef

const GITEA_REPO_REF_OPTIONS: GiteaCompatibleRepoRefOptions = {
  excludedHosts: ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org'],
  allowUnknownHosts: true
}

const resolver = createGiteaCompatibleRepoRefResolver(GITEA_REPO_REF_OPTIONS)

/** @internal - exposed for tests only */
export function _resetGiteaRepoRefCache(): void {
  resolver.reset()
}

export function parseGiteaRepoRef(remoteUrl: string): GiteaRepoRef | null {
  return parseGiteaCompatibleRepoRef(remoteUrl, GITEA_REPO_REF_OPTIONS)
}

export function getGiteaRepoRefForRemote(
  repoPath: string,
  remoteName: string
): Promise<GiteaRepoRef | null> {
  return resolver.getRepoRefForRemote(repoPath, remoteName)
}

export function getGiteaRepoRef(repoPath: string): Promise<GiteaRepoRef | null> {
  return resolver.getRepoRef(repoPath)
}
