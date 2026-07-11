import { nativeImage, type NativeImage } from 'electron'

// Why: amber-500 (#f59e0b) is Orca's "needs attention / unread" color, matching
// the renderer launcher dot and the tab-unread bell. Kept in sync with the
// bg-amber-500 used in FloatingTerminalToggleButton.
const DOT_RGB = { r: 0xf5, g: 0x9e, b: 0x0b }
// A near-white halo separates the dot from the icon glyph on any tray theme.
const RING_RGB = { r: 0xff, g: 0xff, b: 0xff }

type ComposeOptions = {
  /** macOS: draw a monochrome badge (black dot + clear halo) and mark the
   *  result a Template image so the menu bar keeps recoloring it. */
  template?: boolean
}

/**
 * Returns a copy of `base` with a small attention badge composited into the
 * top-right corner. Electron's NativeImage has no compositing API, so we merge
 * the badge directly into the raw BGRA bitmap. Windows gets an amber dot with a
 * near-white halo; macOS (`template`) gets a black dot with a transparent halo
 * on a Template image so the OS recolors it for light/dark menu bars. Returns
 * `base` unchanged if it has no pixels (e.g. a failed icon load) so the tray
 * never shows a blank image.
 */
export function composeTrayAttentionIcon(
  base: NativeImage,
  options: ComposeOptions = {}
): NativeImage {
  const { width, height } = base.getSize()
  if (width <= 0 || height <= 0) {
    return base
  }

  // toBitmap()/createFromBitmap both use BGRA; the round-trip preserves format.
  const bitmap = Buffer.from(base.toBitmap())
  const dotRadius = Math.max(2, Math.round(Math.min(width, height) * 0.2))
  const ringRadius = dotRadius + 1
  // Hug the top-right corner so the dot reads as a badge and leaves the app
  // glyph (bottom-left) visible. The dot stays fully on-canvas; the outer ring
  // may clip a pixel at the very corner, which is expected for a corner badge.
  const centerX = width - 1 - dotRadius
  const centerY = dotRadius
  const dotRadiusSq = dotRadius * dotRadius
  const ringRadiusSq = ringRadius * ringRadius

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX
      const dy = y - centerY
      const distSq = dx * dx + dy * dy
      if (distSq > ringRadiusSq) {
        continue
      }
      const offset = (y * width + x) * 4
      const inDot = distSq <= dotRadiusSq
      if (options.template) {
        // Template menu-bar badge: solid black dot, transparent halo so the dot
        // reads as separate from the glyph once macOS recolors the whole image.
        bitmap[offset] = 0
        bitmap[offset + 1] = 0
        bitmap[offset + 2] = 0
        bitmap[offset + 3] = inDot ? 0xff : 0x00
        continue
      }
      const color = inDot ? DOT_RGB : RING_RGB
      bitmap[offset] = color.b
      bitmap[offset + 1] = color.g
      bitmap[offset + 2] = color.r
      bitmap[offset + 3] = 0xff
    }
  }

  const composed = nativeImage.createFromBitmap(bitmap, { width, height })
  if (options.template) {
    composed.setTemplateImage(true)
  }
  return composed
}
