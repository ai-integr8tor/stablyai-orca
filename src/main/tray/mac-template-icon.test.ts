import { describe, expect, it, vi } from 'vitest'

const createFromBitmapMock = vi.hoisted(() =>
  vi.fn((buffer: Buffer, options: { width: number; height: number }) => ({
    __image: true,
    buffer,
    setTemplateImage: vi.fn(),
    ...options
  }))
)

vi.mock('electron', () => ({
  nativeImage: { createFromBitmap: createFromBitmapMock }
}))

import { toMacTemplateImage } from './mac-template-icon'

// A colored, fully opaque 2x2 icon (BGRA) — RGB must be flattened to black.
function coloredBase(
  width: number,
  height: number
): { getSize: () => { width: number; height: number }; toBitmap: () => Buffer } {
  const bitmap = Buffer.alloc(width * height * 4)
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    bitmap[offset] = 0x0b // B
    bitmap[offset + 1] = 0x9e // G
    bitmap[offset + 2] = 0xf5 // R
    bitmap[offset + 3] = offset === 0 ? 0x00 : 0xff // one transparent pixel
  }
  return { getSize: () => ({ width, height }), toBitmap: () => bitmap }
}

describe('toMacTemplateImage', () => {
  it('returns the base unchanged when it has no pixels', () => {
    createFromBitmapMock.mockClear()
    const base = { getSize: () => ({ width: 0, height: 0 }), toBitmap: () => Buffer.alloc(0) }

    expect(toMacTemplateImage(base as never)).toBe(base)
    expect(createFromBitmapMock).not.toHaveBeenCalled()
  })

  it('flattens RGB to black, preserves alpha, and marks the image as Template', () => {
    createFromBitmapMock.mockClear()
    const result = toMacTemplateImage(coloredBase(2, 2) as never)
    const bitmap = createFromBitmapMock.mock.calls[0][0]

    for (let offset = 0; offset < bitmap.length; offset += 4) {
      expect([bitmap[offset], bitmap[offset + 1], bitmap[offset + 2]]).toEqual([0, 0, 0])
    }
    // Alpha (the glyph mask) must survive the flatten.
    expect(bitmap[3]).toBe(0x00)
    expect(bitmap[7]).toBe(0xff)
    expect(
      (result as unknown as { setTemplateImage: ReturnType<typeof vi.fn> }).setTemplateImage
    ).toHaveBeenCalledWith(true)
  })
})
