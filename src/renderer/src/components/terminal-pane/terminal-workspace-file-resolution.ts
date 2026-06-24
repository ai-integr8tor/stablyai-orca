import { joinAbsolutePath } from '@/lib/terminal-path-normalization'

type WorkspaceFileIndexEntry = { fetchedAt: number; basenameToPaths: Map<string, string[]> }

type ListWorkspaceFiles = (args: { rootPath: string; connectionId?: string }) => Promise<string[]>

// Why: the link provider runs per hovered line, so cache the worktree's file
// list (the same listing Quick Open uses) and refresh it on a short TTL rather
// than re-listing on every lookup.
const WORKSPACE_FILE_INDEX_TTL_MS = 15_000
const workspaceFileIndexCache = new Map<string, WorkspaceFileIndexEntry>()

function basenameOf(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  return slash === -1 ? normalized : normalized.slice(slash + 1)
}

function buildBasenameIndex(files: readonly string[]): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const relativePath of files) {
    const basename = basenameOf(relativePath)
    const existing = index.get(basename)
    if (existing) {
      existing.push(relativePath)
    } else {
      index.set(basename, [relativePath])
    }
  }
  return index
}

export type ResolveWorkspaceFileArgs = {
  basename: string
  worktreePath: string
  connectionId?: string | null
  /** Test seams. */
  now?: number
  listFiles?: ListWorkspaceFiles
}

/**
 * Resolve a bare filename to a file nested elsewhere in the worktree.
 *
 * Why (issue #5024): agent output frequently references a repo file by bare
 * name (e.g. `TerminalContextMenu.test.tsx`), which does not exist at the
 * terminal's cwd root, so the link provider's cwd-relative existence check
 * misses it. Falling back to the worktree's own file list makes those mentions
 * clickable. Only a UNIQUE basename match is returned — multiple files sharing
 * a name are ambiguous and left unlinked rather than guessed.
 */
export async function resolveWorkspaceFileByBasename(
  args: ResolveWorkspaceFileArgs
): Promise<string | null> {
  const { basename, worktreePath } = args
  if (!basename || !worktreePath) {
    return null
  }
  const connectionId = args.connectionId ?? undefined
  const now = args.now ?? Date.now()
  const cacheKey = `${connectionId ?? 'local'}::${worktreePath}`

  let entry = workspaceFileIndexCache.get(cacheKey)
  if (!entry || now - entry.fetchedAt > WORKSPACE_FILE_INDEX_TTL_MS) {
    const list = args.listFiles ?? ((listArgs) => window.api.fs.listFiles(listArgs))
    let files: string[]
    try {
      files = await list({ rootPath: worktreePath, ...(connectionId ? { connectionId } : {}) })
    } catch {
      // Best-effort: a failed listing must not break link detection.
      return null
    }
    entry = { fetchedAt: now, basenameToPaths: buildBasenameIndex(files) }
    workspaceFileIndexCache.set(cacheKey, entry)
  }

  const matches = entry.basenameToPaths.get(basename)
  if (!matches || matches.length !== 1) {
    return null
  }
  return joinAbsolutePath(worktreePath, matches[0])
}

export function __resetWorkspaceFileIndexCacheForTest(): void {
  workspaceFileIndexCache.clear()
}
