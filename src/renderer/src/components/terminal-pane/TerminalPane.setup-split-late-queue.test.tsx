import { beforeEach, describe, expect, it, vi } from 'vitest'

type SetupSplit = {
  command: string
  env?: Record<string, string>
  direction: 'vertical' | 'horizontal'
}

const mockStateValues: unknown[] = []
const mockStateInitialized: boolean[] = []
let mockStateIndex = 0
const lifecycleCalls: { setupSplit: SetupSplit | null | undefined }[] = []

const mockStore = {
  pendingStartupByTabId: {} as Record<string, unknown>,
  pendingSetupSplitByTabId: {} as Record<string, SetupSplit>,
  pendingIssueCommandSplitByTabId: {} as Record<string, unknown>,
  pendingCodexPaneRestartIds: {},
  terminalLayoutsByTabId: {},
  worktreesByRepo: {},
  repos: [],
  settings: {
    terminalQuickCommands: []
  },
  setTabPaneExpanded: vi.fn(),
  setTabCanExpandPane: vi.fn(),
  suppressPtyExit: vi.fn(),
  consumePendingCodexPaneRestart: vi.fn(),
  clearCodexRestartNotice: vi.fn(),
  setTabLayout: vi.fn(),
  updateTabTitle: vi.fn(),
  setRuntimePaneTitle: vi.fn(),
  clearRuntimePaneTitle: vi.fn(),
  updateTabPtyId: vi.fn(),
  clearTabPtyId: vi.fn(),
  markWorktreeUnread: vi.fn(),
  markTerminalTabUnread: vi.fn(),
  clearWorktreeUnread: vi.fn(),
  clearTerminalTabUnread: vi.fn(),
  consumeTabStartupCommand: vi.fn(),
  consumeTabSetupSplit: vi.fn(),
  consumeTabIssueCommandSplit: vi.fn(),
  setCacheTimerStartedAt: vi.fn(),
  consumeSuppressedPtyExit: vi.fn()
}

function resetRenderCursor() {
  mockStateIndex = 0
}

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react') // eslint-disable-line @typescript-eslint/consistent-type-imports -- vi.importActual requires inline import()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = mockStateIndex++
      if (!mockStateInitialized[i]) {
        mockStateValues[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial
        mockStateInitialized[i] = true
      }
      const setter = (value: unknown) => {
        mockStateValues[i] =
          typeof value === 'function'
            ? (value as (prev: unknown) => unknown)(mockStateValues[i])
            : value
      }
      return [mockStateValues[i], setter]
    },
    useRef: (initial: unknown) => ({ current: initial }),
    useEffect: () => undefined,
    useLayoutEffect: () => undefined,
    useCallback: (fn: unknown) => fn
  }
})

vi.mock('../../store', () => {
  const useAppStore = (selector: (state: typeof mockStore) => unknown) => selector(mockStore)
  useAppStore.getState = () => mockStore
  return { useAppStore }
})

vi.mock('@/lib/terminal-theme', () => ({
  DEFAULT_TERMINAL_DIVIDER_DARK: '#000',
  normalizeColor: (value: string | undefined, fallback: string) => value ?? fallback,
  resolveEffectiveTerminalAppearance: () => ({ dividerColor: '#000' })
}))

vi.mock('@/lib/connection-context', () => ({
  getConnectionId: () => null
}))

vi.mock('./terminal-drop-handler', () => ({
  resolveTerminalDropTargetShell: () => 'bash'
}))

vi.mock('./layout-serialization', () => ({
  EMPTY_LAYOUT: {},
  serializeTerminalLayout: () => ({})
}))

vi.mock('../../../../shared/stable-pane-id', () => ({
  makePaneKey: (tabId: string, leafId: string) => `${tabId}:${leafId}`
}))

vi.mock('./expand-collapse', () => ({
  applyExpandedLayoutTo: vi.fn(),
  restoreExpandedLayoutFrom: vi.fn(),
  createExpandCollapseActions: () => ({
    setExpandedPane: vi.fn(),
    restoreExpandedLayout: vi.fn(),
    refreshPaneSizes: vi.fn(),
    syncExpandedLayout: vi.fn(),
    toggleExpandPane: vi.fn()
  })
}))

vi.mock('./keyboard-handlers', () => ({
  useTerminalKeyboardShortcuts: vi.fn()
}))

vi.mock('@/lib/keyboard-layout/use-effective-mac-option-as-alt', () => ({
  useEffectiveMacOptionAsAlt: () => 'true'
}))

vi.mock('./useTerminalFontZoom', () => ({
  useTerminalFontZoom: vi.fn()
}))

vi.mock('./use-system-prefers-dark', () => ({
  useSystemPrefersDark: () => true
}))

vi.mock('./use-terminal-pane-global-effects', () => ({
  useTerminalPaneGlobalEffects: vi.fn()
}))

vi.mock('./use-terminal-pane-lifecycle', () => ({
  useTerminalPaneLifecycle: (deps: { setupSplit?: SetupSplit | null }) => {
    lifecycleCalls.push({ setupSplit: deps.setupSplit })
  }
}))

vi.mock('./use-terminal-pane-context-menu', () => ({
  useTerminalPaneContextMenu: () => ({
    open: false,
    setOpen: vi.fn(),
    point: null,
    menuOpenedAtRef: { current: 0 },
    paneCount: 1,
    menuPaneId: null,
    onContextMenuCapture: vi.fn(),
    onCopy: vi.fn(),
    onPaste: vi.fn(),
    onSplitRight: vi.fn(),
    onSplitDown: vi.fn(),
    onEqualizePaneSizes: vi.fn(),
    onClosePane: vi.fn(),
    onClearScreen: vi.fn(),
    onQuickCommand: vi.fn(),
    onToggleExpand: vi.fn(),
    onSetTitle: vi.fn()
  })
}))

vi.mock('./use-notification-dispatch', () => ({
  useNotificationDispatch: () => vi.fn()
}))

vi.mock('./pty-connection', () => ({
  connectPanePty: vi.fn()
}))

vi.mock('../../../../shared/workspace-session-terminal-buffers', () => ({
  shouldPreserveTerminalScrollbackBuffers: () => true
}))

vi.mock('@/lib/pane-manager/mobile-fit-overrides', () => ({
  getFitOverrideForPty: () => null,
  onOverrideChange: () => vi.fn()
}))

vi.mock('@/lib/pane-manager/mobile-driver-state', () => ({
  getDriverForPty: () => ({ kind: 'none' }),
  onDriverChange: () => vi.fn()
}))

vi.mock('@/lib/pane-manager/pane-key-resolution', () => ({
  resolvePaneKeyForManager: () => ({ status: 'missing' })
}))

vi.mock('@/lib/pane-manager/pane-tree-ops', () => ({
  safeFit: vi.fn()
}))

vi.mock('./terminal-shutdown-layout-capture', () => ({
  captureTerminalShutdownLayout: () => ({})
}))

vi.mock('@/runtime/runtime-terminal-inspection', () => ({
  inspectRuntimeTerminalProcess: vi.fn()
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: vi.fn()
}))

vi.mock('@/runtime/runtime-terminal-stream', () => ({
  getRemoteRuntimePtyEnvironmentId: () => null,
  getRemoteRuntimeTerminalHandle: () => null
}))

vi.mock('@/lib/primary-selection', () => ({
  isPrimarySelectionEnabled: () => false,
  readPrimarySelectionText: vi.fn()
}))

vi.mock('./shutdown-buffer-captures', () => ({
  shutdownBufferCaptures: new Map()
}))

vi.mock('./merge-captured-leaf-state', () => ({
  mergeCapturedLeafState: () => ({})
}))

vi.mock('./pane-helpers', () => ({
  fitPanes: vi.fn(),
  isWindowsUserAgent: () => false,
  shellEscapePath: (value: string) => value
}))

vi.mock('@/lib/pane-manager/pane-manager', () => ({
  PaneManager: class {}
}))

vi.mock('./TerminalSearch', () => ({
  default: function TerminalSearch() {
    return null
  }
}))

vi.mock('./CloseTerminalDialog', () => ({
  default: function CloseTerminalDialog() {
    return null
  }
}))

vi.mock('./MobileDriverOverlay', () => ({
  MobileDriverOverlay: function MobileDriverOverlay() {
    return null
  }
}))

vi.mock('./TerminalErrorToast', () => ({
  TerminalErrorToast: function TerminalErrorToast() {
    return null
  }
}))

vi.mock('./TerminalContextMenu', () => ({
  default: function TerminalContextMenu() {
    return null
  }
}))

import TerminalPane from './TerminalPane'

function renderPane() {
  resetRenderCursor()
  TerminalPane({
    tabId: 'tab-1',
    worktreeId: 'wt-1',
    cwd: 'C:\\repo',
    isActive: true,
    onPtyExit: vi.fn(),
    onCloseTab: vi.fn()
  })
}

describe('TerminalPane late setup split queueing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStateValues.length = 0
    mockStateInitialized.length = 0
    lifecycleCalls.length = 0
    mockStore.pendingSetupSplitByTabId = {}
  })

  it('passes a setup split queued after the first render into the lifecycle', () => {
    renderPane()
    expect(lifecycleCalls.at(-1)?.setupSplit).toBeUndefined()

    const setupSplit: SetupSplit = {
      command: 'bash .git/orca/setup-runner.sh',
      env: { ORCA_ROLE: 'setup' },
      direction: 'vertical'
    }
    mockStore.pendingSetupSplitByTabId = { 'tab-1': setupSplit }

    renderPane()

    expect(lifecycleCalls.at(-1)?.setupSplit).toEqual(setupSplit)
  })
})
