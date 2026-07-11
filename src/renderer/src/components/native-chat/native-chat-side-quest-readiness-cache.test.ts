import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearNativeChatSideQuestReadinessCacheForTests,
  readNativeChatSideQuestReadiness,
  seedNativeChatSideQuestReadiness
} from './native-chat-side-quest-readiness-cache'

describe('native chat Side Quest readiness cache', () => {
  beforeEach(() => clearNativeChatSideQuestReadinessCacheForTests())

  it('binds the launch-time readiness wait to the created terminal tab', async () => {
    const readiness = Promise.resolve(true)
    seedNativeChatSideQuestReadiness('side-tab', readiness)

    expect(readNativeChatSideQuestReadiness('side-tab')).toBe(readiness)
    await expect(readNativeChatSideQuestReadiness('side-tab')).resolves.toBe(true)
  })
})
