import { describe, expect, it, vi } from 'vitest'
import { createOrcaDeepLinkRouter } from './orca-deep-link-router'

function makeDeps(overrides: Partial<Parameters<typeof createOrcaDeepLinkRouter>[0]> = {}) {
  return {
    isReady: () => true,
    focusWindow: vi.fn(),
    focusTerminalByHandle: vi.fn().mockResolvedValue(undefined),
    onError: vi.fn(),
    ...overrides
  }
}

describe('createOrcaDeepLinkRouter', () => {
  it('focuses the window and the terminal for a valid focus link', () => {
    const deps = makeDeps()
    createOrcaDeepLinkRouter(deps).route('orca://focus/term_1')
    expect(deps.focusWindow).toHaveBeenCalledTimes(1)
    expect(deps.focusTerminalByHandle).toHaveBeenCalledWith('term_1')
  })

  it('ignores unrecognized links without focusing the window', () => {
    const deps = makeDeps()
    const router = createOrcaDeepLinkRouter(deps)
    router.route('orca://pair?code=xyz')
    router.route('https://example.com')
    expect(deps.focusWindow).not.toHaveBeenCalled()
    expect(deps.focusTerminalByHandle).not.toHaveBeenCalled()
  })

  it('defers links that arrive before the app is ready, then replays on flush', () => {
    let ready = false
    const deps = makeDeps({ isReady: () => ready })
    const router = createOrcaDeepLinkRouter(deps)

    router.route('orca://focus/term_cold')
    expect(deps.focusTerminalByHandle).not.toHaveBeenCalled()

    ready = true
    router.flushPending()
    expect(deps.focusTerminalByHandle).toHaveBeenCalledWith('term_cold')
  })

  it('only replays the most recent deferred link', () => {
    let ready = false
    const deps = makeDeps({ isReady: () => ready })
    const router = createOrcaDeepLinkRouter(deps)

    router.route('orca://focus/term_old')
    router.route('orca://focus/term_new')
    ready = true
    router.flushPending()

    expect(deps.focusTerminalByHandle).toHaveBeenCalledTimes(1)
    expect(deps.focusTerminalByHandle).toHaveBeenCalledWith('term_new')
  })

  it('reports focus errors through onError', async () => {
    const error = new Error('terminal_exited')
    const deps = makeDeps({ focusTerminalByHandle: vi.fn().mockRejectedValue(error) })
    createOrcaDeepLinkRouter(deps).route('orca://focus/term_dead')
    await Promise.resolve()
    await Promise.resolve()
    expect(deps.onError).toHaveBeenCalledWith(error, 'orca://focus/term_dead')
  })
})
