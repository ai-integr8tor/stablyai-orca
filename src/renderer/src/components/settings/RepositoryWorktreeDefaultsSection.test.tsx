// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/types'
import { RepositoryWorktreeDefaultsSection } from './RepositoryWorktreeDefaultsSection'

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: { settingsSearchQuery: string }) => unknown) =>
    selector({ settingsSearchQuery: '' })
}))

vi.mock('./BaseRefPicker', () => ({
  BaseRefPicker: () => null
}))

const BASE_REPO: Repo = {
  id: 'repo-1',
  path: '/home/user/project',
  displayName: 'My Project',
  badgeColor: '#000000',
  addedAt: 0
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

function render(repo: Repo, updateRepo: (repoId: string, updates: object) => void): void {
  act(() => {
    root.render(
      React.createElement(RepositoryWorktreeDefaultsSection, {
        repo,
        settings: { workspaceDir: '/global/workspaces', defaultWorktreeLocationMode: 'sibling' },
        updateRepo,
        forceVisible: true
      })
    )
  })
}

function getWorktreePathInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input')
  if (!input) {
    throw new Error('worktree path input not found')
  }
  return input
}

function setNativeValue(input: HTMLInputElement, text: string): void {
  // Why: React reads controlled-input changes via the native value setter;
  // assigning input.value directly is swallowed by React's value tracking.
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setValue?.call(input, text)
}

function typeText(input: HTMLInputElement, text: string): void {
  act(() => {
    setNativeValue(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function blurInput(input: HTMLInputElement): void {
  // Why: React delegates onBlur via focusout (which bubbles) not blur (which
  // doesn't), so dispatching focusout is required to trigger the React handler.
  act(() => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}

describe('RepositoryWorktreeDefaultsSection — worktree path', () => {
  it('does not call updateRepo while the user is typing', () => {
    const updateRepo = vi.fn()
    render(BASE_REPO, updateRepo)

    const input = getWorktreePathInput()
    typeText(input, './w')
    typeText(input, './wo')
    typeText(input, './wor')
    typeText(input, './worktree')

    expect(updateRepo).not.toHaveBeenCalled()
  })

  it('calls updateRepo with the final value on blur', () => {
    const updateRepo = vi.fn()
    render(BASE_REPO, updateRepo)

    const input = getWorktreePathInput()
    typeText(input, '  ./worktree  ')
    blurInput(input)

    expect(updateRepo).toHaveBeenCalledTimes(1)
    expect(updateRepo).toHaveBeenCalledWith('repo-1', { worktreeBasePath: './worktree' })
  })

  it('does not call updateRepo when the normalized value is unchanged on blur', () => {
    const updateRepo = vi.fn()
    render({ ...BASE_REPO, worktreeBasePath: './worktree' }, updateRepo)

    const input = getWorktreePathInput()
    typeText(input, '  ./worktree  ')
    blurInput(input)

    expect(updateRepo).not.toHaveBeenCalled()
  })

  it('calls updateRepo with undefined when the field is cleared', () => {
    const updateRepo = vi.fn()
    render({ ...BASE_REPO, worktreeBasePath: '../worktrees' }, updateRepo)

    const input = getWorktreePathInput()
    typeText(input, '')
    blurInput(input)

    expect(updateRepo).toHaveBeenCalledWith('repo-1', { worktreeBasePath: undefined })
  })

  it('calls updateRepo with undefined when the value is whitespace-only', () => {
    const updateRepo = vi.fn()
    render({ ...BASE_REPO, worktreeBasePath: '../worktrees' }, updateRepo)

    const input = getWorktreePathInput()
    typeText(input, '   ')
    blurInput(input)

    expect(updateRepo).toHaveBeenCalledWith('repo-1', { worktreeBasePath: undefined })
  })
})

describe('RepositoryWorktreeDefaultsSection — worktree location mode', () => {
  it('shows a following-global summary when the repo has no explicit mode', () => {
    const updateRepo = vi.fn()
    render(BASE_REPO, updateRepo)

    expect(container.textContent).toContain('Following global default (sibling)')
  })

  it('turning on the effective toggle sets an explicit nested override', () => {
    const updateRepo = vi.fn()
    render(BASE_REPO, updateRepo)

    const switchButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Store worktrees inside this project"]'
    )
    if (!switchButton) {
      throw new Error('nested worktree switch not found')
    }
    act(() => {
      switchButton.click()
    })

    expect(updateRepo).toHaveBeenCalledWith('repo-1', { worktreeLocationMode: 'nested' })
  })

  it('can clear an explicit mode back to the global default', () => {
    const updateRepo = vi.fn()
    render({ ...BASE_REPO, worktreeLocationMode: 'nested' }, updateRepo)

    const globalButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'Global'
    )
    if (!globalButton) {
      throw new Error('global segmented control button not found')
    }
    act(() => {
      globalButton.click()
    })

    expect(updateRepo).toHaveBeenCalledWith('repo-1', { worktreeLocationMode: undefined })
  })
})
