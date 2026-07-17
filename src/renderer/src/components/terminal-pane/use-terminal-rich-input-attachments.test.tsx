// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearTerminalRichInputAttachmentCacheForTests } from './terminal-rich-input-attachment-cache'
import { useTerminalRichInputAttachments } from './use-terminal-rich-input-attachments'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

type ProbeApi = ReturnType<typeof useTerminalRichInputAttachments>

function Probe({ onReady }: { onReady: (api: ProbeApi) => void }): React.JSX.Element {
  const api = useTerminalRichInputAttachments({
    scopeKey: 'tab:leaf',
    connectionId: null,
    runtimeEnvironmentId: null,
    focusEditor: () => {},
    enabled: true
  })
  onReady(api)
  return createElement('div')
}

async function renderProbe(): Promise<{ root: Root; latest: () => ProbeApi }> {
  const root = createRoot(document.createElement('div'))
  let api: ProbeApi | null = null
  await act(async () => {
    root.render(createElement(Probe, { onReady: (next: ProbeApi) => (api = next) }))
  })
  return {
    root,
    latest: () => {
      if (!api) {
        throw new Error('Probe did not render')
      }
      return api
    }
  }
}

describe('useTerminalRichInputAttachments', () => {
  afterEach(() => {
    clearTerminalRichInputAttachmentCacheForTests()
    vi.restoreAllMocks()
  })

  it('does not block or persist anything for a speculative text-clipboard probe', async () => {
    const saveClipboardImageAsTempFile = vi.fn()
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        ui: {
          readClipboardImageDataUrl: vi.fn().mockResolvedValue(null),
          saveClipboardImageAsTempFile
        }
      }
    })
    const probe = await renderProbe()

    await act(async () => {
      probe.latest().pasteImageFromClipboard()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(saveClipboardImageAsTempFile).not.toHaveBeenCalled()
    expect(probe.latest().attachmentBusy).toBe(false)
    expect(probe.latest().attachments).toEqual([])
    probe.root.unmount()
  })

  it('upgrades an in-flight keydown probe when the image paste event confirms it', async () => {
    let resolvePreview: (value: string | null) => void = () => {}
    const readClipboardImageDataUrl = vi.fn(
      () => new Promise<string | null>((resolve) => (resolvePreview = resolve))
    )
    const saveClipboardImageAsTempFile = vi.fn().mockResolvedValue('/tmp/confirmed.png')
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { readClipboardImageDataUrl, saveClipboardImageAsTempFile } }
    })
    const probe = await renderProbe()
    const preventDefault = vi.fn()

    await act(async () => {
      probe.latest().pasteImageFromClipboard()
      expect(
        probe.latest().handlePaste({
          clipboardData: { items: [], getData: () => '' } as unknown as DataTransfer,
          defaultPrevented: false,
          preventDefault
        })
      ).toBe(true)
      resolvePreview(null)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(saveClipboardImageAsTempFile).toHaveBeenCalledOnce()
    expect(probe.latest().attachments[0]?.path).toBe('/tmp/confirmed.png')
    probe.root.unmount()
  })

  it('turns a clipboard image temp file into a removable pending attachment', async () => {
    const saveClipboardImageAsTempFile = vi.fn().mockResolvedValue('/tmp/orca-paste-1.png')
    const readClipboardImageDataUrl = vi.fn().mockResolvedValue('data:image/png;base64,AAAA')
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { readClipboardImageDataUrl, saveClipboardImageAsTempFile } }
    })
    const probe = await renderProbe()

    await act(async () => {
      probe.latest().pasteImageFromClipboard()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(saveClipboardImageAsTempFile).toHaveBeenCalledWith({
      connectionId: undefined,
      runtimeEnvironmentId: undefined
    })
    expect(probe.latest().attachments).toEqual([
      {
        id: expect.any(String),
        path: '/tmp/orca-paste-1.png',
        previewSrc: 'data:image/png;base64,AAAA'
      }
    ])

    await act(async () => probe.latest().removeAttachment(probe.latest().attachments[0].id))
    expect(probe.latest().attachments).toEqual([])
    probe.root.unmount()
  })
})
