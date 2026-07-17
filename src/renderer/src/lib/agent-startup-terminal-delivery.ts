import { showAutomationPromptNotSentToast } from './agent-background-session-timeout-toast'
import { sendFollowupPromptWhenAgentReadyWithOutcome } from './agent-followup-delivery'
import {
  getSettingsForAgentTabRuntimeOwner,
  pasteDraftToAgentPtyWhenReadyWithOutcome
} from './agent-paste-draft'
import type { AgentStartupDeliveryOutcome } from './agent-startup-delayed-delivery'
import type { AgentStartupPlan } from './tui-agent-startup'

export async function deliverAgentStartupToTerminal(
  tabId: string,
  ptyId: string,
  startup: AgentStartupPlan
): Promise<AgentStartupDeliveryOutcome> {
  const runtimeSettings = getSettingsForAgentTabRuntimeOwner(tabId)
  let remainingStartup = startup
  // Why: stdin-after-start agents need their initial prompt submitted only
  // after the expected process owns the PTY.
  if (startup.followupPrompt) {
    const followupOutcome = await sendFollowupPromptWhenAgentReadyWithOutcome({
      ptyId,
      expectedProcess: startup.expectedProcess,
      prompt: startup.followupPrompt,
      settings: runtimeSettings
    })
    if (followupOutcome !== 'delivered') {
      if (followupOutcome === 'not-written') {
        showAutomationPromptNotSentToast(startup.agent)
        return { kind: 'retryable', startup }
      }
      return { kind: 'delivery-uncertain' }
    }
    // Why: a later draft-only retry must not resubmit a delivered follow-up.
    remainingStartup = { ...startup, followupPrompt: null }
  }

  if (startup.draftPrompt) {
    const draftOutcome = await pasteDraftToAgentPtyWhenReadyWithOutcome({
      tabId,
      ptyId,
      content: startup.draftPrompt,
      agent: startup.agent,
      // Why: this fallback exists only when native draft launch was unavailable.
      forcePaste: true,
      onTimeout: () => showAutomationPromptNotSentToast(startup.agent)
    })
    if (draftOutcome !== 'delivered') {
      return draftOutcome === 'not-written'
        ? { kind: 'retryable', startup: remainingStartup }
        : { kind: 'delivery-uncertain' }
    }
  }
  return { kind: 'delivered' }
}
