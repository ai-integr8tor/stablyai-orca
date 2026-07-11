// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalSideQuestSelectionAction } from './TerminalSideQuestSelectionAction'

afterEach(cleanup)

describe('TerminalSideQuestSelectionAction', () => {
  it('starts a Side Quest and preserves terminal selection on pointer down', () => {
    const onStart = vi.fn()
    const onParentPointerDown = vi.fn()
    render(
      <div onPointerDown={onParentPointerDown}>
        <TerminalSideQuestSelectionAction
          point={{ x: 100, y: 80 }}
          onStart={onStart}
          onDismiss={vi.fn()}
        />
      </div>
    )
    const button = screen.getByRole('button', { name: 'Add to Side Quest' })

    const wasNotCancelled = fireEvent.pointerDown(button)
    fireEvent.click(button)

    expect(wasNotCancelled).toBe(false)
    expect(onParentPointerDown).not.toHaveBeenCalled()
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('dismisses on Escape', () => {
    const onDismiss = vi.fn()
    render(
      <TerminalSideQuestSelectionAction
        point={{ x: 100, y: 80 }}
        onStart={vi.fn()}
        onDismiss={onDismiss}
      />
    )

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
