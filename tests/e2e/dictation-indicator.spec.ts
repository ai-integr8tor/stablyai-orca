import { test, expect } from './helpers/orca-app'
import type { Page, TestInfo } from '@stablyai/playwright-test'

type DictationMeterForE2E = {
  level: number
  peak: number
  isSpeaking: boolean
  isSilent: boolean
  isClipping: boolean
  lastUpdatedAt: number
}

type DictationNoticeForE2E = {
  kind: 'error' | 'info'
  message: string
  createdAt: number
}

type DictationStoreForE2E = {
  getState: () => {
    setDictationState: (state: 'idle' | 'starting' | 'listening' | 'stopping' | 'error') => void
    setDictationMeter: (meter: DictationMeterForE2E) => void
    setPartialTranscript: (text: string) => void
    setDictationNotice: (notice: DictationNoticeForE2E | null) => void
  }
  setState: (state: {
    dictationState?: 'idle' | 'starting' | 'listening' | 'stopping' | 'error'
    dictationNotice?: DictationNoticeForE2E | null
  }) => void
}

type WindowWithDictationStore = Window & {
  __store?: DictationStoreForE2E
}

async function captureDictationArtifact(
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<void> {
  if (process.env.ORCA_DICTATION_SCREENSHOTS !== '1') {
    return
  }
  const indicator = page.getByRole('status')
  await indicator.screenshot({ path: testInfo.outputPath(`${name}.png`) })
}

test.describe('Dictation indicator', () => {
  test('renders dictation states from the renderer store', async ({ orcaPage }, testInfo) => {
    await orcaPage.evaluate(() => {
      const store = (window as WindowWithDictationStore).__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      const state = store.getState()
      state.setDictationState('listening')
      state.setDictationMeter({
        level: 0.72,
        peak: 0.74,
        isSpeaking: true,
        isSilent: false,
        isClipping: false,
        lastUpdatedAt: Date.now()
      })
      state.setPartialTranscript('Can you inspect the repo and summarize the current branch?')
    })
    await expect(orcaPage.getByRole('status')).toContainText('Speaking')
    await expect(orcaPage.getByRole('status')).toContainText('Can you inspect')
    await captureDictationArtifact(orcaPage, testInfo, 'dictation-speaking')

    await orcaPage.evaluate(() => {
      const store = (window as WindowWithDictationStore).__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      const state = store.getState()
      state.setPartialTranscript('')
      state.setDictationMeter({
        level: 0.02,
        peak: 0.03,
        isSpeaking: false,
        isSilent: true,
        isClipping: false,
        lastUpdatedAt: Date.now()
      })
    })
    await expect(orcaPage.getByRole('status')).toContainText('Listening')
    await captureDictationArtifact(orcaPage, testInfo, 'dictation-listening')

    await orcaPage.evaluate(() => {
      const store = (window as WindowWithDictationStore).__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      store.getState().setDictationMeter({
        level: 0.95,
        peak: 1,
        isSpeaking: true,
        isSilent: false,
        isClipping: true,
        lastUpdatedAt: Date.now()
      })
    })
    await expect(orcaPage.getByRole('status')).toContainText('Too loud')
    await captureDictationArtifact(orcaPage, testInfo, 'dictation-too-loud')

    await orcaPage.evaluate(() => {
      const store = (window as WindowWithDictationStore).__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      const state = store.getState()
      state.setDictationState('stopping')
      state.setPartialTranscript('')
    })
    await expect(orcaPage.getByRole('status')).toContainText('Processing…')
    await captureDictationArtifact(orcaPage, testInfo, 'dictation-processing')

    await orcaPage.evaluate(() => {
      const store = (window as WindowWithDictationStore).__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      store.setState({
        dictationState: 'idle',
        dictationNotice: { kind: 'error', message: 'Speech error.', createdAt: Date.now() }
      })
    })
    await expect(orcaPage.getByRole('status')).toContainText('Speech error.')
    await captureDictationArtifact(orcaPage, testInfo, 'dictation-error')
  })
})
