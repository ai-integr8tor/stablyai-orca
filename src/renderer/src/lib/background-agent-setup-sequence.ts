import type { AgentStartupPlan } from '@/lib/tui-agent-startup'
import { launchWorktreeBackgroundTerminals } from '@/lib/launch-worktree-background-terminals'
import {
  createSequencedSetupAgentCommands,
  DEFAULT_SETUP_AGENT_SEQUENCE_WAIT_TIMEOUT_SECONDS
} from '../../../shared/setup-agent-sequencing'
import { getSetupRunnerCommandPlatformForPath } from '../../../shared/setup-runner-command'
import type { WorktreeDefaultTabsLaunch, WorktreeSetupLaunch } from '../../../shared/types'

export const SETUP_GATED_AGENT_READY_TIMEOUT_MS =
  (DEFAULT_SETUP_AGENT_SEQUENCE_WAIT_TIMEOUT_SECONDS + 10) * 1000

export type PreAgentWorktreeSetup = {
  setup: WorktreeSetupLaunch
  defaultTabs?: WorktreeDefaultTabsLaunch
}

export async function sequenceBackgroundAgentStartupAfterSetup(args: {
  worktreeId: string
  startupPlan: AgentStartupPlan
  launchPlatform: NodeJS.Platform
  preAgentWorktreeSetup: PreAgentWorktreeSetup
}): Promise<AgentStartupPlan> {
  const { setup } = args.preAgentWorktreeSetup
  const sequenced = createSequencedSetupAgentCommands({
    runnerScriptPath: setup.runnerScriptPath,
    startupCommand: args.startupPlan.launchCommand,
    platform: getSetupRunnerCommandPlatformForPath(
      setup.runnerScriptPath,
      args.launchPlatform === 'win32' ? 'windows' : 'posix'
    )
  })
  const startupPlan = {
    ...args.startupPlan,
    launchCommand: sequenced.startupCommand,
    env: { ...args.startupPlan.env, ...sequenced.startupEnv }
  }
  // Why: scheduled new-run automations need setup-created config/skills
  // before the agent starts, while the hidden agent tab still appears promptly.
  await launchWorktreeBackgroundTerminals({
    worktreeId: args.worktreeId,
    setup: { ...setup, command: sequenced.setupCommand },
    defaultTabs: args.preAgentWorktreeSetup.defaultTabs
  })
  return startupPlan
}
