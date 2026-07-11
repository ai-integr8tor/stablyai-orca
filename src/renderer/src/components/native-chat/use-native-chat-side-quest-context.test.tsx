// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearNativeChatSideQuestContextCacheForTests,
  readNativeChatSideQuestContext,
  seedNativeChatSideQuestContext
} from './native-chat-side-quest-context-cache'
import {
  clearNativeChatSideQuestReadinessCacheForTests,
  seedNativeChatSideQuestReadiness
} from './native-chat-side-quest-readiness-cache'
import { useNativeChatSideQuestContext } from './use-native-chat-side-quest-context'

describe('useNativeChatSideQuestContext', () => {
  beforeEach(() => {
    clearNativeChatSideQuestContextCacheForTests()
    clearNativeChatSideQuestReadinessCacheForTests()
  })

  it('builds the first question with the pending quote and clears it after send', () => {
    seedNativeChatSideQuestContext('tab-1', { sourceLabel: 'Tests', text: 'exit 1' })
    const { result } = renderHook(() => useNativeChatSideQuestContext('tab-1'))

    expect(result.current.buildSubmittedText('Why?', false)).toContain(
      'Quoted terminal output:\n```text\nexit 1\n```'
    )
    act(() => result.current.clearContext())
    expect(result.current.context).toBeNull()
    expect(readNativeChatSideQuestContext('tab-1')).toBeNull()
  })

  it('leaves slash commands untouched and keeps their quoted context pending', () => {
    seedNativeChatSideQuestContext('tab-1', { sourceLabel: 'Tests', text: 'exit 1' })
    const { result } = renderHook(() => useNativeChatSideQuestContext('tab-1'))

    expect(result.current.buildSubmittedText('/clear', true)).toBe('/clear')
    expect(result.current.context?.text).toBe('exit 1')
  })

  it('tracks launch-time agent input readiness', async () => {
    let resolveReadiness: (ready: boolean) => void = () => {}
    seedNativeChatSideQuestReadiness(
      'tab-1',
      new Promise<boolean>((resolve) => {
        resolveReadiness = resolve
      })
    )
    const { result } = renderHook(() => useNativeChatSideQuestContext('tab-1'))

    expect(result.current.readiness).toBe('starting')
    await act(async () => resolveReadiness(true))
    expect(result.current.readiness).toBe('ready')
  })
})
