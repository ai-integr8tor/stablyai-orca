import { describe, expect, it } from 'vitest'
import type { LinearIssue } from '../../../shared/types'
import {
  collectLinearLabelOptions,
  issueMatchesLinearLabelSelection,
  reconcileLinearLabelSelection
} from './linear-label-filter'

function issue(id: string, labels: string[]): LinearIssue {
  return {
    id,
    identifier: id.toUpperCase(),
    title: `Issue ${id}`,
    url: `https://linear.app/org/issue/${id}`,
    state: { name: 'Todo', type: 'unstarted', color: '#888888' },
    team: { id: 'team-1', name: 'Engineering', key: 'ENG' },
    labels,
    labelIds: [],
    priority: 0,
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('collectLinearLabelOptions', () => {
  it('dedupes and sorts labels across issues', () => {
    const options = collectLinearLabelOptions([
      issue('a', ['bug', 'frontend']),
      issue('b', ['backend', 'bug']),
      issue('c', [])
    ])
    expect(options).toEqual(['backend', 'bug', 'frontend'])
  })

  it('returns empty for no labels', () => {
    expect(collectLinearLabelOptions([issue('a', [])])).toEqual([])
  })
})

describe('issueMatchesLinearLabelSelection', () => {
  it('matches everything when selection is empty', () => {
    expect(issueMatchesLinearLabelSelection(issue('a', []), new Set())).toBe(true)
  })

  it('matches when any label is selected (OR semantics)', () => {
    const selection = new Set(['bug'])
    expect(issueMatchesLinearLabelSelection(issue('a', ['bug', 'frontend']), selection)).toBe(true)
    expect(issueMatchesLinearLabelSelection(issue('b', ['backend']), selection)).toBe(false)
  })

  it('does not match unlabeled issues when a label is selected', () => {
    expect(issueMatchesLinearLabelSelection(issue('a', []), new Set(['bug']))).toBe(false)
  })
})

describe('reconcileLinearLabelSelection', () => {
  it('keeps selection when all labels still exist', () => {
    const selection = new Set(['bug'])
    expect(reconcileLinearLabelSelection(['bug', 'frontend'], selection)).toBe(selection)
  })

  it('drops labels that disappeared from options', () => {
    const next = reconcileLinearLabelSelection(['frontend'], new Set(['bug', 'frontend']))
    expect([...next]).toEqual(['frontend'])
  })

  it('returns the same empty selection unchanged', () => {
    const selection = new Set<string>()
    expect(reconcileLinearLabelSelection([], selection)).toBe(selection)
  })
})
