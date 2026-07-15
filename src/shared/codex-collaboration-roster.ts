import { AGENT_STATUS_MAX_SUBAGENTS, type AgentSubagentSnapshot } from './agent-status-types'

const CODEX_COLLABORATION_TASK_ID_MAX_LENGTH = 64

export type CodexCollaborationRoster = Map<string, AgentSubagentSnapshot>

export function readCodexSpawnTaskName(hookPayload: Record<string, unknown>): string | undefined {
  const toolName = readNormalizedToolName(hookPayload)
  if (toolName !== 'collaborationspawnagent' && toolName !== 'spawnagent') {
    return undefined
  }
  const input = readToolInput(hookPayload)
  const taskName = readString(input, 'task_name') ?? readString(input, 'taskName')
  return normalizeTaskName(taskName)
}

export function readCodexInterruptedTaskName(
  hookPayload: Record<string, unknown>
): string | undefined {
  const toolName = readNormalizedToolName(hookPayload)
  if (toolName !== 'collaborationinterruptagent' && toolName !== 'interruptagent') {
    return undefined
  }
  const input = readToolInput(hookPayload)
  return normalizeTaskName(readString(input, 'target'))
}

export function upsertWorkingCodexCollaborationTask(
  roster: CodexCollaborationRoster,
  taskName: string,
  now: number
): void {
  if (taskName.length === 0 || taskName.length > CODEX_COLLABORATION_TASK_ID_MAX_LENGTH) {
    return
  }
  const existing = roster.get(taskName)
  if (existing) {
    existing.state = 'working'
    return
  }
  if (roster.size >= AGENT_STATUS_MAX_SUBAGENTS && !evictOldestIdleTask(roster)) {
    return
  }
  roster.set(taskName, {
    id: taskName,
    state: 'working',
    startedAt: now,
    agentType: 'codex',
    description: taskName
  })
}

export function markCodexCollaborationTaskIdle(
  roster: CodexCollaborationRoster,
  taskName: string
): void {
  const task = roster.get(taskName)
  if (task) {
    task.state = 'idle'
  }
}

export function markAllCodexCollaborationTasksIdle(roster: CodexCollaborationRoster): void {
  for (const task of roster.values()) {
    task.state = 'idle'
  }
}

export function codexCollaborationRosterToSnapshots(
  roster: CodexCollaborationRoster | undefined
): AgentSubagentSnapshot[] | undefined {
  if (!roster || roster.size === 0) {
    return undefined
  }
  return [...roster.values()]
    .map((task) => ({ ...task }))
    .sort((a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function readNormalizedToolName(hookPayload: Record<string, unknown>): string | undefined {
  const toolName = readString(hookPayload, 'tool_name') ?? readString(hookPayload, 'name')
  return toolName?.replaceAll(/[^a-z0-9]/gi, '').toLowerCase()
}

function readToolInput(hookPayload: Record<string, unknown>): Record<string, unknown> {
  const input = hookPayload.tool_input ?? hookPayload.input ?? hookPayload.arguments
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeTaskName(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }
  // Why: interrupt targets use canonical paths such as `/root/repo_map`, while
  // spawn inputs use the sibling name. One stable leaf id lets both events match.
  const leaf = value.slice(value.lastIndexOf('/') + 1).trim()
  return leaf.length > 0 ? leaf : undefined
}

function evictOldestIdleTask(roster: CodexCollaborationRoster): boolean {
  let oldest: AgentSubagentSnapshot | undefined
  for (const task of roster.values()) {
    if (task.state === 'idle' && (!oldest || task.startedAt < oldest.startedAt)) {
      oldest = task
    }
  }
  if (!oldest) {
    return false
  }
  roster.delete(oldest.id)
  return true
}
