import {
  getRuntimePathBasename,
  isWindowsAbsolutePathLike,
  normalizeRuntimePathForComparison,
  normalizeRuntimePathSeparators,
  relativePathInsideRoot
} from './cross-platform-path'
import { isExplicitlyImportedExternalWorktreePath } from './external-worktree-inbox'
import type {
  DetectedWorktree,
  ExternalWorktreeVisibility,
  GlobalSettings,
  OrcaWorkspaceLayout,
  Repo,
  Worktree,
  WorktreeMeta,
  WorktreeOwnership
} from './types'
export { buildKnownOrcaWorkspaceLayouts } from './worktree-layouts'

export const EXTERNAL_WORKTREE_VISIBILITY_ROLLOUT_AT = Date.UTC(2026, 4, 23)

export function isLegacyRepoForExternalWorktreeVisibility(repo: Repo): boolean {
  if (typeof repo.externalWorktreeVisibilityLegacy === 'boolean') {
    return repo.externalWorktreeVisibilityLegacy
  }
  if (repo.externalWorktreeVisibility === undefined) {
    return true
  }
  if (!Number.isFinite(repo.addedAt)) {
    return true
  }
  return repo.addedAt < EXTERNAL_WORKTREE_VISIBILITY_ROLLOUT_AT
}

export function effectiveExternalWorktreeVisibility(
  repo: Pick<Repo, 'externalWorktreeVisibility'>,
  isLegacyRepoForVisibility: boolean
): ExternalWorktreeVisibility {
  if (repo.externalWorktreeVisibility) {
    return repo.externalWorktreeVisibility
  }
  return isLegacyRepoForVisibility ? 'show' : 'hide'
}

export function classifyWorktreeOwnership(args: {
  repo: Repo
  worktree: Pick<Worktree, 'path' | 'isMainWorktree'>
  meta?: WorktreeMeta
  settings: Pick<GlobalSettings, 'workspaceDir' | 'nestWorkspaces' | 'workspaceDirHistory'>
  knownOrcaLayouts: OrcaWorkspaceLayout[]
}): WorktreeOwnership {
  if (hasStrongOrcaMetadata(args.meta)) {
    return 'orca-managed'
  }

  if (
    args.knownOrcaLayouts.some((layout) => layout.worktreeLocationMode === 'nested') &&
    matchesStrongOrcaCreatePath(args.worktree.path, args.knownOrcaLayouts, args.repo)
  ) {
    return 'orca-managed'
  }

  if (isUnderFlatOrUntrustedOrcaRoot(args.worktree.path, args.knownOrcaLayouts)) {
    return 'unknown-legacy'
  }

  if (canClassifyAsExternal(args.worktree.path, args.knownOrcaLayouts)) {
    // Why: a plain `git worktree add` can target Orca's nested workspace
    // folder. Only metadata proves Orca created it.
    return 'external'
  }

  return 'unknown-legacy'
}

export function toDetectedWorktree(args: {
  repo: Repo
  worktree: Worktree
  meta?: WorktreeMeta
  settings: Pick<GlobalSettings, 'workspaceDir' | 'nestWorkspaces' | 'workspaceDirHistory'>
  knownOrcaLayouts: OrcaWorkspaceLayout[]
  isLegacyRepoForVisibility?: boolean
}): DetectedWorktree {
  const ownership = classifyWorktreeOwnership(args)
  const selectedCheckout = areRuntimePathsEqual(args.worktree.path, args.repo.path)
  const isLegacyRepoForVisibility =
    args.isLegacyRepoForVisibility ?? isLegacyRepoForExternalWorktreeVisibility(args.repo)
  const visible = shouldShowWorktree({
    worktree: args.worktree,
    ownership,
    repo: args.repo,
    isLegacyRepoForVisibility,
    isSelectedCheckout: selectedCheckout,
    importedExternalWorktreePaths: args.repo.importedExternalWorktreePaths
  })

  return {
    ...args.worktree,
    ownership,
    selectedCheckout,
    visible
  }
}

export function shouldShowWorktree(args: {
  worktree: Pick<Worktree, 'path'>
  ownership: WorktreeOwnership
  repo: Repo
  isLegacyRepoForVisibility: boolean
  isSelectedCheckout: boolean
  importedExternalWorktreePaths?: readonly string[] | undefined
}): boolean {
  if (args.isSelectedCheckout) {
    return true
  }
  if (args.ownership === 'orca-managed') {
    return true
  }
  if (
    isExplicitlyImportedExternalWorktreePath(args.worktree.path, {
      importedExternalWorktreePaths: args.importedExternalWorktreePaths
    })
  ) {
    return true
  }
  if (args.ownership === 'unknown-legacy' && args.isLegacyRepoForVisibility) {
    return true
  }
  return effectiveExternalWorktreeVisibility(args.repo, args.isLegacyRepoForVisibility) === 'show'
}

export function areRuntimePathsEqual(leftPath: string, rightPath: string): boolean {
  return (
    normalizeRuntimePathForComparison(leftPath) === normalizeRuntimePathForComparison(rightPath)
  )
}

function hasStrongOrcaMetadata(meta: WorktreeMeta | undefined): boolean {
  return Boolean(
    meta?.orcaCreatedAt ||
    meta?.orcaCreationWorkspaceLayout ||
    meta?.createdAt ||
    meta?.createdWithAgent ||
    meta?.pushTarget ||
    meta?.sparseBaseRef ||
    meta?.sparsePresetId ||
    meta?.preserveBranchOnDelete
  )
}

export function matchesStrongOrcaCreatePath(
  worktreePath: string,
  knownOrcaLayouts: readonly OrcaWorkspaceLayout[],
  repo: Pick<Repo, 'path'>
): boolean {
  const repoName = getRuntimePathBasename(repo.path).replace(/\.git$/i, '')
  if (!repoName) {
    return false
  }
  for (const layout of knownOrcaLayouts) {
    if (layout.worktreeLocationMode === 'nested') {
      const relative = relativePathInsideRoot(layout.path, worktreePath)
      // Why: only a positive match should short-circuit. A mismatch must fall
      // through so a later layout for the same root can still match, instead of
      // misclassifying an Orca-managed worktree as non-Orca.
      if (relative !== null && splitNormalizedPath(relative).length === 1) {
        return true
      }
      continue
    }
    if (!layout.nestWorkspaces) {
      continue
    }
    const relative = relativePathInsideRoot(layout.path, worktreePath)
    if (relative === null) {
      continue
    }
    const segments = splitNormalizedPath(relative)
    const caseInsensitive =
      isWindowsAbsolutePathLike(layout.path) || isWindowsAbsolutePathLike(worktreePath)
    if (
      segments.length === 2 &&
      normalizePathSegment(segments[0], caseInsensitive) ===
        normalizePathSegment(repoName, caseInsensitive) &&
      segments[1].length > 0
    ) {
      return true
    }
  }
  return false
}

function isUnderFlatOrUntrustedOrcaRoot(
  worktreePath: string,
  knownOrcaLayouts: OrcaWorkspaceLayout[]
): boolean {
  for (const layout of knownOrcaLayouts) {
    const relative = relativePathInsideRoot(layout.path, worktreePath)
    if (relative === null) {
      continue
    }
    if (!layout.nestWorkspaces) {
      return true
    }
  }
  return false
}

function canClassifyAsExternal(
  worktreePath: string,
  knownOrcaLayouts: OrcaWorkspaceLayout[]
): boolean {
  if (knownOrcaLayouts.length === 0) {
    return false
  }
  for (const layout of knownOrcaLayouts) {
    const relative = relativePathInsideRoot(layout.path, worktreePath)
    if (relative === null) {
      continue
    }
    return layout.nestWorkspaces
  }
  return true
}

function splitNormalizedPath(value: string): string[] {
  return normalizeRuntimePathSeparators(value).split('/').filter(Boolean)
}

function normalizePathSegment(value: string, caseInsensitive: boolean): string {
  const normalized = normalizeRuntimePathSeparators(value)
  return caseInsensitive ? normalized.toLowerCase() : normalized
}
