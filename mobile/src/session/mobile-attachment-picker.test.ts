import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn()
}))
vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn()
}))

import { ImageLibraryPermissionError, pickMobileAttachment } from './mobile-attachment-picker'

const granted = { granted: true } as Awaited<
  ReturnType<typeof import('expo-image-picker').requestMediaLibraryPermissionsAsync>
>
const denied = { granted: false } as typeof granted

describe('pickMobileAttachment', () => {
  it('returns base64 from the photo library', async () => {
    const result = await pickMobileAttachment('library', {
      requestLibraryPermission: vi.fn().mockResolvedValue(granted),
      launchLibrary: vi.fn().mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///x.jpg', base64: 'AAAA' }]
      })
    })

    expect(result).toEqual({ base64: 'AAAA' })
  })

  it('throws when photo library permission is denied', async () => {
    await expect(
      pickMobileAttachment('library', {
        requestLibraryPermission: vi.fn().mockResolvedValue(denied),
        launchLibrary: vi.fn()
      })
    ).rejects.toBeInstanceOf(ImageLibraryPermissionError)
  })

  it('returns null when the library picker is cancelled', async () => {
    const result = await pickMobileAttachment('library', {
      requestLibraryPermission: vi.fn().mockResolvedValue(granted),
      launchLibrary: vi.fn().mockResolvedValue({ canceled: true, assets: null })
    })

    expect(result).toBeNull()
  })

  it('reads a picked file URI into base64 and keeps its name for the files source', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(bytes.buffer, { headers: { 'content-type': 'image/png' } }))

    const result = await pickMobileAttachment('files', {
      launchFiles: vi.fn().mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///doc.png', name: 'doc.png' }]
      })
    })

    expect(result).toEqual({ base64: Buffer.from(bytes).toString('base64'), fileName: 'doc.png' })
    fetchSpy.mockRestore()
  })

  it('omits fileName when the document picker supplies no name', async () => {
    const bytes = new Uint8Array([1, 2])
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(bytes.buffer, { headers: { 'content-type': 'image/png' } }))

    const result = await pickMobileAttachment('files', {
      launchFiles: vi.fn().mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///doc.png' }]
      })
    })

    expect(result).toEqual({ base64: Buffer.from(bytes).toString('base64') })
    fetchSpy.mockRestore()
  })

  it('keeps the image-only filter by default so old hosts never see non-images', async () => {
    const launchFiles = vi.fn().mockResolvedValue({ canceled: true, assets: null })

    await pickMobileAttachment('files', { launchFiles })

    expect(launchFiles).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/*' }))
  })

  it('opens the unfiltered picker when any-file attachments are allowed', async () => {
    const launchFiles = vi.fn().mockResolvedValue({ canceled: true, assets: null })

    await pickMobileAttachment('files', { launchFiles }, { allowAnyFile: true })

    expect(launchFiles).toHaveBeenCalledWith(expect.objectContaining({ type: '*/*' }))
  })

  it('never returns a fileName for photo-library picks', async () => {
    const result = await pickMobileAttachment(
      'library',
      {
        requestLibraryPermission: vi.fn().mockResolvedValue(granted),
        launchLibrary: vi.fn().mockResolvedValue({
          canceled: false,
          assets: [{ uri: 'file:///x.jpg', base64: 'AAAA', fileName: 'x.jpg' }]
        })
      },
      { allowAnyFile: true }
    )

    expect(result).toEqual({ base64: 'AAAA' })
  })

  it('returns null when the files picker is cancelled', async () => {
    const result = await pickMobileAttachment('files', {
      launchFiles: vi.fn().mockResolvedValue({ canceled: true, assets: null })
    })

    expect(result).toBeNull()
  })
})
