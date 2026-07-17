import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentStateDot, type AgentDotState } from './AgentStateDot'

function renderMarkup(state: AgentDotState): string {
  return renderToStaticMarkup(React.createElement(AgentStateDot, { state }))
}

function renderDotClassNames(state: AgentDotState): string[] {
  const markup = renderMarkup(state)
  const dotClassName = markup.match(/<span class="([^"]*rounded-full[^"]*)"/)?.[1]

  expect(dotClassName).toBeDefined()

  return dotClassName!.split(/\s+/)
}

describe('AgentStateDot', () => {
  it('renders working as a yellow spinner', () => {
    const markup = renderMarkup('working')

    expect(markup).toContain('border-yellow-500')
    expect(markup).toContain('border-t-transparent')
    expect(markup).toContain('[animation:spin_1s_steps(12,end)_infinite]')
    expect(markup).toContain('motion-reduce:animate-none')
    expect(markup).not.toContain('animate-spin')
  })

  it('renders done as an emerald check icon', () => {
    const markup = renderMarkup('done')

    // Why: 'done' renders a CircleCheck icon rather than a dot so it is
    // visually distinct from other emerald-adjacent states across surfaces.
    // Note: the sidebar's StatusIndicator intentionally diverges and uses an
    // emerald dot for 'done'. Assertion targets the lucide 'circle-check'
    // class hook + emerald text color, identifying the check icon without
    // coupling to the exact SVG path markup lucide emits.
    expect(markup).toContain('lucide-circle-check')
    expect(markup).toContain('text-emerald-500')
  })

  it('renders compacting as a pulsing sky collapse glyph, distinct from working and done', () => {
    const markup = renderMarkup('compacting')

    // Why: compaction is a live phase of a working turn, so it must not reuse
    // the yellow working spinner or the emerald done check — its own glyph is
    // the whole point of surfacing the phase.
    expect(markup).toContain('lucide-chevrons-right-left')
    expect(markup).toContain('text-sky-500')
    expect(markup).toContain('animate-pulse')
    expect(markup).toContain('motion-reduce:animate-none')
    expect(markup).not.toContain('border-yellow-500')
    expect(markup).not.toContain('lucide-circle-check')
  })

  it.each(['permission', 'waiting'] satisfies AgentDotState[])(
    'renders %s as an amber attention dot',
    (state) => {
      const classNames = renderDotClassNames(state)

      expect(classNames).toContain('bg-amber-500')
      expect(classNames).not.toContain('bg-red-500')
    }
  )

  it.each(['blocked', 'interrupted'] satisfies AgentDotState[])(
    'renders %s as a red attention dot',
    (state) => {
      const classNames = renderDotClassNames(state)

      expect(classNames).toContain('bg-red-500')
      expect(classNames).not.toContain('bg-amber-500')
    }
  )
})
