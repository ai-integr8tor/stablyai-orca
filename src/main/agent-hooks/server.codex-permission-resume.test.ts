import { describe, expect, it, vi } from 'vitest'
import { AGENT_STATUS_STALE_AFTER_MS } from '../../shared/agent-status-types'
import { makePaneKey } from '../../shared/stable-pane-id'
import { AgentHookServer } from './server'

const PANE_KEY = makePaneKey('tab-codex', '11111111-1111-4111-8111-111111111111')

/** Seed the exact Codex PermissionRequest shape that remains waiting after approval. */
function ingestCodexPermission(server: AgentHookServer): void {
  server.ingestRemote(
    {
      paneKey: PANE_KEY,
      tabId: 'tab-codex',
      worktreeId: 'worktree-codex',
      hookEventName: 'PermissionRequest',
      providerSession: { key: 'session_id', id: 'codex-session-1' },
      payload: {
        state: 'waiting',
        prompt: 'Run the approved command',
        agentType: 'codex',
        toolName: 'Bash',
        toolInput: 'sleep 10',
        interactivePrompt: JSON.stringify({ approval: { tool: 'Bash', summary: 'sleep 10' } })
      }
    },
    'connection-1'
  )
}

describe('Codex permission resume from terminal title', () => {
  it('moves a live PermissionRequest wait back to working', () => {
    const server = new AgentHookServer()
    const listener = vi.fn()
    server.setListener(listener)
    ingestCodexPermission(server)

    expect(server.resumeCodexPermissionWaitFromTerminalTitle(PANE_KEY)).toBe(true)

    expect(server.getStatusSnapshot()).toEqual([
      expect.objectContaining({
        paneKey: PANE_KEY,
        state: 'working',
        prompt: 'Run the approved command',
        agentType: 'codex',
        toolName: 'Bash',
        toolInput: 'sleep 10',
        interactivePrompt: undefined,
        providerSession: { key: 'session_id', id: 'codex-session-1' }
      })
    ])
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ state: 'working' }) })
    )
  })

  it('ignores other agents and Codex states that are not permission waits', () => {
    const server = new AgentHookServer()
    server.ingestRemote(
      {
        paneKey: PANE_KEY,
        hookEventName: 'PermissionRequest',
        payload: { state: 'waiting', prompt: 'Approve', agentType: 'claude' }
      },
      'connection-1'
    )
    expect(server.resumeCodexPermissionWaitFromTerminalTitle(PANE_KEY)).toBe(false)

    const codexServer = new AgentHookServer()
    ingestCodexPermission(codexServer)
    expect(codexServer.resumeCodexPermissionWaitFromTerminalTitle(PANE_KEY)).toBe(true)
    expect(codexServer.resumeCodexPermissionWaitFromTerminalTitle(PANE_KEY)).toBe(false)
    expect(codexServer.resumeCodexPermissionWaitFromTerminalTitle('missing:1')).toBe(false)
  })

  it('ignores stale Codex permission waits', () => {
    vi.useFakeTimers()
    try {
      const server = new AgentHookServer()
      ingestCodexPermission(server)

      vi.advanceTimersByTime(AGENT_STATUS_STALE_AFTER_MS + 1)

      expect(server.resumeCodexPermissionWaitFromTerminalTitle(PANE_KEY)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores Codex waits that did not come from PermissionRequest', () => {
    const server = new AgentHookServer()
    server.ingestRemote(
      {
        paneKey: PANE_KEY,
        hookEventName: 'AskUserQuestion',
        payload: { state: 'waiting', prompt: 'Answer me', agentType: 'codex' }
      },
      'connection-1'
    )

    expect(server.resumeCodexPermissionWaitFromTerminalTitle(PANE_KEY)).toBe(false)
  })
})
