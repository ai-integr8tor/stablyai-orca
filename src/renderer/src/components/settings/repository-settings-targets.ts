import type { SourceControlActionId } from '../../../../shared/source-control-ai-actions'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { getRepositorySettingsSectionIdForHost } from '@/lib/repository-settings-section-id'

function getRepositorySettingsTargetPrefix(repoId: string, hostId?: ExecutionHostId): string {
  return hostId ? getRepositorySettingsSectionIdForHost(repoId, hostId) : `repo-${repoId}`
}

export function getRepositoryLocalCommandsSectionId(
  repoId: string,
  hostId?: ExecutionHostId
): string {
  return `${getRepositorySettingsTargetPrefix(repoId, hostId)}-local-commands`
}

export function getRepositoryIconSectionId(repoId: string, hostId?: ExecutionHostId): string {
  return `${getRepositorySettingsTargetPrefix(repoId, hostId)}-icon`
}

export function getRepositorySourceControlAiSectionId(
  repoId: string,
  hostId?: ExecutionHostId
): string {
  return `${getRepositorySettingsTargetPrefix(repoId, hostId)}-source-control-ai`
}

export function getRepositorySourceControlAiActionRecipeSectionId(
  repoId: string,
  actionId: SourceControlActionId,
  hostId?: ExecutionHostId
): string {
  return `${getRepositorySettingsTargetPrefix(repoId, hostId)}-source-control-ai-${actionId}`
}
