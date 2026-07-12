import { describe, expect, it } from 'vitest'
import { makePaneKey } from '../../shared/stable-pane-id'
import { AgentHookServer } from './server'

const PANE_KEY = makePaneKey('tab-question', '11111111-1111-4111-8111-111111111111')

function ingestClaudeStatus(
  server: AgentHookServer,
  event: {
    state: 'working' | 'waiting'
    hookEventName: 'PermissionRequest' | 'PreToolUse' | 'PostToolUse'
    toolName: string
    toolUseId?: string
  }
): void {
  server.ingestRemote(
    {
      paneKey: PANE_KEY,
      tabId: 'tab-question',
      worktreeId: 'worktree-question',
      hookEventName: event.hookEventName,
      toolUseId: event.toolUseId,
      payload: {
        state: event.state,
        agentType: 'claude',
        toolName: event.toolName
      }
    },
    'connection-1'
  )
}

describe('Claude interactive-question status transitions', () => {
  it('clears an AskUserQuestion wait when later tool work starts', () => {
    const server = new AgentHookServer()

    ingestClaudeStatus(server, {
      state: 'waiting',
      hookEventName: 'PreToolUse',
      toolName: 'AskUserQuestion',
      toolUseId: 'tool-question'
    })
    ingestClaudeStatus(server, {
      state: 'working',
      hookEventName: 'PreToolUse',
      toolName: 'Read',
      toolUseId: 'tool-after-answer'
    })

    expect(server.getStatusSnapshot()).toEqual([
      expect.objectContaining({
        paneKey: PANE_KEY,
        state: 'working',
        agentType: 'claude',
        toolName: 'Read'
      })
    ])
  })

  it('clears an AskUserQuestion wait that arrived as a PermissionRequest when the answer lands', () => {
    const server = new AgentHookServer()

    // Why: real Claude emits PreToolUse then, ~120ms later, a PermissionRequest
    // for the auto-allowed AskUserQuestion. Orca registers PermissionRequest, so
    // it overwrites the PreToolUse as `previous` — and it carries no tool_use_id,
    // so a resuming-tool id match can never clear it. The answer's PostToolUse
    // 'working' hook must still drop the wait.
    ingestClaudeStatus(server, {
      state: 'waiting',
      hookEventName: 'PreToolUse',
      toolName: 'AskUserQuestion',
      toolUseId: 'tool-question'
    })
    ingestClaudeStatus(server, {
      state: 'waiting',
      hookEventName: 'PermissionRequest',
      toolName: 'AskUserQuestion'
    })
    ingestClaudeStatus(server, {
      state: 'working',
      hookEventName: 'PostToolUse',
      toolName: 'AskUserQuestion',
      toolUseId: 'tool-question'
    })

    expect(server.getStatusSnapshot()).toEqual([
      expect.objectContaining({
        paneKey: PANE_KEY,
        state: 'working',
        agentType: 'claude'
      })
    ])
  })

  it('keeps an actual permission request sticky during unrelated tool work', () => {
    const server = new AgentHookServer()

    ingestClaudeStatus(server, {
      state: 'waiting',
      hookEventName: 'PermissionRequest',
      toolName: 'Bash',
      toolUseId: 'tool-needs-permission'
    })
    ingestClaudeStatus(server, {
      state: 'working',
      hookEventName: 'PreToolUse',
      toolName: 'Read',
      toolUseId: 'tool-unrelated'
    })

    expect(server.getStatusSnapshot()).toEqual([
      expect.objectContaining({
        paneKey: PANE_KEY,
        state: 'waiting',
        agentType: 'claude',
        toolName: 'Bash'
      })
    ])
  })
})
