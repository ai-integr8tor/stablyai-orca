import type { LinearIssue } from '../../../shared/types'
import { translate } from '@/i18n/i18n'
import {
  reconcileTaskFilterSelection,
  summarizeFilterSelection
} from '@/components/task-filter-selection'

// Why: issues without an assignee need a stable selectable id that can never
// collide with a real Linear user UUID.
export const UNASSIGNED_LINEAR_ASSIGNEE_ID = '__unassigned__'

export type LinearAssigneeOption = {
  id: string
  displayName: string
  avatarUrl?: string
}

export function collectLinearAssigneeOptions(issues: LinearIssue[]): LinearAssigneeOption[] {
  const seen = new Set<string>()
  const options: LinearAssigneeOption[] = []
  let hasUnassigned = false
  for (const issue of issues) {
    if (!issue.assignee) {
      hasUnassigned = true
      continue
    }
    if (seen.has(issue.assignee.id)) {
      continue
    }
    seen.add(issue.assignee.id)
    options.push({
      id: issue.assignee.id,
      displayName: issue.assignee.displayName,
      avatarUrl: issue.assignee.avatarUrl
    })
  }
  options.sort((a, b) => a.displayName.localeCompare(b.displayName))
  if (hasUnassigned) {
    options.push({
      id: UNASSIGNED_LINEAR_ASSIGNEE_ID,
      displayName: translate('auto.components.linear.assignee.filter.9adaa5d0f1', 'Unassigned')
    })
  }
  return options
}

export function issueMatchesLinearAssigneeSelection(
  issue: LinearIssue,
  selection: ReadonlySet<string>
): boolean {
  if (selection.size === 0) {
    return true
  }
  return selection.has(issue.assignee?.id ?? UNASSIGNED_LINEAR_ASSIGNEE_ID)
}

export function reconcileLinearAssigneeSelection(
  options: LinearAssigneeOption[],
  selection: ReadonlySet<string>
): ReadonlySet<string> {
  return reconcileTaskFilterSelection(new Set(options.map((option) => option.id)), selection)
}

export function getLinearAssigneeTriggerLabel(
  options: LinearAssigneeOption[],
  selection: ReadonlySet<string>
): string {
  if (selection.size === 0) {
    return translate('auto.components.linear.assignee.filter.1c0424898b', 'Assignee')
  }
  const selected = options.filter((option) => selection.has(option.id))
  return summarizeFilterSelection(
    selected.map((option) => option.displayName),
    (count) =>
      translate('auto.components.linear.assignee.filter.acb9d5a41c', '{{value0}} assignees', {
        value0: count
      })
  )
}
