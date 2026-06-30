import { isCodexTerminalStartupCommand } from './terminal-startup-command-classifier'

const CODEX_UPDATE_SUCCESS_TEXT = 'Update ran successfully! Please restart Codex.'
const CODEX_UPDATE_OUTPUT_TAIL_CHARS = 1024
const CODEX_RELAUNCH_FIRST_CHECK_MS = 250
const CODEX_RELAUNCH_POLL_MS = 250
const CODEX_RELAUNCH_MAX_WAIT_MS = 15_000

type CodexAutoRelaunchAfterUpdateOptions = {
  startupCommand: string | null | undefined
  getPtyId: () => string | null
  inspectForegroundProcess: (ptyId: string) => Promise<string | null>
  sendInput: (data: string) => boolean
  isDisposed: () => boolean
  now?: () => number
}

export type CodexAutoRelaunchAfterUpdate = {
  observeOutput: (data: string) => void
  dispose: () => void
}

function normalizeProcessName(processName: string | null): string | null {
  if (!processName) {
    return null
  }
  const pathSegment = processName.split(/[\\/]/).at(-1) ?? processName
  return pathSegment.toLowerCase().replace(/\.exe$/, '')
}

export function isCodexForegroundProcessName(processName: string | null): boolean {
  const normalized = normalizeProcessName(processName)
  return normalized === 'codex' || normalized?.startsWith('codex-') === true
}

export function createCodexAutoRelaunchAfterUpdate(
  options: CodexAutoRelaunchAfterUpdateOptions
): CodexAutoRelaunchAfterUpdate {
  const startupCommand = options.startupCommand
  const isEligibleStartup = Boolean(startupCommand && isCodexTerminalStartupCommand(startupCommand))
  const now = options.now ?? Date.now
  let outputTail = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  let observedSuccessfulUpdate = false
  let relaunched = false
  let firstObservedAt = 0

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const scheduleCheck = (delayMs: number): void => {
    if (relaunched || options.isDisposed()) {
      return
    }
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      void checkForegroundAndRelaunch()
    }, delayMs)
  }

  const checkForegroundAndRelaunch = async (): Promise<void> => {
    if (!startupCommand || relaunched || options.isDisposed()) {
      return
    }
    const ptyId = options.getPtyId()
    if (!ptyId) {
      return
    }

    let foregroundProcess: string | null = null
    try {
      foregroundProcess = await options.inspectForegroundProcess(ptyId)
    } catch {
      foregroundProcess = null
    }

    if (relaunched || options.isDisposed()) {
      return
    }

    if (!isCodexForegroundProcessName(foregroundProcess)) {
      // Why: Codex exits after self-update instead of execing the new CLI.
      // Repeat only Orca's original Codex startup command once Codex is gone.
      relaunched = options.sendInput(`${startupCommand}\r`)
      return
    }

    if (now() - firstObservedAt < CODEX_RELAUNCH_MAX_WAIT_MS) {
      scheduleCheck(CODEX_RELAUNCH_POLL_MS)
    }
  }

  return {
    observeOutput(data) {
      if (!isEligibleStartup || observedSuccessfulUpdate || relaunched || options.isDisposed()) {
        return
      }
      outputTail = (outputTail + data).slice(-CODEX_UPDATE_OUTPUT_TAIL_CHARS)
      if (!outputTail.includes(CODEX_UPDATE_SUCCESS_TEXT)) {
        return
      }
      observedSuccessfulUpdate = true
      firstObservedAt = now()
      scheduleCheck(CODEX_RELAUNCH_FIRST_CHECK_MS)
    },
    dispose() {
      clearTimer()
    }
  }
}
