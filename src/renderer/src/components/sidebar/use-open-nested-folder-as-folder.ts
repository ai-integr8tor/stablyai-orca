import { useCallback } from 'react'
import { track } from '@/lib/telemetry'
import {
  buildNestedRepoImportActionTelemetry,
  type NestedRepoTelemetryRuntimeKind
} from '../../../../shared/nested-repo-telemetry'
import type { NestedRepoScanResult } from '../../../../shared/types'

/**
 * Wires the nested-import step's empty-selection "Open as Folder" escape hatch to
 * the existing `confirm-non-git-folder` modal, which already adds the parent as a
 * non-Git folder workspace for local, runtime, and SSH contexts.
 */
export function useOpenNestedFolderAsFolder({
  nestedScan,
  nestedConnectionId,
  runtimeEnvironmentId,
  nestedAttemptId,
  nestedRuntimeKind,
  getNestedRepoRuntimeKind,
  openModal,
  resetState
}: {
  nestedScan: NestedRepoScanResult | null
  nestedConnectionId: string | null
  runtimeEnvironmentId: string | null
  nestedAttemptId: string | null
  nestedRuntimeKind: NestedRepoTelemetryRuntimeKind | null
  getNestedRepoRuntimeKind: (connectionId: string | null) => NestedRepoTelemetryRuntimeKind
  openModal: (modal: 'confirm-non-git-folder', data?: Record<string, unknown>) => void
  resetState: () => void
}): () => void {
  return useCallback(() => {
    // Why: capture context before resetState() clears the nested-review state, so
    // the confirm modal opens with the correct SSH/runtime routing.
    const selectedPath = nestedScan?.selectedPath
    const connectionId = nestedConnectionId
    const attemptId = nestedAttemptId

    if (!nestedScan || !attemptId || !selectedPath) {
      return
    }

    track(
      'add_repo_nested_import_action',
      buildNestedRepoImportActionTelemetry({
        attemptId,
        surface: 'sidebar',
        runtimeKind: nestedRuntimeKind ?? getNestedRepoRuntimeKind(connectionId),
        action: 'open_as_folder',
        foundCount: nestedScan.repos.length,
        selectedCount: 0
      })
    )
    resetState()
    // Why: openModal must be the last modal store write so the confirm dialog
    // survives the add-repo dialog's reset.
    if (connectionId) {
      openModal('confirm-non-git-folder', { folderPath: selectedPath, connectionId })
      return
    }
    if (runtimeEnvironmentId) {
      openModal('confirm-non-git-folder', { folderPath: selectedPath, runtimeEnvironmentId })
      return
    }
    openModal('confirm-non-git-folder', { folderPath: selectedPath })
  }, [
    nestedScan,
    nestedConnectionId,
    runtimeEnvironmentId,
    nestedAttemptId,
    nestedRuntimeKind,
    getNestedRepoRuntimeKind,
    openModal,
    resetState
  ])
}
