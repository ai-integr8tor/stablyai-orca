import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo, Worktree } from '../../../../shared/types'
import WorkspaceKanbanCard from './WorkspaceKanbanCard'
import WorktreeCard from './WorktreeCard'

vi.mock('./WorktreeCard', () => ({
  default: vi.fn(() => null),
  getDirectoryName: (folderPath: string): string => {
    const normalized = folderPath.replace(/[\\/]+$/, '')
    const parts = normalized.split(/[\\/]+/)
    return parts.at(-1) || normalized || folderPath
  }
}))

function makeWorktree(): Worktree {
  return {
    id: 'repo-1::/workspaces/orca-feature',
    repoId: 'repo-1',
    displayName: 'same-branch',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    createdAt: 0,
    isMainWorktree: false,
    path: '/workspaces/orca-feature',
    branch: 'same-branch',
    isBare: false,
    isPinned: false,
    isUnread: false
  } as Worktree
}

function makeRepo(path: string): Repo {
  return {
    id: 'repo-1',
    path,
    displayName: 'orca',
    badgeColor: '#737373',
    kind: 'git',
    hostId: 'local'
  } as Repo
}

function renderCard(repoPath: string): void {
  renderToStaticMarkup(
    <WorkspaceKanbanCard
      worktree={makeWorktree()}
      repo={makeRepo(repoPath)}
      isActive={false}
      isSelected={false}
      onActivate={vi.fn()}
      onSelectionGesture={vi.fn(() => false)}
      onContextMenuSelect={vi.fn(() => [])}
    />
  )
}

beforeEach(() => {
  vi.mocked(WorktreeCard).mockClear()
})
describe('WorkspaceKanbanCard project directory label', () => {
  it('forwards the project directory basename from POSIX repo paths', () => {
    renderCard('/Users/me/projects/customer-api')

    expect(vi.mocked(WorktreeCard).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ projectDirectoryName: 'customer-api' })
    )
  })

  it('forwards the project directory basename from Windows repo paths', () => {
    renderCard('C:\\Users\\me\\projects\\customer-app')

    expect(vi.mocked(WorktreeCard).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ projectDirectoryName: 'customer-app' })
    )
  })
})
