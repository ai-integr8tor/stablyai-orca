export type NativeChatTranscriptAgent = 'claude' | 'codex' | 'grok'

/** Agents whose transcripts the native chat view can parse and render. */
export const NATIVE_CHAT_SUPPORTED_AGENTS: ReadonlySet<string> = new Set([
  'claude',
  'openclaude',
  'codex',
  'grok',
  'codebuddy',
  'ccb'
])

export function isNativeChatSupportedAgent(agent: string | null | undefined): boolean {
  return agent != null && NATIVE_CHAT_SUPPORTED_AGENTS.has(agent)
}

/** True when the agent renders Claude's multi-step AskUserQuestion — one question
 *  per step, each Enter advancing — so a multi-line answer must be paced per line.
 *  Other agents submit the whole answer with a single Enter. */
export function shouldStepNativeChatAskAnswer(agent: string | null | undefined): boolean {
  return resolveNativeChatTranscriptAgent(agent) === 'claude'
}

export function resolveNativeChatTranscriptAgent(
  agent: string | null | undefined
): NativeChatTranscriptAgent | null {
  // Why: OpenClaude, CodeBuddy and CCB all write the Claude transcript format and
  // layout (CCB is a rebranded Claude Code that shares `~/.claude`; CodeBuddy is
  // built on the Claude Agent SDK) even though Orca preserves their distinct agent
  // identities for launch and UI behavior.
  if (agent === 'claude' || agent === 'openclaude' || agent === 'codebuddy' || agent === 'ccb') {
    return 'claude'
  }
  if (agent === 'codex' || agent === 'grok') {
    return agent
  }
  return null
}
