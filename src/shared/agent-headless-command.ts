import { isAnteHeadlessOneShotCommand } from './ante-headless-command'
import { isBobHeadlessOneShotCommand } from './bob-headless-command'
import { isClaudeHeadlessOneShotCommand } from './claude-headless-command'
import type { TuiAgent } from './types'

export function isHeadlessOneShotAgentCommand(agent: TuiAgent, tokens: readonly string[]): boolean {
  if (agent === 'claude') {
    return isClaudeHeadlessOneShotCommand(tokens)
  }
  if (agent === 'bob') {
    return isBobHeadlessOneShotCommand(tokens)
  }
  return agent === 'ante' && isAnteHeadlessOneShotCommand(tokens)
}

type AgentCommandRecognition = { agent: TuiAgent } | null

export function filterHeadlessOneShotAgentCommand<T extends AgentCommandRecognition>(
  recognition: T,
  tokens: readonly string[]
): T | null {
  if (recognition && isHeadlessOneShotAgentCommand(recognition.agent, tokens)) {
    return null
  }
  return recognition
}
