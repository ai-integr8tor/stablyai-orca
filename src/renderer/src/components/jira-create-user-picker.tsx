import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandInput, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { JiraUser } from '../../../shared/types'
import {
  jiraListCreateAssignableUsers,
  type RuntimeJiraSettings
} from '@/runtime/runtime-jira-client'

// The Jira create dialog stores selected accountIds (comma-separated for the
// multi-user variant) so the existing Record<string,string> draft shape is kept.
const MULTI_USER_SEPARATOR = ','
const USER_SEARCH_CACHE_LIMIT = 20

type JiraCreateUserPickerProps = {
  fieldName: string
  /** Comma-separated accountId(s) currently selected. */
  value: string
  onChange: (next: string) => void
  multiple: boolean
  projectKeyOrId: string
  siteId?: string | null
  runtimeSettings: RuntimeJiraSettings
  /** Known users (e.g. the prefilled token owner) so labels resolve immediately. */
  knownUsers?: readonly JiraUser[]
  disabled?: boolean
}

function parseSelectedAccountIds(value: string): string[] {
  return value
    .split(MULTI_USER_SEPARATOR)
    .map((id) => id.trim())
    .filter(Boolean)
}

function mergeUsers(...sources: readonly (readonly JiraUser[])[]): JiraUser[] {
  const byAccountId = new Map<string, JiraUser>()
  for (const source of sources) {
    for (const user of source) {
      if (!byAccountId.has(user.accountId)) {
        byAccountId.set(user.accountId, user)
      }
    }
  }
  return [...byAccountId.values()]
}

export function shouldSearchJiraCreateUsers(query: string, projectKeyOrId: string): boolean {
  return Boolean(query.trim() && projectKeyOrId.trim())
}

export function getJiraCreateUserSearchCacheKey(
  projectKeyOrId: string,
  query: string,
  siteId?: string | null
): string {
  return [siteId ?? '', projectKeyOrId.trim(), query.trim().toLowerCase()].join('\u0000')
}

function cacheJiraCreateUsers(
  cache: Map<string, JiraUser[]>,
  key: string,
  users: JiraUser[]
): void {
  if (!cache.has(key) && cache.size >= USER_SEARCH_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) {
      cache.delete(oldestKey)
    }
  }
  cache.set(key, users)
}

export default function JiraCreateUserPicker({
  fieldName,
  value,
  onChange,
  multiple,
  projectKeyOrId,
  siteId,
  runtimeSettings,
  knownUsers,
  disabled
}: JiraCreateUserPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<JiraUser[]>([])
  const [loading, setLoading] = useState(false)
  const requestIdRef = useRef(0)
  const resultCacheRef = useRef(new Map<string, JiraUser[]>())

  const selectedAccountIds = useMemo(() => parseSelectedAccountIds(value), [value])
  const hasSearchQuery = query.trim().length > 0

  // Why: the picker only ever holds accountIds in its draft, so resolved labels
  // come from search results plus any users the parent already knows about.
  const resolvedUsers = useMemo(() => mergeUsers(results, knownUsers ?? []), [knownUsers, results])

  const selectedUsers = useMemo(
    () =>
      selectedAccountIds.map(
        (accountId) =>
          resolvedUsers.find((user) => user.accountId === accountId) ?? {
            accountId,
            displayName: accountId
          }
      ),
    [resolvedUsers, selectedAccountIds]
  )

  useEffect(() => {
    requestIdRef.current += 1
    if (!open) {
      setLoading(false)
      return
    }
    if (!shouldSearchJiraCreateUsers(query, projectKeyOrId)) {
      setLoading(false)
      setResults([])
      return
    }
    const requestId = requestIdRef.current
    const trimmedProjectKey = projectKeyOrId.trim()
    const trimmedQuery = query.trim()
    const cacheKey = getJiraCreateUserSearchCacheKey(trimmedProjectKey, trimmedQuery, siteId)
    const cachedUsers = resultCacheRef.current.get(cacheKey)
    if (cachedUsers) {
      setLoading(false)
      setResults(cachedUsers)
      return
    }
    setLoading(true)
    // Why: wait for a real query and debounce it so opening the picker or
    // typing a name does not fire avoidable project-user searches.
    const timer = window.setTimeout(() => {
      void jiraListCreateAssignableUsers(runtimeSettings, trimmedProjectKey, trimmedQuery, siteId)
        .then((users) => {
          cacheJiraCreateUsers(resultCacheRef.current, cacheKey, users)
          if (requestId === requestIdRef.current) {
            setResults(users)
          }
        })
        .catch(() => {
          if (requestId === requestIdRef.current) {
            setResults([])
          }
        })
        .finally(() => {
          if (requestId === requestIdRef.current) {
            setLoading(false)
          }
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [open, projectKeyOrId, query, runtimeSettings, siteId])

  const toggleUser = (accountId: string): void => {
    if (!multiple) {
      onChange(accountId)
      setOpen(false)
      return
    }
    const next = selectedAccountIds.includes(accountId)
      ? selectedAccountIds.filter((id) => id !== accountId)
      : [...selectedAccountIds, accountId]
    onChange(next.join(MULTI_USER_SEPARATOR))
  }

  const triggerLabel =
    selectedUsers.length === 0
      ? translate('auto.components.jira.create.user.picker.select', 'Select {{value0}}', {
          value0: fieldName
        })
      : selectedUsers.map((user) => user.displayName).join(', ')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full justify-between px-3 text-sm font-normal"
        >
          <span className={cn('truncate', selectedUsers.length === 0 && 'text-muted-foreground')}>
            {triggerLabel}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(360px,calc(100vw-1rem))] min-w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            placeholder={translate(
              'auto.components.jira.create.user.picker.search',
              'Search users...'
            )}
            value={query}
            onValueChange={setQuery}
            className="text-sm"
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin" />
                {translate('auto.components.jira.create.user.picker.loading', 'Searching…')}
              </div>
            ) : resolvedUsers.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {hasSearchQuery
                  ? translate('auto.components.jira.create.user.picker.empty', 'No users found.')
                  : translate(
                      'auto.components.jira.create.user.picker.prompt',
                      'Type to search users.'
                    )}
              </div>
            ) : (
              resolvedUsers.map((user) => {
                const selected = selectedAccountIds.includes(user.accountId)
                return (
                  <button
                    key={user.accountId}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => toggleUser(user.accountId)}
                    className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Check
                      className={cn(
                        'size-3 text-muted-foreground',
                        selected ? 'opacity-70' : 'opacity-0'
                      )}
                    />
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="size-5 rounded-full" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{user.displayName}</div>
                      {user.email ? (
                        <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
                      ) : null}
                    </div>
                  </button>
                )
              })
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
