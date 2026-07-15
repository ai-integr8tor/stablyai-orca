#!/usr/bin/env node

/**
 * Simulate Codex subagent reporting for testing the fix in #8251.
 *
 * Usage (while Orca dev app is running with a terminal open):
 *   node scripts/simulate-codex-subagents.mjs <port> <token> <paneKey> <worktreeId>
 *
 * Example:
 *   # In a terminal inside Orca, run:
 *   env | grep ORCA_AGENT_HOOK
 *   # Get paneKey from Orca dev tools or terminal list CLI
 *   node scripts/simulate-codex-subagents.mjs 12345 abc123def \
 *     "tab-abc:leaf-123" "repo-id::/absolute/worktree/path"
 *
 * Then check the sidebar in Orca for the hierarchy under the worktree/agent.
 */

// Uses global fetch (available in Node 18+ / 26 here)

const [port, token, paneKey, worktreeId] = process.argv.slice(2)

if (!port || !token || !paneKey || !worktreeId) {
  console.error(
    'Usage: node scripts/simulate-codex-subagents.mjs <port> <token> <paneKey> <worktreeId>'
  )
  console.error('Get port/token from env in a terminal inside Orca: env | grep ORCA_AGENT_HOOK')
  console.error('Get paneKey from app (e.g. via terminal list or dev tools inspecting the pane).')
  process.exit(1)
}

const url = `http://127.0.0.1:${port}/hook/codex`

const events = [
  {
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Simulate three Codex collaboration agents'
  },
  ...['app_motion_audit', 'lovable_pattern_research', 'trading_animation_ideas'].map(
    (taskName) => ({
      hook_event_name: 'PreToolUse',
      tool_name: 'collaborationspawn_agent',
      tool_input: { task_name: taskName }
    })
  )
]

console.log('Posting simulated Codex collaboration hook sequence...')
console.log('URL:', url)
console.log('Pane:', paneKey)
console.log('Spawn events:', events.length - 1)

try {
  for (const payload of events) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Orca-Agent-Hook-Token': token
      },
      body: new URLSearchParams({
        paneKey,
        tabId: paneKey.split(':')[0],
        worktreeId,
        env: 'development',
        version: '1',
        payload: JSON.stringify(payload)
      })
    })
    if (response.status !== 204) {
      throw new Error(`hook returned HTTP ${response.status}`)
    }
  }
  console.log('Success! The sidebar should show 3 working children under the Codex row.')
} catch (err) {
  console.error('Error posting hook:', err instanceof Error ? err.message : String(err))
  console.log('Make sure the app is running and the endpoint values are fresh.')
  process.exitCode = 1
}
