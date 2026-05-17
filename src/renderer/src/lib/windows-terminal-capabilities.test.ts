import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getCachedWindowsTerminalCapabilities,
  loadWindowsTerminalCapabilities,
  resetWindowsTerminalCapabilitiesForTests
} from './windows-terminal-capabilities'

function stubTerminalCapabilityApi(args: { wslAvailable: boolean; pwshAvailable: boolean }): {
  wslIsAvailable: ReturnType<typeof vi.fn>
  pwshIsAvailable: ReturnType<typeof vi.fn>
} {
  const wslIsAvailable = vi.fn().mockResolvedValue(args.wslAvailable)
  const pwshIsAvailable = vi.fn().mockResolvedValue(args.pwshAvailable)

  vi.stubGlobal('window', {
    api: {
      wsl: { isAvailable: wslIsAvailable },
      pwsh: { isAvailable: pwshIsAvailable }
    }
  })

  return { wslIsAvailable, pwshIsAvailable }
}

describe('windows terminal capabilities', () => {
  afterEach(() => {
    resetWindowsTerminalCapabilitiesForTests()
    vi.unstubAllGlobals()
  })

  it('shares WSL and PowerShell availability between terminal UI consumers', async () => {
    const { wslIsAvailable, pwshIsAvailable } = stubTerminalCapabilityApi({
      wslAvailable: true,
      pwshAvailable: true
    })

    expect(getCachedWindowsTerminalCapabilities()).toEqual({
      wslAvailable: false,
      pwshAvailable: false
    })

    await expect(loadWindowsTerminalCapabilities()).resolves.toEqual({
      wslAvailable: true,
      pwshAvailable: true
    })
    expect(getCachedWindowsTerminalCapabilities()).toEqual({
      wslAvailable: true,
      pwshAvailable: true
    })

    await loadWindowsTerminalCapabilities()
    expect(wslIsAvailable).toHaveBeenCalledTimes(1)
    expect(pwshIsAvailable).toHaveBeenCalledTimes(1)
  })

  it('coalesces simultaneous availability requests', async () => {
    const { wslIsAvailable, pwshIsAvailable } = stubTerminalCapabilityApi({
      wslAvailable: true,
      pwshAvailable: false
    })

    const [first, second] = await Promise.all([
      loadWindowsTerminalCapabilities(),
      loadWindowsTerminalCapabilities()
    ])

    expect(first).toEqual({ wslAvailable: true, pwshAvailable: false })
    expect(second).toEqual(first)
    expect(wslIsAvailable).toHaveBeenCalledTimes(1)
    expect(pwshIsAvailable).toHaveBeenCalledTimes(1)
  })

  it('keeps WSL available when the PowerShell version probe fails', async () => {
    const wslIsAvailable = vi.fn().mockResolvedValue(true)
    const pwshIsAvailable = vi.fn().mockRejectedValue(new Error('pwsh probe failed'))
    vi.stubGlobal('window', {
      api: {
        wsl: { isAvailable: wslIsAvailable },
        pwsh: { isAvailable: pwshIsAvailable }
      }
    })

    await expect(loadWindowsTerminalCapabilities()).resolves.toEqual({
      wslAvailable: true,
      pwshAvailable: false
    })
  })
})
