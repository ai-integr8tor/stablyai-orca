import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearNativeChatSideQuestContext,
  clearNativeChatSideQuestContextCacheForTests,
  readNativeChatSideQuestContext,
  seedNativeChatSideQuestContext
} from './native-chat-side-quest-context-cache'

describe('native chat Side Quest context cache', () => {
  beforeEach(() => clearNativeChatSideQuestContextCacheForTests())

  it('keeps the pending quote scoped to its terminal tab', () => {
    seedNativeChatSideQuestContext('tab-1', { sourceLabel: 'Codex', text: 'selected output' })

    expect(readNativeChatSideQuestContext('tab-1')).toEqual({
      sourceLabel: 'Codex',
      text: 'selected output'
    })
    expect(readNativeChatSideQuestContext('tab-2')).toBeNull()
  })

  it('clears a quote after it is removed or sent', () => {
    seedNativeChatSideQuestContext('tab-1', { sourceLabel: 'Terminal', text: 'context' })

    clearNativeChatSideQuestContext('tab-1')

    expect(readNativeChatSideQuestContext('tab-1')).toBeNull()
  })
})
