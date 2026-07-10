import type { SleepingAgentLaunchConfig } from './agent-session-resume'
import type { StartupCommandDelivery } from './codex-startup-delivery'
import { TUI_AGENT_CONFIG } from './tui-agent-config'
import {
  buildSleepingAgentLaunchConfig,
  buildStartupEnv,
  resolveBaseCommand,
  withFreshOmpSessionDir
} from './tui-agent-startup-building'
import {
  clearEnvCommand,
  commandSeparator,
  quoteStartupArg,
  resolveStartupShell,
  type AgentStartupShell
} from './tui-agent-startup-shell'
import type { TuiAgent } from './types'

const WIN32_INLINE_DRAFT_LIMIT_CHARS = 24_000

export type AgentDraftLaunchPlan = {
  agent: TuiAgent
  launchCommand: string
  expectedProcess: string
  launchConfig: SleepingAgentLaunchConfig
  env?: Record<string, string>
  startupCommandDelivery?: StartupCommandDelivery
}

function inlineDraftPlanFitsPlatform(
  plan: AgentDraftLaunchPlan,
  platform: NodeJS.Platform
): boolean {
  if (platform !== 'win32') {
    return true
  }
  const envChars = Object.entries(plan.env ?? {}).reduce(
    (total, [key, value]) => total + key.length + value.length,
    0
  )
  // Why: Windows CreateProcess/env blocks have tight length ceilings. Large
  // generated drafts should use the existing post-ready paste fallback.
  return plan.launchCommand.length + envChars <= WIN32_INLINE_DRAFT_LIMIT_CHARS
}

export function buildAgentDraftLaunchPlan(args: {
  agent: TuiAgent
  draft: string
  cmdOverrides: Partial<Record<TuiAgent, string>>
  platform: NodeJS.Platform
  shell?: AgentStartupShell
  agentArgs?: string | null
  agentEnv?: Record<string, string> | null
  /** Why: SSH remotes deploy the CLI shim as plain `orca`, so the Linux-only
   * `orca-ide` rename must be skipped for remote launches. */
  isRemote?: boolean
}): AgentDraftLaunchPlan | null {
  const { agent, draft, cmdOverrides, platform } = args
  const startupEnv = buildStartupEnv(agent, args.agentEnv)
  const shell = resolveStartupShell(platform, args.shell)
  const config = TUI_AGENT_CONFIG[agent]
  const trimmed = draft.trim()
  if (!trimmed) {
    return null
  }
  const baseCommand = resolveBaseCommand({
    agent,
    cmdOverrides,
    platform,
    shell,
    agentArgs: args.agentArgs,
    isRemote: args.isRemote
  })
  if (!baseCommand.ok) {
    return null
  }
  const launchCommand = withFreshOmpSessionDir({
    agent,
    command: baseCommand.command,
    shell,
    isRemote: args.isRemote
  })
  const launchConfig = buildSleepingAgentLaunchConfig({
    ...args,
    agentCommand: baseCommand.command
  })
  let plan: AgentDraftLaunchPlan | null = null
  if (config.draftPromptFlag) {
    const quoted = quoteStartupArg(trimmed, shell)
    plan = {
      agent,
      launchCommand: `${launchCommand} ${config.draftPromptFlag} ${quoted}`,
      expectedProcess: config.expectedProcess,
      launchConfig,
      // Why: native draft flags carry user text on argv and must survive rc-file startup.
      ...(agent === 'codex' ? { startupCommandDelivery: 'shell-ready' as const } : {}),
      ...(startupEnv ? { env: startupEnv } : {})
    }
  } else if (config.draftPromptEnvVar) {
    const clearVar = clearEnvCommand(config.draftPromptEnvVar, shell)
    plan = {
      agent,
      launchCommand: `${launchCommand}${commandSeparator(shell)}${clearVar}`,
      expectedProcess: config.expectedProcess,
      launchConfig,
      env: { ...startupEnv, [config.draftPromptEnvVar]: trimmed }
    }
  }
  if (!plan || !inlineDraftPlanFitsPlatform(plan, platform)) {
    return null
  }
  return plan
}
