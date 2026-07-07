import React, { useCallback } from 'react'
import { ExternalLink, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { isLocalPathOpenBlocked, showLocalPathOpenBlockedToast } from '@/lib/local-path-open-guard'
import { getLocalFileManagerLabel } from '@/lib/local-file-manager-label'
import { OpenInApplicationIcon } from '@/lib/open-in-app-catalog'
import type { ShellOpenLocalPathFailureReason } from '../../../../shared/shell-open-types'
import type { GlobalSettings, OpenInApplication, Worktree } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'

export { getLocalFileManagerLabel } from '@/lib/local-file-manager-label'

type WorktreeOpenInMenuItemsProps = {
  worktreePath: string
  worktreeId?: string
  connectionId?: string | null
  disabled?: boolean
  labelPrefix?: string
}

type OpenInMenuEntry = {
  id: string
  label: string
  target: 'external-editor' | 'file-manager'
  command?: string
}

export const FILE_MANAGER_OPEN_IN_TARGET_ID = 'file-manager'

export function getWorktreeOpenInEntries(
  openInApplications: OpenInApplication[],
  fileManagerLabel: string
): OpenInMenuEntry[] {
  return [
    ...openInApplications.map((application) => ({
      id: application.id,
      label: application.label,
      target: 'external-editor' as const,
      command: application.command
    })),
    { id: FILE_MANAGER_OPEN_IN_TARGET_ID, label: fileManagerLabel, target: 'file-manager' }
  ]
}

export function getLastOpenInTargetId(args: {
  settings: Pick<GlobalSettings, 'lastOpenInTargetId' | 'lastOpenInTargetIdByWorktree'> | null
  worktreeId?: string | null
}): string | null {
  const worktreeTargetId = args.worktreeId
    ? args.settings?.lastOpenInTargetIdByWorktree?.[args.worktreeId]
    : null
  return worktreeTargetId ?? args.settings?.lastOpenInTargetId ?? null
}

export function getDefaultWorktreeOpenInEntry(args: {
  entries: OpenInMenuEntry[]
  settings: Pick<GlobalSettings, 'lastOpenInTargetId' | 'lastOpenInTargetIdByWorktree'> | null
  worktreeId?: string | null
}): OpenInMenuEntry | null {
  const targetId = getLastOpenInTargetId({ settings: args.settings, worktreeId: args.worktreeId })
  return (
    (targetId ? args.entries.find((entry) => entry.id === targetId) : undefined) ??
    args.entries.find((entry) => entry.target === 'external-editor') ??
    args.entries.find((entry) => entry.target === 'file-manager') ??
    null
  )
}

export function getFocusedWorktreeId(target: EventTarget | null | undefined): string | null {
  const maybeElement = target as { closest?: (selector: string) => Element | null } | null
  const worktreeElement = maybeElement?.closest?.('[data-worktree-id]')
  return worktreeElement?.getAttribute('data-worktree-id') ?? null
}

function rememberOpenInTarget(worktreeId: string | undefined, targetId: string | undefined): void {
  if (!worktreeId || !targetId) {
    return
  }

  const store = useAppStore.getState()
  const currentByWorktree = store.settings?.lastOpenInTargetIdByWorktree ?? {}
  void store.updateSettings({
    lastOpenInTargetId: targetId,
    lastOpenInTargetIdByWorktree: {
      ...currentByWorktree,
      [worktreeId]: targetId
    }
  })
}

function getWorktreeForOpenInShortcut(worktreeId: string | null): Worktree | null {
  if (!worktreeId) {
    return null
  }
  const store = useAppStore.getState()
  const known = store.getKnownWorktreeById(worktreeId)
  if (known && 'repoId' in known) {
    return known as Worktree
  }
  return store.allWorktrees().find((worktree) => worktree.id === worktreeId) ?? null
}

function getConnectionIdForWorktree(worktree: Pick<Worktree, 'repoId'>): string | null {
  const store = useAppStore.getState()
  return store.repos.find((repo) => repo.id === worktree.repoId)?.connectionId ?? null
}

export async function openWorktreeInLastOpenInTarget(args: {
  worktreeId: string
  worktreePath: string
  connectionId?: string | null
}): Promise<void> {
  const store = useAppStore.getState()
  const entries = getWorktreeOpenInEntries(
    store.settings?.openInApplications ?? [],
    getLocalFileManagerLabel()
  )
  const entry = getDefaultWorktreeOpenInEntry({
    entries,
    settings: store.settings,
    worktreeId: args.worktreeId
  })
  if (!entry) {
    return
  }

  await openWorktreePath({
    target: entry.target,
    worktreePath: args.worktreePath,
    connectionId: args.connectionId,
    command: entry.command,
    worktreeId: args.worktreeId,
    openInTargetId: entry.id
  })
}

export async function openFocusedWorktreeInLastOpenInTarget(
  target: EventTarget | null | undefined
): Promise<boolean> {
  const store = useAppStore.getState()
  const worktreeId = getFocusedWorktreeId(target) ?? store.activeWorktreeId
  const worktree = getWorktreeForOpenInShortcut(worktreeId)
  if (!worktree) {
    return false
  }

  await openWorktreeInLastOpenInTarget({
    worktreeId: worktree.id,
    worktreePath: worktree.path,
    connectionId: getConnectionIdForWorktree(worktree)
  })
  return true
}

function showOpenFailureToast(reason: ShellOpenLocalPathFailureReason): void {
  if (reason === 'not-absolute') {
    toast.error(
      translate(
        'auto.components.sidebar.WorktreeOpenInMenu.f387af445b',
        'Workspace path is not a valid local path.'
      )
    )
    return
  }
  if (reason === 'not-found') {
    toast.error(
      translate(
        'auto.components.sidebar.WorktreeOpenInMenu.3921d3d9a5',
        'Workspace folder was not found.'
      ),
      {
        description: translate(
          'auto.components.sidebar.WorktreeOpenInMenu.0bed8727db',
          'It may have been moved or deleted. Refresh workspaces or remove it from Orca.'
        )
      }
    )
    return
  }
  toast.error(
    translate(
      'auto.components.sidebar.WorktreeOpenInMenu.9a5381eb09',
      'Could not open workspace folder.'
    ),
    {
      description: translate(
        'auto.components.sidebar.WorktreeOpenInMenu.bd0e8159f8',
        'Check the editor command or file manager configuration on this machine.'
      )
    }
  )
}

function stopMenuPropagation(event: React.SyntheticEvent): void {
  event.stopPropagation()
}

export function openOpenInAppsSettings(): void {
  const store = useAppStore.getState()
  store.openSettingsTarget({
    pane: 'general',
    repoId: null,
    sectionId: 'general-open-in-apps'
  })
  store.openSettingsPage()
}

export async function openWorktreePath(args: {
  target: 'file-manager' | 'external-editor'
  worktreePath: string
  connectionId?: string | null
  command?: string
  worktreeId?: string
  openInTargetId?: string
}): Promise<void> {
  rememberOpenInTarget(args.worktreeId, args.openInTargetId)

  if (
    isLocalPathOpenBlocked(useAppStore.getState().settings, {
      connectionId: args.connectionId ?? null
    })
  ) {
    showLocalPathOpenBlockedToast()
    return
  }

  const result =
    args.target === 'file-manager'
      ? await window.api.shell.openInFileManager(args.worktreePath)
      : await window.api.shell.openInExternalEditor(args.worktreePath, args.command)
  if (!result.ok) {
    showOpenFailureToast(result.reason)
  }
}

function useOpenInWorktreePath({
  worktreePath,
  connectionId
}: WorktreeOpenInMenuItemsProps): (
  target: 'file-manager' | 'external-editor',
  command?: string
) => Promise<void> {
  return useCallback(
    async (target, command) => {
      await openWorktreePath({ target, worktreePath, connectionId, command })
    },
    [connectionId, worktreePath]
  )
}

export function WorktreeOpenInMenuItems({
  worktreePath,
  worktreeId,
  connectionId,
  disabled,
  labelPrefix = ''
}: WorktreeOpenInMenuItemsProps): React.JSX.Element {
  const openInWorktreePath = useOpenInWorktreePath({ worktreePath, connectionId })
  const openInApplications = useAppStore((s) => s.settings?.openInApplications ?? [])
  const fileManagerLabel = getLocalFileManagerLabel()
  const entries = getWorktreeOpenInEntries(openInApplications, fileManagerLabel)

  return (
    <>
      {entries.map((entry) => (
        <DropdownMenuItem
          key={entry.id}
          onClick={stopMenuPropagation}
          onSelect={() => {
            rememberOpenInTarget(worktreeId, entry.id)
            void openInWorktreePath(entry.target, entry.command)
          }}
          disabled={disabled}
        >
          {entry.target === 'file-manager' ? (
            <FolderOpen className="size-3.5" />
          ) : entry.command ? (
            <OpenInApplicationIcon application={{ command: entry.command }} size={14} />
          ) : (
            <ExternalLink className="size-3.5" />
          )}
          {labelPrefix}
          {entry.label}
        </DropdownMenuItem>
      ))}
    </>
  )
}

export function WorktreeOpenInSubMenu({
  worktreePath,
  worktreeId,
  connectionId,
  disabled
}: WorktreeOpenInMenuItemsProps): React.JSX.Element {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled}>
        <FolderOpen className="size-3.5" />
        {translate('auto.components.sidebar.WorktreeOpenInMenu.8009ab69a6', 'Open in')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-52"
        onClick={stopMenuPropagation}
        onPointerDown={stopMenuPropagation}
      >
        <WorktreeOpenInMenuItems
          worktreePath={worktreePath}
          worktreeId={worktreeId}
          connectionId={connectionId}
          disabled={disabled}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={stopMenuPropagation}
          onSelect={openOpenInAppsSettings}
          disabled={disabled}
        >
          {translate('auto.components.sidebar.WorktreeOpenInMenu.1417fd8380', 'Customize apps...')}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
