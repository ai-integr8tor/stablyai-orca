import { describe, expect, it } from 'vitest'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { createTestStore } from './store-test-helpers'

describe('terminal paneKey mirror', () => {
  it('bridges stable paneKeys to numeric pane title state without migrating title keys', () => {
    const store = createTestStore()
    const oldPaneKey = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')
    const adoptedPaneKey = makePaneKey('tab-1', '22222222-2222-4222-8222-222222222222')

    store.getState().setRuntimePaneTitle('tab-1', 7, 'Claude Code')
    store.getState().registerPaneKeyMapping(oldPaneKey, 7)

    expect(store.getState().numericPaneIdByPaneKey).toEqual({
      [oldPaneKey]: 7
    })

    // Why: PaneManager can adopt a restored stablePaneId after it has already
    // minted a temporary one, but runtimePaneTitlesByTabId is renderer-live
    // numeric state. The mirror changes; the title map should not.
    store.getState().unregisterPaneKeyMapping(oldPaneKey)
    store.getState().registerPaneKeyMapping(adoptedPaneKey, 7)

    expect(store.getState().numericPaneIdByPaneKey).toEqual({
      [adoptedPaneKey]: 7
    })
    expect(store.getState().runtimePaneTitlesByTabId).toEqual({
      'tab-1': { 7: 'Claude Code' }
    })

    store.getState().unregisterPaneKeyMapping(adoptedPaneKey)

    expect(store.getState().numericPaneIdByPaneKey).toEqual({})
    expect(store.getState().runtimePaneTitlesByTabId).toEqual({
      'tab-1': { 7: 'Claude Code' }
    })
  })

  it('preserves terminal stablePaneId layout while splitting tab groups and moving tabs', () => {
    const store = createTestStore()
    const worktreeId = 'repo1::/path/wt1'
    const terminalTab = store.getState().createUnifiedTab(worktreeId, 'terminal', {
      id: 'terminal-tab'
    })
    const sourceGroupId = terminalTab.groupId
    const layout = {
      root: {
        type: 'split' as const,
        direction: 'vertical' as const,
        first: { type: 'leaf' as const, leafId: 'pane:1' },
        second: { type: 'leaf' as const, leafId: 'pane:2' }
      },
      activeLeafId: 'pane:2',
      expandedLeafId: null,
      stablePaneIdByLeafId: {
        'pane:1': '11111111-1111-4111-8111-111111111111',
        'pane:2': '22222222-2222-4222-8222-222222222222'
      }
    }
    store.getState().setTabLayout(terminalTab.id, layout)

    const targetGroupId = store.getState().createEmptySplitGroup(worktreeId, sourceGroupId, 'right')
    if (!targetGroupId) {
      throw new Error('expected createEmptySplitGroup to return a group id')
    }
    const moved = store
      .getState()
      .moveUnifiedTabToGroup(terminalTab.id, targetGroupId, { activate: true })

    expect(moved).toBe(true)
    // Why: split groups and tab moves only change where the terminal tab is
    // shown. The per-pane stable UUIDs live in the tab's terminal layout and
    // must not be regenerated or reassigned by tab-group operations.
    expect(store.getState().terminalLayoutsByTabId[terminalTab.id]).toEqual(layout)
  })
})
