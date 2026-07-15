const MAX_REPORTED_MOBILE_DEVICE_NAME_LENGTH = 64

export function sanitizeReportedMobileDeviceName(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null
  }
  const normalized = Array.from(raw)
    .filter((character) => {
      const codePoint = character.codePointAt(0)
      return codePoint !== undefined && codePoint > 0x1f && codePoint !== 0x7f
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  // Why: slicing UTF-16 code units can leave a lone surrogate at the boundary.
  const cleaned = Array.from(normalized).slice(0, MAX_REPORTED_MOBILE_DEVICE_NAME_LENGTH).join('')
  return cleaned.length > 0 ? cleaned : null
}
