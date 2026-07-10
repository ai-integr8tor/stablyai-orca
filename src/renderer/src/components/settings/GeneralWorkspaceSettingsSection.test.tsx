// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { GeneralWorkspaceSettingsSection } from './GeneralWorkspaceSettingsSection'

vi.mock('./WorkspaceDirectorySetting', () => ({
  WorkspaceDirectorySetting: () => null
}))

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

function renderSection(
  defaultWorktreeLocationMode: 'sibling' | 'nested',
  updateSettings = vi.fn()
): typeof updateSettings {
  act(() => {
    root.render(
      React.createElement(GeneralWorkspaceSettingsSection, {
        settings: {
          ...getDefaultSettings('/tmp'),
          defaultWorktreeLocationMode
        },
        updateSettings
      })
    )
  })
  return updateSettings
}

function getGlobalNestedSwitch(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Store worktrees inside each project by default"]'
  )
  if (!button) {
    throw new Error('global nested worktree switch not found')
  }
  return button
}

describe('GeneralWorkspaceSettingsSection default worktree location', () => {
  it('renders the global nested worktree default as off for sibling mode', () => {
    renderSection('sibling')

    expect(getGlobalNestedSwitch().getAttribute('aria-checked')).toBe('false')
  })

  it('persists nested when the global default switch is enabled', () => {
    const updateSettings = renderSection('sibling')

    act(() => {
      getGlobalNestedSwitch().click()
    })

    expect(updateSettings).toHaveBeenCalledWith({ defaultWorktreeLocationMode: 'nested' })
  })

  it('persists sibling when the global default switch is disabled', () => {
    const updateSettings = renderSection('nested')

    act(() => {
      getGlobalNestedSwitch().click()
    })

    expect(updateSettings).toHaveBeenCalledWith({ defaultWorktreeLocationMode: 'sibling' })
  })
})
