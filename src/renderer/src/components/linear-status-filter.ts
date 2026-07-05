import type { LinearIssue } from '../../../shared/types'
import { reconcileTaskFilterSelection } from '@/components/task-filter-selection'

export type LinearStatusOption = {
  name: string
  color: string
  type: string
}

// Why: mirrors Linear's own workflow ordering so the picker reads
// triage -> backlog -> todo -> started -> done -> canceled.
const STATE_TYPE_ORDER = ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled']

function stateTypeRank(type: string): number {
  const index = STATE_TYPE_ORDER.indexOf(type)
  return index === -1 ? STATE_TYPE_ORDER.length : index
}

// Why: status options come from fetched issue rows (like assignees/labels),
// deduped by state name because that's what the STATUS column displays.
export function collectLinearStatusOptions(issues: LinearIssue[]): LinearStatusOption[] {
  const byName = new Map<string, LinearStatusOption>()
  for (const issue of issues) {
    if (!byName.has(issue.state.name)) {
      byName.set(issue.state.name, {
        name: issue.state.name,
        color: issue.state.color,
        type: issue.state.type
      })
    }
  }
  return [...byName.values()].sort(
    (a, b) => stateTypeRank(a.type) - stateTypeRank(b.type) || a.name.localeCompare(b.name)
  )
}

export function issueMatchesLinearStatusSelection(
  issue: LinearIssue,
  selection: ReadonlySet<string>
): boolean {
  if (selection.size === 0) {
    return true
  }
  return selection.has(issue.state.name)
}

export function reconcileLinearStatusSelection(
  options: readonly LinearStatusOption[],
  selection: ReadonlySet<string>
): ReadonlySet<string> {
  return reconcileTaskFilterSelection(new Set(options.map((option) => option.name)), selection)
}
