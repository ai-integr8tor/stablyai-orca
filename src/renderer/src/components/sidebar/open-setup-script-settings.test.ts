import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/types'
import { findSetupScriptSettingsRepo, openSetupScriptSettings } from './open-setup-script-settings'

const localRepo: Repo = {
  id: 'shared-repo',
  path: 'local-project',
  displayName: 'Project',
  badgeColor: '#000',
  addedAt: 1,
  executionHostId: 'local'
}

const remoteRepo: Repo = {
  ...localRepo,
  path: 'remote-project',
  addedAt: 2,
  executionHostId: 'runtime:home-mac'
}

describe('setup script Settings navigation', () => {
  it('resolves the saved host even when a same-id repository is listed first', () => {
    expect(
      findSetupScriptSettingsRepo([localRepo, remoteRepo], remoteRepo.id, 'runtime:home-mac')
    ).toBe(remoteRepo)
  })

  it('opens the host-qualified local commands target', () => {
    const setSettingsSearchQuery = vi.fn()
    const openSettingsTarget = vi.fn()
    const openSettingsPage = vi.fn()

    openSetupScriptSettings({
      repoId: remoteRepo.id,
      repoHostId: 'runtime:home-mac',
      setSettingsSearchQuery,
      openSettingsTarget,
      openSettingsPage
    })

    expect(setSettingsSearchQuery).toHaveBeenCalledWith('')
    expect(openSettingsTarget).toHaveBeenCalledWith({
      pane: 'repo',
      repoId: remoteRepo.id,
      repoHostId: 'runtime:home-mac',
      sectionId: 'repo-runtime%3Ahome-mac:shared-repo-local-commands'
    })
    expect(openSettingsPage).toHaveBeenCalledOnce()
  })
})
