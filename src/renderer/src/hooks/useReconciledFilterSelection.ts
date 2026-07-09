import { useEffect, useState } from 'react'

// Why: filter options are derived from fetched rows, so ids selected under a
// previous fetch must be reconciled away once the options change (falling
// back to "all" instead of an always-empty list).
export function useReconciledFilterSelection<O>(
  options: O[],
  reconcile: (options: O[], selection: ReadonlySet<string>) => ReadonlySet<string>
): [ReadonlySet<string>, (next: ReadonlySet<string>) => void] {
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set())
  useEffect(() => {
    setSelection((current) => reconcile(options, current))
  }, [options, reconcile])
  return [selection, setSelection]
}
