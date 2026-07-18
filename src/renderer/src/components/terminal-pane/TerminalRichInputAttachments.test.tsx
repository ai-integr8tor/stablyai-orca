import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TerminalRichInputAttachments } from './TerminalRichInputAttachments'

vi.mock('@/components/editor/useLocalImageSrc', () => ({
  useLocalImageSrc: () => 'blob:terminal-rich-input-image'
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

describe('TerminalRichInputAttachments', () => {
  it('renders a full-opacity removable thumbnail with a concise image filename', () => {
    const html = renderToStaticMarkup(
      <TerminalRichInputAttachments
        attachments={[{ id: 'image-1', path: '/tmp/orca-paste-123.png' }]}
        pending={false}
        connectionId={null}
        runtimeEnvironmentId={null}
        worktreeId="worktree-1"
        onRemove={() => {}}
      />
    )

    expect(html).toContain('blob:terminal-rich-input-image')
    expect(html).toContain('image.png')
    expect(html).toContain('opacity-100')
    expect(html).toContain('Remove attachment')
  })
})
