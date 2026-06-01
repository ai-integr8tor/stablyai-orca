import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const READY_PANE_KEY = 'tab-1:11111111-1111-4111-8111-111111111111'
const WORKING_PANE_KEY = 'tab-1:22222222-2222-4222-8222-222222222222'

let mockAgents: unknown[] = []
let mockStoreState: Record<string, unknown> = {}
const mockSendPromptToSidebarAgentTarget = vi.fn()

function agentRow(paneKey: string, state: string, now: number): unknown {
  return {
    paneKey,
    tab: { id: 'tab-1' },
    state,
    entry: { stateStartedAt: now, orchestration: undefined }
  }
}

function storeAgent(paneKey: string, state: string, prompt: string, now: number): unknown {
  return {
    state,
    prompt,
    updatedAt: now,
    stateStartedAt: now,
    agentType: 'codex',
    paneKey,
    stateHistory: []
  }
}

function activeTargetMode(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'send-1',
    worktreeId: 'wt-1',
    source: 'diff-notes',
    prompt: 'Review this',
    label: 'Send',
    launchSource: 'diff-notes',
    eligiblePaneKeys: [],
    disabledPaneKeys: {},
    status: 'open',
    ...extra
  }
}

function targetStoreState(now: number): Record<string, unknown> {
  return {
    agentStatusByPaneKey: {
      [READY_PANE_KEY]: storeAgent(READY_PANE_KEY, 'done', 'Ready', now),
      [WORKING_PANE_KEY]: storeAgent(WORKING_PANE_KEY, 'working', 'Busy', now)
    },
    tabsByWorktree: {
      'wt-1': [{ id: 'tab-1' }]
    },
    terminalLayoutsByTabId: {
      'tab-1': {
        ptyIdsByLeafId: {
          '11111111-1111-4111-8111-111111111111': 'pty-1',
          '22222222-2222-4222-8222-222222222222': 'pty-2'
        }
      }
    }
  }
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      agentActivityDisplayMode: 'full',
      acknowledgedAgentsByPaneKey: {},
      settings: { experimentalAgentTerminalPopover: false },
      dropAgentStatus: vi.fn(),
      dismissRetainedAgent: vi.fn(),
      acknowledgeAgents: vi.fn(),
      agentSendPopoverTargetMode: null,
      agentStatusByPaneKey: {},
      agentStatusEpoch: 0,
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      sendPromptToSidebarAgentTarget: mockSendPromptToSidebarAgentTarget,
      ...mockStoreState
    })
}))

vi.mock('./useWorktreeAgentRows', () => ({
  useWorktreeAgentRows: vi.fn(() => mockAgents)
}))

vi.mock('@/components/dashboard/useNow', () => ({
  useNow: vi.fn(() => 2000)
}))

vi.mock('@/components/dashboard/DashboardAgentRow', () => ({
  default: ({
    agent,
    sendTargetStatus,
    sendTargetDisabledReason,
    onSendTargetClick,
    renderRowPopover
  }: {
    agent: { paneKey: string }
    sendTargetStatus?: 'eligible' | 'disabled' | 'sending'
    sendTargetDisabledReason?: string
    onSendTargetClick?: (paneKey: string) => void
    renderRowPopover?: (args: {
      children: ReactNode
      agentName: string
      statusLabel: string
    }) => ReactNode
  }) => {
    const row = (
      <div
        data-agent-send-target={sendTargetStatus}
        data-disabled-reason={sendTargetDisabledReason}
        data-has-send-handler={typeof onSendTargetClick === 'function' ? 'true' : 'false'}
        data-pane-key={agent.paneKey}
        data-popover={renderRowPopover ? 'true' : 'false'}
      />
    )
    return renderRowPopover
      ? renderRowPopover({ children: row, agentName: agent.paneKey, statusLabel: 'Working' })
      : row
  }
}))

vi.mock('./focused-agent-row-highlight', () => ({
  useFocusedAgentPaneKey: vi.fn(() => null)
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

describe('WorktreeCardAgents send targets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const now = Date.now()
    mockAgents = [agentRow(READY_PANE_KEY, 'done', now), agentRow(WORKING_PANE_KEY, 'working', now)]
    mockStoreState = {
      ...targetStoreState(now),
      agentSendPopoverTargetMode: activeTargetMode()
    }
  })

  it('marks eligible active-worktree rows and disables working send targets', async () => {
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    const markup = renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)

    expect(markup).toContain('data-agent-send-target="eligible"')
    expect(markup).toContain(`data-pane-key="${READY_PANE_KEY}"`)
    expect(markup).toContain('data-agent-send-target="disabled"')
    expect(markup).toContain('data-disabled-reason="Agent is working"')
    expect(markup).toContain(`data-pane-key="${WORKING_PANE_KEY}"`)
    expect(markup).toContain('data-has-send-handler="true"')
  })

  it('does not wire terminal popovers while the send-target dropdown is choosing a row', async () => {
    mockStoreState = {
      ...mockStoreState,
      settings: { experimentalAgentTerminalPopover: true }
    }
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    const markup = renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)

    expect(markup).toContain('data-agent-send-target="eligible"')
    expect(markup).toContain(`data-pane-key="${READY_PANE_KEY}" data-popover="false"`)
    expect(markup).toContain(`data-pane-key="${WORKING_PANE_KEY}" data-popover="false"`)
  })

  it('shows selectable agent rows while target selection is active in compact mode', async () => {
    mockStoreState = {
      ...mockStoreState,
      agentActivityDisplayMode: 'compact'
    }
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    const markup = renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)

    expect(markup).toContain('data-agent-send-target="eligible"')
    expect(markup).toContain(`data-pane-key="${READY_PANE_KEY}"`)
    expect(markup).toContain('data-agent-send-target="disabled"')
    expect(markup).toContain(`data-pane-key="${WORKING_PANE_KEY}"`)
    expect(markup).toContain('data-has-send-handler="true"')
  })

  it('leaves other worktree rows in ordinary mode during target selection', async () => {
    mockStoreState = {
      agentSendPopoverTargetMode: activeTargetMode({ worktreeId: 'wt-other' })
    }
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    const markup = renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)

    expect(markup).toContain(`data-pane-key="${READY_PANE_KEY}"`)
    expect(markup).not.toContain('data-agent-send-target="eligible"')
    expect(markup).not.toContain('data-agent-send-target="disabled"')
    expect(markup).toContain('data-has-send-handler="false"')
  })

  it('marks the currently sending row', async () => {
    const now = Date.now()
    mockAgents = [agentRow(READY_PANE_KEY, 'done', now)]
    mockStoreState = {
      ...targetStoreState(now),
      agentSendPopoverTargetMode: activeTargetMode({
        eligiblePaneKeys: [READY_PANE_KEY],
        status: 'sending',
        sendingPaneKey: READY_PANE_KEY
      })
    }
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    const markup = renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)

    expect(markup).toContain('data-agent-send-target="sending"')
    expect(markup).toContain('data-disabled-reason="Sending..."')
    expect(markup).toContain(`data-pane-key="${READY_PANE_KEY}"`)
  })
})
