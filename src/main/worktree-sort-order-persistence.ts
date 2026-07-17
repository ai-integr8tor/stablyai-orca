import type { WorktreeMeta } from '../shared/types'

type WorktreeSortOrderReader = {
  getWorktreeMeta(worktreeId: string): WorktreeMeta | undefined
  setWorktreeMeta(worktreeId: string, meta: Partial<WorktreeMeta>): WorktreeMeta
}

function worktreeSortOrderNeedsPersistence(
  store: WorktreeSortOrderReader,
  orderedIds: readonly string[]
): boolean {
  let previousSortOrder = Number.POSITIVE_INFINITY
  const seen = new Set<string>()
  for (const worktreeId of orderedIds) {
    if (seen.has(worktreeId)) {
      return true
    }
    seen.add(worktreeId)
    const sortOrder = store.getWorktreeMeta(worktreeId)?.sortOrder
    // Why: persisted ranks are strictly descending. Missing, invalid, or tied
    // ranks cannot reliably restore the renderer's requested relative order.
    if (
      typeof sortOrder !== 'number' ||
      !Number.isFinite(sortOrder) ||
      sortOrder >= previousSortOrder
    ) {
      return true
    }
    previousSortOrder = sortOrder
  }
  return false
}

/** Persists a changed worktree order and returns the number of updated entries. */
export function persistWorktreeSortOrder(
  store: WorktreeSortOrderReader,
  orderedIds: readonly string[],
  now = Date.now()
): number {
  if (!worktreeSortOrderNeedsPersistence(store, orderedIds)) {
    return 0
  }
  for (let index = 0; index < orderedIds.length; index++) {
    // Descending timestamps make the first requested item win on cold start.
    store.setWorktreeMeta(orderedIds[index]!, { sortOrder: now - index * 1000 })
  }
  return orderedIds.length
}
