// Parse a user-entered install string into a typed plugin source. Pure +
// unit-tested; the actual fetching for each kind is performed by injected
// adapters (the registry/git/tarball adapters add deps and are NEEDS-RUNTIME-
// VERIFY — see install-resolver). v1a ships local + private/scoped registry;
// public registry / git / tarball unlock in v1b.

export type PluginSource =
  | { kind: 'local'; path: string }
  | { kind: 'registry'; name: string; version: string | null }
  | { kind: 'git'; url: string }
  | { kind: 'tarball'; url: string }

const GIT_PREFIXES = ['git+', 'git@', 'github:', 'gitlab:', 'bitbucket:']

function looksLikePath(input: string): boolean {
  return (
    input.startsWith('/') ||
    input.startsWith('./') ||
    input.startsWith('../') ||
    input.startsWith('~') ||
    /^[A-Za-z]:[\\/]/.test(input)
  )
}

function looksLikeGit(input: string): boolean {
  return GIT_PREFIXES.some((p) => input.startsWith(p)) || /\.git(#.+)?$/.test(input)
}

function looksLikeTarball(input: string): boolean {
  return /\.(tgz|tar\.gz)$/.test(input.split('?')[0])
}

// Split a registry spec `name@version` / `@scope/name@version` into parts.
function parseRegistrySpec(input: string): { name: string; version: string | null } {
  const at = input.lastIndexOf('@')
  // A leading '@' is a scope, not a version separator.
  if (at > 0) {
    return { name: input.slice(0, at), version: input.slice(at + 1) || null }
  }
  return { name: input, version: null }
}

export function parseInstallSource(rawInput: string): PluginSource | null {
  const input = rawInput.trim()
  if (input.length === 0) {
    return null
  }
  if (looksLikePath(input)) {
    return { kind: 'local', path: input }
  }
  if (looksLikeTarball(input)) {
    return { kind: 'tarball', url: input }
  }
  if (looksLikeGit(input)) {
    return { kind: 'git', url: input }
  }
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return { kind: 'tarball', url: input }
  }
  const spec = parseRegistrySpec(input)
  return { kind: 'registry', name: spec.name, version: spec.version }
}
