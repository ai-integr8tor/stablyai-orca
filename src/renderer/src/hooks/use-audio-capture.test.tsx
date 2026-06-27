// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { DEFAULT_DICTATION_METER } from '@/components/dictation/dictation-audio-meter'
import { useAppStore } from '@/store'
import { useAudioCapture } from './use-audio-capture'

type AudioCaptureControls = ReturnValue

type ReturnValue = {
  start: (options?: { bufferAudio?: boolean; sessionId?: string }) => Promise<void>
  flushBufferedAudio: () => Promise<void>
  stop: (options?: { preserveBufferedAudio?: boolean }) => void
  discardBufferedAudio: () => void
}

type ProcessAudioChunk = (samples: number[]) => void

type AudioApiMock = {
  speech: {
    feedAudio: Mock<(samples: Float32Array, sampleRate: number, sessionId: string) => Promise<void>>
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null
let controls: AudioCaptureControls | null = null
let processAudioChunk: ProcessAudioChunk | null = null
let mediaStream: MediaStream
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let feedAudio: AudioApiMock['speech']['feedAudio']

class TestScriptProcessorNode {
  onaudioprocess: ((event: AudioProcessingEvent) => void) | null = null
  connect = vi.fn()
  disconnect = vi.fn()
}

class TestMediaStreamAudioSourceNode {
  connect = vi.fn()
  disconnect = vi.fn()
}

class TestAudioContext {
  sampleRate = 48_000
  state: AudioContextState = 'running'
  destination = {}
  createMediaStreamSource = vi.fn(() => new TestMediaStreamAudioSourceNode())
  createScriptProcessor = vi.fn(() => {
    const processor = new TestScriptProcessorNode()
    processAudioChunk = (samples: number[]) => {
      const event = {
        inputBuffer: {
          getChannelData: () => new Float32Array(samples)
        }
      } as unknown as AudioProcessingEvent
      processor.onaudioprocess?.(event)
    }
    return processor
  })
  resume = vi.fn(async () => undefined)
  close = vi.fn(async () => undefined)
}

function Probe(): null {
  controls = useAudioCapture()
  return null
}

async function renderProbe(): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<Probe />)
  })
}

async function startCapture(options?: {
  bufferAudio?: boolean
  sessionId?: string
}): Promise<void> {
  await act(async () => {
    await controls?.start(options)
  })
}

beforeEach(() => {
  feedAudio = vi.fn(async () => undefined)
  mediaStream = {
    getTracks: () => [{ stop: vi.fn() }]
  } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => mediaStream)
    }
  })
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: TestAudioContext
  })
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: TestAudioContext
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { speech: { feedAudio } } satisfies AudioApiMock
  })
  useAppStore.setState({ dictationMeter: DEFAULT_DICTATION_METER })
})

afterEach(async () => {
  controls?.stop()
  controls = null
  processAudioChunk = null
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  root = null
  container?.remove()
  container = null
  vi.restoreAllMocks()
  useAppStore.setState({ dictationMeter: DEFAULT_DICTATION_METER })
})

describe('useAudioCapture', () => {
  it('publishes meter state while preserving direct speech audio feed samples', async () => {
    await renderProbe()
    await startCapture({ sessionId: 'session-1' })

    act(() => {
      processAudioChunk?.([0.25, -0.25])
    })

    expect(feedAudio).toHaveBeenCalledTimes(1)
    expect(Array.from(feedAudio.mock.calls[0][0])).toEqual([0.25, -0.25])
    expect(feedAudio.mock.calls[0][1]).toBe(48_000)
    expect(feedAudio.mock.calls[0][2]).toBe('session-1')
    expect(useAppStore.getState().dictationMeter.level).toBeGreaterThan(0)
  })

  it('publishes meter state while preserving buffered speech audio feed samples', async () => {
    await renderProbe()
    await startCapture({ bufferAudio: true, sessionId: 'session-1' })

    act(() => {
      processAudioChunk?.([0.25, -0.25])
    })

    expect(feedAudio).not.toHaveBeenCalled()
    expect(useAppStore.getState().dictationMeter.level).toBeGreaterThan(0)

    await act(async () => {
      await controls?.flushBufferedAudio()
    })

    expect(feedAudio).toHaveBeenCalledTimes(1)
    expect(Array.from(feedAudio.mock.calls[0][0])).toEqual([0.25, -0.25])
    expect(feedAudio.mock.calls[0][1]).toBe(48_000)
    expect(feedAudio.mock.calls[0][2]).toBe('session-1')
  })
})
