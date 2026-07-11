import { nativeImage, type NativeImage } from 'electron'

/**
 * Flattens a full-color icon into a macOS Template image: black RGB with the
 * source alpha as the glyph mask. macOS only recolors menu-bar icons that are
 * marked template AND contain only black + clear pixels, so a colored app-icon
 * PNG marked template alone renders wrong. Returns `base` unchanged if it has no
 * pixels (e.g. a failed icon load) so the tray never shows a blank image.
 */
export function toMacTemplateImage(base: NativeImage): NativeImage {
  const { width, height } = base.getSize()
  if (width <= 0 || height <= 0) {
    return base
  }
  // toBitmap()/createFromBitmap both use BGRA; zero the color channels and keep
  // the alpha so the shape survives while the fill becomes template-black.
  const bitmap = Buffer.from(base.toBitmap())
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    bitmap[offset] = 0
    bitmap[offset + 1] = 0
    bitmap[offset + 2] = 0
  }
  const template = nativeImage.createFromBitmap(bitmap, { width, height })
  template.setTemplateImage(true)
  return template
}
