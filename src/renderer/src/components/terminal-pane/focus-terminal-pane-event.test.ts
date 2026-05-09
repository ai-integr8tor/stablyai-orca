import { describe, expect, it, vi } from 'vitest'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { handleFocusTerminalPaneDetail } from './focus-terminal-pane-event'

function makeDeps(overrides: Partial<Parameters<typeof handleFocusTerminalPaneDetail>[1]> = {}) {
  const manager = {
    getNumericIdForStable: vi.fn(() => 7),
    setActivePane: vi.fn()
  }
  return {
    tabId: 'tab-1',
    manager,
    acknowledgeAgents: vi.fn(),
    surfaceStaleAgentRow: vi.fn(),
    ...overrides
  }
}

describe('handleFocusTerminalPaneDetail', () => {
  it('focuses by stablePaneId and acks only after numeric focus resolves', () => {
    const stablePaneId = '11111111-1111-4111-8111-111111111111'
    const paneKey = makePaneKey('tab-1', stablePaneId)
    const deps = makeDeps()

    handleFocusTerminalPaneDetail(
      { tabId: 'tab-1', stablePaneId, ackPaneKeyOnSuccess: paneKey },
      deps
    )

    expect(deps.manager?.getNumericIdForStable).toHaveBeenCalledWith(stablePaneId)
    expect(deps.manager?.setActivePane).toHaveBeenCalledWith(7, { focus: true })
    expect(deps.acknowledgeAgents).toHaveBeenCalledWith([paneKey])
    expect(deps.surfaceStaleAgentRow).not.toHaveBeenCalled()
  })

  it('surfaces stale rows without focusing or acking when the stablePaneId is gone', () => {
    const stablePaneId = '22222222-2222-4222-8222-222222222222'
    const paneKey = makePaneKey('tab-1', stablePaneId)
    const manager = {
      getNumericIdForStable: vi.fn(() => null),
      setActivePane: vi.fn()
    }
    const deps = makeDeps({ manager })

    handleFocusTerminalPaneDetail(
      { tabId: 'tab-1', stablePaneId, ackPaneKeyOnSuccess: paneKey },
      deps
    )

    expect(manager.setActivePane).not.toHaveBeenCalled()
    expect(deps.acknowledgeAgents).not.toHaveBeenCalled()
    expect(deps.surfaceStaleAgentRow).toHaveBeenCalledWith('tab-1', stablePaneId)
  })

  it('ignores tab-only activations and events for other tabs', () => {
    const deps = makeDeps()

    handleFocusTerminalPaneDetail({ tabId: 'tab-1', stablePaneId: null }, deps)
    handleFocusTerminalPaneDetail(
      {
        tabId: 'tab-2',
        stablePaneId: '33333333-3333-4333-8333-333333333333'
      },
      deps
    )

    expect(deps.manager?.getNumericIdForStable).not.toHaveBeenCalled()
    expect(deps.manager?.setActivePane).not.toHaveBeenCalled()
    expect(deps.acknowledgeAgents).not.toHaveBeenCalled()
    expect(deps.surfaceStaleAgentRow).not.toHaveBeenCalled()
  })
})
