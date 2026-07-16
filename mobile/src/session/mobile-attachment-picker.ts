// Why: import from 'buffer' (the npm polyfill), not 'node:buffer' — Metro
// can't resolve Node's builtin in a React Native bundle.
import { Buffer } from 'buffer'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'

export type MobileAttachmentSource = 'library' | 'files'

export type PickedMobileAttachment = {
  // Raw base64 (no data: prefix); fed straight into the existing upload pipeline.
  readonly base64: string
  // Original name of a document pick; photo-library picks stay nameless pastes.
  readonly fileName?: string
}

export type MobileAttachmentPickerOptions = {
  // Only set when the host advertises clipboard.file-upload.v1 — old hosts
  // would strip the name and save any pick as `….png`.
  readonly allowAnyFile?: boolean
}

export class ImageLibraryPermissionError extends Error {
  constructor() {
    super('Photo library permission denied')
    this.name = 'ImageLibraryPermissionError'
  }
}

// Why: expo-document-picker returns a file URI, not base64. Read it through
// fetch + Buffer so we match the base64 contract the upload pipeline expects
// without pulling in expo-file-system.
async function readUriAsBase64(uri: string): Promise<string> {
  const response = await fetch(uri)
  const bytes = new Uint8Array(await response.arrayBuffer())
  return Buffer.from(bytes).toString('base64')
}

async function pickFromLibrary(
  requestPermission: typeof ImagePicker.requestMediaLibraryPermissionsAsync = ImagePicker.requestMediaLibraryPermissionsAsync,
  launch: typeof ImagePicker.launchImageLibraryAsync = ImagePicker.launchImageLibraryAsync
): Promise<PickedMobileAttachment | null> {
  const permission = await requestPermission()
  // Why: `granted` covers full + limited iOS access; only a hard denial blocks us.
  if (!permission.granted) {
    throw new ImageLibraryPermissionError()
  }
  const result = await launch({
    mediaTypes: ['images'],
    base64: true,
    allowsMultipleSelection: false,
    quality: 1
  })
  if (result.canceled) {
    return null
  }
  const asset = result.assets[0]
  const base64 = asset?.base64 ?? (asset?.uri ? await readUriAsBase64(asset.uri) : null)
  if (!base64) {
    return null
  }
  return { base64 }
}

async function pickFromFiles(
  allowAnyFile: boolean,
  launch: typeof DocumentPicker.getDocumentAsync = DocumentPicker.getDocumentAsync
): Promise<PickedMobileAttachment | null> {
  const result = await launch({
    type: allowAnyFile ? '*/*' : 'image/*',
    multiple: false,
    copyToCacheDirectory: true
  })
  if (result.canceled) {
    return null
  }
  const asset = result.assets[0]
  if (!asset?.uri) {
    return null
  }
  const base64 = await readUriAsBase64(asset.uri)
  return asset.name ? { base64, fileName: asset.name } : { base64 }
}

export async function pickMobileAttachment(
  source: MobileAttachmentSource,
  deps?: {
    readonly requestLibraryPermission?: typeof ImagePicker.requestMediaLibraryPermissionsAsync
    readonly launchLibrary?: typeof ImagePicker.launchImageLibraryAsync
    readonly launchFiles?: typeof DocumentPicker.getDocumentAsync
  },
  options?: MobileAttachmentPickerOptions
): Promise<PickedMobileAttachment | null> {
  if (source === 'library') {
    return pickFromLibrary(deps?.requestLibraryPermission, deps?.launchLibrary)
  }
  return pickFromFiles(options?.allowAnyFile === true, deps?.launchFiles)
}
