import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../shared/types'
import {
  findRepoForSettingsSection,
  getRepositorySettingsSectionId,
  parseRepositorySettingsSectionId
} from './repository-settings-section-id'

const localRepo: Repo = {
  id: 'github:owner/project',
  path: '/local/project',
  displayName: 'Project',
  badgeColor: '#000',
  addedAt: 1,
  executionHostId: 'local'
}

const remoteRepo: Repo = {
  ...localRepo,
  path: '/remote/project',
  addedAt: 2,
  executionHostId: 'runtime:home mac'
}

describe('repository Settings section identity', () => {
  it('keeps same-id repositories on different hosts in distinct sections', () => {
    const localSectionId = getRepositorySettingsSectionId(localRepo)
    const remoteSectionId = getRepositorySettingsSectionId(remoteRepo)

    expect(localSectionId).toBe('repo-github:owner/project')
    expect(remoteSectionId).toBe('repo-runtime%3Ahome%20mac:github%3Aowner%2Fproject')
    expect(remoteSectionId).not.toBe(localSectionId)
  })

  it('round-trips a remote section identity', () => {
    expect(parseRepositorySettingsSectionId(getRepositorySettingsSectionId(remoteRepo))).toEqual({
      repoId: remoteRepo.id,
      hostId: 'runtime:home mac'
    })
  })

  it('resolves legacy bare sections to the local row when a remote duplicate exists', () => {
    expect(findRepoForSettingsSection([remoteRepo, localRepo], `repo-${localRepo.id}`)).toBe(
      localRepo
    )
  })

  it('resolves host-qualified sections to the matching remote row', () => {
    expect(
      findRepoForSettingsSection(
        [localRepo, remoteRepo],
        getRepositorySettingsSectionId(remoteRepo)
      )
    ).toBe(remoteRepo)
  })
})
