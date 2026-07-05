import type { LinearIssue } from '../../../shared/types'
import { reconcileTaskFilterSelection } from '@/components/task-filter-selection'

// Why: label options are derived from fetched issue rows (no dedicated list
// endpoint per workspace), matching how assignee options are sourced.
export function collectLinearLabelOptions(issues: LinearIssue[]): string[] {
  const seen = new Set<string>()
  for (const issue of issues) {
    for (const label of issue.labels) {
      seen.add(label)
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}

// Why: OR semantics across selected labels, consistent with the assignee and
// team filters in this toolbar (an empty selection means "all").
export function issueMatchesLinearLabelSelection(
  issue: LinearIssue,
  selection: ReadonlySet<string>
): boolean {
  if (selection.size === 0) {
    return true
  }
  return issue.labels.some((label) => selection.has(label))
}

export function reconcileLinearLabelSelection(
  options: readonly string[],
  selection: ReadonlySet<string>
): ReadonlySet<string> {
  return reconcileTaskFilterSelection(new Set(options), selection)
}
