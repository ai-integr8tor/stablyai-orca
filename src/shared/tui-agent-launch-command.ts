import { getTuiAgentLaunchCommand, TUI_AGENT_CONFIG } from './tui-agent-config'
import { planAgentCliArgsSuffix, type AgentStartupShell } from './tui-agent-startup-shell'
import type { TuiAgent } from './types'

export function resolveTuiAgentBaseCommand(args: {
  agent: TuiAgent
  cmdOverrides: Partial<Record<TuiAgent, string>>
  platform: NodeJS.Platform
  shell: AgentStartupShell
  agentArgs?: string | null
  isRemote?: boolean
}): { ok: true; command: string } | { ok: false; error: string } {
  const override = args.cmdOverrides[args.agent]
  const command =
    override ||
    getTuiAgentLaunchCommand(TUI_AGENT_CONFIG[args.agent], args.platform, {
      isRemote: args.isRemote
    })
  const suffix = planAgentCliArgsSuffix(args.agentArgs, args.shell)
  if (!suffix.ok) {
    return suffix
  }
  // Why: Codex status hooks live in Orca's runtime CODEX_HOME; a second
  // profile representation would duplicate hooks and emit a warning.
  return { ok: true, command: suffix.suffix ? `${command} ${suffix.suffix}` : command }
}
