import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'

vi.mock('@/i18n/i18n', () => ({
  i18n: { language: 'en' },
  translate: (_key: string, fallback: string, values?: Record<string, string>) => {
    let result = fallback
    for (const [key, value] of Object.entries(values ?? {})) {
      result = result.replace(`{{${key}}}`, value)
    }
    return result
  }
}))

vi.mock('@/lib/agent-catalog', () => ({
  AgentIcon: () => null
}))

const mocks = vi.hoisted(() => ({
  usagePercentageDisplay: 'used' as 'used' | 'remaining'
}))

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: { usagePercentageDisplay: 'used' | 'remaining' }) => unknown) =>
    selector({ usagePercentageDisplay: mocks.usagePercentageDisplay })
}))

function claudeLimits(): ProviderRateLimits {
  return {
    provider: 'claude',
    session: {
      usedPercent: 32,
      windowMinutes: 300,
      resetsAt: null,
      resetDescription: null
    },
    weekly: {
      usedPercent: 16,
      windowMinutes: 10080,
      resetsAt: null,
      resetDescription: null
    },
    fableWeekly: {
      usedPercent: 42,
      windowMinutes: 10080,
      resetsAt: null,
      resetDescription: null
    },
    updatedAt: Date.now(),
    error: null,
    status: 'ok'
  }
}

describe('InlineUsageBars', () => {
  beforeEach(() => {
    mocks.usagePercentageDisplay = 'used'
  })

  it('renders Claude Fable usage in inactive account preview rows', async () => {
    const { InlineUsageBars } = await import('./StatusBar')

    const markup = renderToStaticMarkup(
      <InlineUsageBars limits={claudeLimits()} isFetching={false} />
    )

    // Why: bars show % used with explicit "used" so compact labels are not ambiguous.
    expect(markup).toContain('32% used 5h')
    expect(markup).toContain('16% used wk')
    expect(markup).toContain('42% used Fable')
  })

  it('uses the reported duration for a sole Codex weekly primary window', async () => {
    const { InlineUsageBars } = await import('./StatusBar')
    const limits: ProviderRateLimits = {
      provider: 'codex',
      session: {
        usedPercent: 37,
        windowMinutes: 10_080,
        resetsAt: null,
        resetDescription: null
      },
      weekly: null,
      updatedAt: Date.now(),
      error: null,
      status: 'ok'
    }

    const markup = renderToStaticMarkup(<InlineUsageBars limits={limits} isFetching={false} />)

    expect(markup).toContain('37% used wk')
    expect(markup).not.toContain('37% used 5h')
  })

  it('keeps the mini meter when Codex exposes only a weekly window', async () => {
    const { ProviderDetailsMenu } = await import('./StatusBar')
    const limits: ProviderRateLimits = {
      provider: 'codex',
      session: null,
      weekly: {
        usedPercent: 37,
        windowMinutes: 10_080,
        resetsAt: null,
        resetDescription: null
      },
      updatedAt: Date.now(),
      error: null,
      status: 'ok'
    }

    const markup = renderToStaticMarkup(
      <ProviderDetailsMenu
        provider={limits}
        compact={false}
        iconOnly={false}
        ariaLabel="Open Codex usage details"
      />
    )

    expect(markup).toContain('w-[48px] h-[6px]')
    expect(markup).toContain('width:37%')
    expect(markup).toContain('37% used wk')
  })

  it('shows remaining copy without reversing consumption meter fill', async () => {
    mocks.usagePercentageDisplay = 'remaining'
    const { InlineUsageBars } = await import('./StatusBar')

    const markup = renderToStaticMarkup(
      <InlineUsageBars limits={claudeLimits()} isFetching={false} />
    )

    expect(markup).toContain('68% left 5h')
    expect(markup).toContain('84% left wk')
    expect(markup).toContain('58% left Fable')
    expect(markup).toContain('width:32%')
  })
})
