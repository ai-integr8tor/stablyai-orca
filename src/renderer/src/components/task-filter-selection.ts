// Why: every closeable task filter treats an empty selection as "all", so
// stale keys from a previous fetch must be dropped rather than silently
// filtering everything out.
export function reconcileTaskFilterSelection(
  validKeys: ReadonlySet<string>,
  selection: ReadonlySet<string>
): ReadonlySet<string> {
  if (selection.size === 0) {
    return selection
  }
  const next = [...selection].filter((key) => validKeys.has(key))
  return next.length === selection.size ? selection : new Set(next)
}

export function summarizeFilterSelection(
  selectedNames: readonly string[],
  pluralLabel: (count: number) => string
): string {
  return selectedNames.length === 1 ? selectedNames[0] : pluralLabel(selectedNames.length)
}
