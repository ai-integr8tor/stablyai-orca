import { describe, expect, it } from 'vitest'
import { decideActivateWindowAction } from './activate-window-policy'

describe('decideActivateWindowAction', () => {
  it('shows a hidden-but-live main window (keepServingOnClose Dock restore)', () => {
    expect(
      decideActivateWindowAction({
        isQuittingForUpdate: false,
        hasLiveMainWindow: true,
        openWindowCount: 1
      })
    ).toBe('show-existing')
  })

  it('opens a new window when the main window is gone and no windows remain', () => {
    expect(
      decideActivateWindowAction({
        isQuittingForUpdate: false,
        hasLiveMainWindow: false,
        openWindowCount: 0
      })
    ).toBe('open-new')
  })

  it('does nothing when the main window is gone but other windows are open', () => {
    expect(
      decideActivateWindowAction({
        isQuittingForUpdate: false,
        hasLiveMainWindow: false,
        openWindowCount: 2
      })
    ).toBe('none')
  })

  it('does nothing while quitting for an update, even with a live window', () => {
    expect(
      decideActivateWindowAction({
        isQuittingForUpdate: true,
        hasLiveMainWindow: true,
        openWindowCount: 1
      })
    ).toBe('none')
  })

  it('does nothing while quitting for an update, even with zero windows', () => {
    expect(
      decideActivateWindowAction({
        isQuittingForUpdate: true,
        hasLiveMainWindow: false,
        openWindowCount: 0
      })
    ).toBe('none')
  })
})
