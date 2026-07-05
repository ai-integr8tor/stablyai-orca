import { describe, expect, it } from 'vitest'
import type { LinearIssue } from '../../../shared/types'
import {
  UNASSIGNED_LINEAR_ASSIGNEE_ID,
  collectLinearAssigneeOptions,
  getLinearAssigneeTriggerLabel,
  issueMatchesLinearAssigneeSelection,
  reconcileLinearAssigneeSelection
} from './linear-assignee-filter'

function issue(id: string, assignee?: { id: string; displayName: string }): LinearIssue {
  return {
    id,
    identifier: id.toUpperCase(),
    title: `Issue ${id}`,
    url: `https://linear.app/org/issue/${id}`,
    state: { name: 'Todo', type: 'unstarted', color: '#888888' },
    team: { id: 'team-1', name: 'Engineering', key: 'ENG' },
    labels: [],
    labelIds: [],
    assignee,
    priority: 0,
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

const ada = { id: 'user-ada', displayName: 'Ada' }
const grace = { id: 'user-grace', displayName: 'Grace' }

describe('collectLinearAssigneeOptions', () => {
  it('dedupes assignees, sorts by name, and appends unassigned last', () => {
    const options = collectLinearAssigneeOptions([
      issue('a', grace),
      issue('b', ada),
      issue('c', grace),
      issue('d')
    ])

    expect(options.map((option) => option.id)).toEqual([
      'user-ada',
      'user-grace',
      UNASSIGNED_LINEAR_ASSIGNEE_ID
    ])
  })

  it('omits the unassigned option when every issue has an assignee', () => {
    const options = collectLinearAssigneeOptions([issue('a', ada)])
    expect(options.map((option) => option.id)).toEqual(['user-ada'])
  })
})

describe('issueMatchesLinearAssigneeSelection', () => {
  it('treats an empty selection as all assignees', () => {
    expect(issueMatchesLinearAssigneeSelection(issue('a', ada), new Set())).toBe(true)
    expect(issueMatchesLinearAssigneeSelection(issue('b'), new Set())).toBe(true)
  })

  it('matches by assignee id', () => {
    expect(issueMatchesLinearAssigneeSelection(issue('a', ada), new Set(['user-ada']))).toBe(true)
    expect(issueMatchesLinearAssigneeSelection(issue('a', grace), new Set(['user-ada']))).toBe(
      false
    )
  })

  it('matches unassigned issues via the unassigned sentinel', () => {
    expect(
      issueMatchesLinearAssigneeSelection(issue('a'), new Set([UNASSIGNED_LINEAR_ASSIGNEE_ID]))
    ).toBe(true)
    expect(
      issueMatchesLinearAssigneeSelection(issue('a', ada), new Set([UNASSIGNED_LINEAR_ASSIGNEE_ID]))
    ).toBe(false)
  })
})

describe('reconcileLinearAssigneeSelection', () => {
  const options = collectLinearAssigneeOptions([issue('a', ada), issue('b')])

  it('keeps an empty selection as-is', () => {
    const selection = new Set<string>()
    expect(reconcileLinearAssigneeSelection(options, selection)).toBe(selection)
  })

  it('keeps selections whose ids are all still present', () => {
    const selection = new Set(['user-ada', UNASSIGNED_LINEAR_ASSIGNEE_ID])
    expect(reconcileLinearAssigneeSelection(options, selection)).toBe(selection)
  })

  it('drops ids that no longer appear in the fetched issues', () => {
    const next = reconcileLinearAssigneeSelection(options, new Set(['user-ada', 'user-grace']))
    expect(Array.from(next)).toEqual(['user-ada'])
  })

  it('falls back to all assignees when every selected id is stale', () => {
    const next = reconcileLinearAssigneeSelection(options, new Set(['user-grace']))
    expect(next.size).toBe(0)
  })
})

describe('getLinearAssigneeTriggerLabel', () => {
  const options = collectLinearAssigneeOptions([issue('a', ada), issue('b', grace), issue('c')])

  it('shows the generic label when nothing is selected', () => {
    expect(getLinearAssigneeTriggerLabel(options, new Set())).toBe('Assignee')
  })

  it('shows the display name for a single selection', () => {
    expect(getLinearAssigneeTriggerLabel(options, new Set(['user-ada']))).toBe('Ada')
  })

  it('shows a count for multiple selections', () => {
    expect(getLinearAssigneeTriggerLabel(options, new Set(['user-ada', 'user-grace']))).toBe(
      '2 assignees'
    )
  })
})
