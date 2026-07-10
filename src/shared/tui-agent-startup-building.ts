import type { SleepingAgentLaunchConfig } from './agent-session-resume'
import {
  ORCA_OMP_FORCE_NEW_SESSION_ENV,
  ORCA_OMP_FRESH_SESSION_DIR_ENV
} from './omp-fresh-session-env'
import { getTuiAgentLaunchCommand, TUI_AGENT_CONFIG } from './tui-agent-config'
import { planAgentCliArgsSuffix, type AgentStartupShell } from './tui-agent-startup-shell'
import type { TuiAgent } from './types'

export function resolveBaseCommand(args: {
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
  // Why: Codex status hooks live in Orca's runtime CODEX_HOME; adding
  // --profile-v2 makes Codex load a second hook representation and warn.
  return { ok: true, command: suffix.suffix ? `${command} ${suffix.suffix}` : command }
}

export function buildSleepingAgentLaunchConfig(args: {
  agentCommand?: string | null
  agentArgs?: string | null
  agentEnv?: Record<string, string> | null
}): SleepingAgentLaunchConfig {
  return {
    ...(args.agentCommand?.trim() ? { agentCommand: args.agentCommand } : {}),
    agentArgs: args.agentArgs ?? '',
    // Why: startupPlan.env may include prompt transport or pane identity env; the
    // durable resume snapshot is limited to Orca-managed agent env inputs.
    agentEnv: args.agentEnv ? { ...args.agentEnv } : {}
  }
}

export function buildStartupEnv(
  agent: TuiAgent,
  agentEnv: Record<string, string> | null | undefined
): Record<string, string> | undefined {
  if (agent !== 'omp') {
    return agentEnv ? { ...agentEnv } : undefined
  }
  return { ...agentEnv, [ORCA_OMP_FORCE_NEW_SESSION_ENV]: '1' }
}

function shellEnvArg(name: string, shell: AgentStartupShell): string {
  if (shell === 'powershell') {
    return `"${'${'}env:${name}}"`
  }
  if (shell === 'cmd') {
    return `"%${name}%"`
  }
  return `"$${name}"`
}

function commandHasOmpSessionSelector(command: string): boolean {
  return /(^|\s)(?:--session-dir(?:=|\s)|--resume(?:=|\s|$)|-r(?:\s|$)|--continue(?:\s|$)|-c(?:\s|$)|--no-session(?:\s|$)|--fork(?:=|\s|$))/.test(
    command
  )
}

export function withFreshOmpSessionDir(args: {
  agent: TuiAgent
  command: string
  shell: AgentStartupShell
  isRemote?: boolean
}): string {
  if (args.agent !== 'omp' || args.isRemote || commandHasOmpSessionSelector(args.command)) {
    return args.command
  }
  return `${args.command} --session-dir ${shellEnvArg(ORCA_OMP_FRESH_SESSION_DIR_ENV, args.shell)}`
}
