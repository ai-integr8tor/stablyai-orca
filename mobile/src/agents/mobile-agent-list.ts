import type { RuntimeWorktreeAgentRow } from '../../../src/shared/runtime-types'
import {
  agentDisplayLabel,
  agentDotState,
  agentStateLabel,
  type AgentDotState
} from '../worktree/agent-row-display'
import { flattenAgentRowLineage } from '../worktree/agent-row-lineage'
import type { Worktree } from '../worktree/workspace-list-sections'

export type MobileAgentGroupBy = 'status' | 'worktree' | 'repo' | 'agent'
export type MobileAgentVisibilityFilter = 'all' | 'attention'

export type MobileAgentThread = {
  worktreeId: string
  worktreeName: string
  repo: string
  branch: string
  agent: RuntimeWorktreeAgentRow
  dotState: AgentDotState
  lineageDepth: number
  title: string
  subtitle: string
  toolSummary: string | null
  searchText: string
  sortTimestamp: number
}

export type MobileAgentThreadGroup = {
  key: string
  label: string
  threads: MobileAgentThread[]
}

const ATTENTION_STATES: Record<AgentDotState, boolean> = {
  working: true,
  blocked: true,
  waiting: true,
  interrupted: true,
  done: false,
  idle: false
}

const STATUS_ORDER: readonly AgentDotState[] = [
  'working',
  'blocked',
  'waiting',
  'interrupted',
  'done',
  'idle'
]

function makeToolSummary(agent: RuntimeWorktreeAgentRow): string | null {
  if (!agent.toolName) {
    return null
  }
  if (!agent.toolInput) {
    return agent.toolName
  }
  return `${agent.toolName}: ${agent.toolInput}`
}

export function buildMobileAgentThreads(
  worktrees: readonly Worktree[],
  now: number
): MobileAgentThread[] {
  const threads: MobileAgentThread[] = []
  for (const worktree of worktrees) {
    if (!worktree.agents?.length) {
      continue
    }
    const worktreeName = worktree.displayName || worktree.repo
    for (const node of flattenAgentRowLineage(worktree.agents)) {
      const agent = node.row
      const dotState = agentDotState(agent, now)
      const title = agentDisplayLabel(agent, now)
      const subtitle =
        worktreeName === worktree.repo ? worktree.repo : `${worktreeName} · ${worktree.repo}`
      const toolSummary = makeToolSummary(agent)
      threads.push({
        worktreeId: worktree.worktreeId,
        worktreeName,
        repo: worktree.repo,
        branch: worktree.branch,
        agent,
        dotState,
        lineageDepth: node.depth,
        title,
        subtitle,
        toolSummary,
        searchText: [
          title,
          subtitle,
          worktree.branch,
          agent.agentType ?? '',
          agentStateLabel(dotState),
          agent.prompt,
          agent.lastAssistantMessage ?? '',
          agent.toolName ?? '',
          agent.toolInput ?? ''
        ]
          .join(' ')
          .toLowerCase(),
        sortTimestamp: agent.stateStartedAt
      })
    }
  }
  return threads.sort((a, b) => b.sortTimestamp - a.sortTimestamp)
}

export function filterMobileAgentThreads(
  threads: readonly MobileAgentThread[],
  args: { query: string; visibility: MobileAgentVisibilityFilter }
): MobileAgentThread[] {
  const query = args.query.trim().toLowerCase()
  return threads.filter((thread) => {
    if (args.visibility === 'attention' && !ATTENTION_STATES[thread.dotState]) {
      return false
    }
    return query.length === 0 || thread.searchText.includes(query)
  })
}

function groupByFirstSeen(
  threads: readonly MobileAgentThread[],
  keyForThread: (thread: MobileAgentThread) => string,
  labelForThread: (thread: MobileAgentThread) => string
): MobileAgentThreadGroup[] {
  const groups: MobileAgentThreadGroup[] = []
  const byKey = new Map<string, MobileAgentThreadGroup>()
  for (const thread of threads) {
    const key = keyForThread(thread)
    let group = byKey.get(key)
    if (!group) {
      group = { key, label: labelForThread(thread), threads: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.threads.push(thread)
  }
  return groups
}

export function groupMobileAgentThreads(
  threads: readonly MobileAgentThread[],
  groupBy: MobileAgentGroupBy
): MobileAgentThreadGroup[] {
  if (groupBy === 'status') {
    return STATUS_ORDER.map((state) => ({
      key: state,
      label: agentStateLabel(state),
      threads: threads.filter((thread) => thread.dotState === state)
    })).filter((group) => group.threads.length > 0)
  }
  if (groupBy === 'worktree') {
    return groupByFirstSeen(
      threads,
      (thread) => thread.worktreeId,
      (thread) => thread.worktreeName
    )
  }
  if (groupBy === 'repo') {
    return groupByFirstSeen(
      threads,
      (thread) => thread.repo,
      (thread) => thread.repo
    )
  }
  return groupByFirstSeen(
    threads,
    (thread) => thread.agent.agentType ?? 'unknown',
    (thread) => thread.agent.agentType ?? 'unknown'
  )
}
