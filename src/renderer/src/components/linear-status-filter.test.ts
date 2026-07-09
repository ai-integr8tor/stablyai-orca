import { describe, expect, it } from 'vitest'
import type { LinearIssue } from '../../../shared/types'
import {
  collectLinearStatusOptions,
  issueMatchesLinearStatusSelection,
  reconcileLinearStatusSelection
} from './linear-status-filter'

function issue(id: string, state: { name: string; type: string; color?: string }): LinearIssue {
  return {
    id,
    identifier: id.toUpperCase(),
    title: `Issue ${id}`,
    url: `https://linear.app/org/issue/${id}`,
    state: { name: state.name, type: state.type, color: state.color ?? '#888888' },
    team: { id: 'team-1', name: 'Engineering', key: 'ENG' },
    labels: [],
    labelIds: [],
    priority: 0,
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('collectLinearStatusOptions', () => {
  it('dedupes by state name and orders by workflow type', () => {
    const options = collectLinearStatusOptions([
      issue('a', { name: 'Done', type: 'completed' }),
      issue('b', { name: 'In Progress', type: 'started' }),
      issue('c', { name: 'Todo', type: 'unstarted' }),
      issue('d', { name: 'Done', type: 'completed' })
    ])
    expect(options.map((o) => o.name)).toEqual(['Todo', 'In Progress', 'Done'])
  })

  it('sorts same-type states alphabetically and unknown types last', () => {
    const options = collectLinearStatusOptions([
      issue('a', { name: 'Weird', type: 'custom' }),
      issue('b', { name: 'In Review', type: 'started' }),
      issue('c', { name: 'In Progress', type: 'started' })
    ])
    expect(options.map((o) => o.name)).toEqual(['In Progress', 'In Review', 'Weird'])
  })
})

describe('issueMatchesLinearStatusSelection', () => {
  it('matches everything when selection is empty', () => {
    expect(
      issueMatchesLinearStatusSelection(issue('a', { name: 'Done', type: 'completed' }), new Set())
    ).toBe(true)
  })

  it('matches by state name', () => {
    const selection = new Set(['Done'])
    expect(
      issueMatchesLinearStatusSelection(issue('a', { name: 'Done', type: 'completed' }), selection)
    ).toBe(true)
    expect(
      issueMatchesLinearStatusSelection(issue('b', { name: 'Todo', type: 'unstarted' }), selection)
    ).toBe(false)
  })
})

describe('reconcileLinearStatusSelection', () => {
  const options = collectLinearStatusOptions([issue('a', { name: 'Done', type: 'completed' })])

  it('keeps valid selections', () => {
    const selection = new Set(['Done'])
    expect(reconcileLinearStatusSelection(options, selection)).toBe(selection)
  })

  it('drops stale names', () => {
    const next = reconcileLinearStatusSelection(options, new Set(['Done', 'Gone']))
    expect([...next]).toEqual(['Done'])
  })

  it('returns the same empty selection unchanged', () => {
    const selection = new Set<string>()
    expect(reconcileLinearStatusSelection(options, selection)).toBe(selection)
  })
})
