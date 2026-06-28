// Parse + validate a raw plugin manifest into a typed `PluginManifest`.
// Returns a discriminated result (never throws) so callers — install, the
// management UI, and tests — can surface every problem at once.

import {
  isPluginCapability,
  isSafePluginId,
  SUPPORTED_HOST_API_MAJOR,
  type PluginManifest,
  type PluginContributes
} from './manifest'

export type ManifestValidationResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; errors: string[] }

// A single self-contained HTML entry, relative to the plugin directory. We
// reject traversal/absolute paths and anything that isn't a lone `.html` file
// (multi-file UIs / directory entries are deferred to a later phase).
function validateUiEntry(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${field}: must be a non-empty string path to a single .html file`)
    return
  }
  if (value.includes('..')) {
    errors.push(`${field}: must not contain '..' (path traversal)`)
  }
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) {
    errors.push(`${field}: must be a relative path, not absolute`)
  }
  if (!value.toLowerCase().endsWith('.html')) {
    errors.push(
      `${field}: must point to a single .html file (multi-file UIs are not supported yet)`
    )
  }
}

// Lucide icon name. The shared validator (used by the electron-free relay and
// mobile, which do not bundle lucide-react) checks only the FORMAT — a
// PascalCase identifier. Exact membership in the Lucide set is a render-time
// check in the renderer, where the icon map is available.
function validateIcon(value: unknown, errors: string[]): void {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push('contributes.sidebar.icon: must be a non-empty Lucide icon name')
    return
  }
  if (!/^[A-Z][A-Za-z0-9]*$/.test(value)) {
    errors.push(
      `contributes.sidebar.icon: '${value}' is not a valid Lucide icon name (PascalCase letters/digits)`
    )
  }
}

// Parse the major from a semver-ish string. Returns null when unparseable.
function parseMajor(version: string): number | null {
  const match = /^(\d+)\./.exec(version) ?? /^(\d+)$/.exec(version)
  if (!match) {
    return null
  }
  return Number.parseInt(match[1], 10)
}

function validateHostApiVersion(value: unknown, errors: string[]): void {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push('hostApiVersion: required semver string (e.g. "0.1.0")')
    return
  }
  const major = parseMajor(value)
  if (major === null) {
    errors.push(`hostApiVersion: '${value}' is not a valid semver version`)
    return
  }
  if (major > SUPPORTED_HOST_API_MAJOR) {
    errors.push('hostApiVersion: this plugin requires a newer version of Orca')
  }
}

function validateCapabilities(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push('capabilities: must be an array')
    return
  }
  for (const cap of value) {
    if (!isPluginCapability(cap)) {
      errors.push(`capabilities: unknown capability '${String(cap)}'`)
    }
  }
}

function validateContributes(value: unknown, errors: string[]): void {
  if (typeof value !== 'object' || value === null) {
    errors.push('contributes: required object with a "sidebar" contribution')
    return
  }
  const contributes = value as Partial<PluginContributes>
  const sidebar = contributes.sidebar
  if (typeof sidebar !== 'object' || sidebar === null) {
    errors.push('contributes.sidebar: required object')
  } else {
    if (typeof sidebar.title !== 'string' || sidebar.title.length === 0) {
      errors.push('contributes.sidebar.title: required non-empty string')
    }
    validateIcon(sidebar.icon, errors)
    validateUiEntry(sidebar.ui, 'contributes.sidebar.ui', errors)
  }
  if (contributes.settings !== undefined) {
    if (typeof contributes.settings !== 'object' || contributes.settings === null) {
      errors.push('contributes.settings: must be an object when present')
    } else {
      validateUiEntry(contributes.settings.ui, 'contributes.settings.ui', errors)
    }
  }
}

function requireString(record: Record<string, unknown>, field: string, errors: string[]): void {
  const value = record[field]
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${field}: required non-empty string`)
  }
}

export function validatePluginManifest(raw: unknown): ManifestValidationResult {
  const errors: string[] = []

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: ['manifest: expected an object'] }
  }
  const record = raw as Record<string, unknown>

  requireString(record, 'id', errors)
  // The id is used both as a directory name and as an object-map key, so it
  // must be a safe path segment AND a safe key (no traversal / prototype keys).
  // This is the single trust boundary — install, manager, store, and settings
  // store all rely on it rather than re-checking.
  if (typeof record.id === 'string' && record.id.length > 0 && !isSafePluginId(record.id)) {
    errors.push(
      "id: must start alphanumeric and contain only letters, digits, '.', '-', '_' (no '..', no reserved keys like __proto__/constructor)"
    )
  }
  requireString(record, 'name', errors)
  requireString(record, 'version', errors)
  requireString(record, 'main', errors)
  validateHostApiVersion(record.hostApiVersion, errors)
  validateContributes(record.contributes, errors)
  validateCapabilities(record.capabilities, errors)
  if (
    record.settingsSchema !== undefined &&
    (typeof record.settingsSchema !== 'object' || record.settingsSchema === null)
  ) {
    errors.push('settingsSchema: must be an object (JSON Schema) when present')
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  // Construct the typed manifest field-by-field from validated values rather
  // than a blanket `as unknown as` cast. Adding a required field to
  // PluginManifest now forces a compile error here if the validator omits it.
  const contributes = record.contributes as Record<string, unknown>
  const sidebar = contributes.sidebar as Record<string, unknown>
  const built: PluginContributes = {
    sidebar: {
      title: sidebar.title as string,
      icon: sidebar.icon as string,
      ui: sidebar.ui as string
    }
  }
  if (contributes.settings) {
    built.settings = { ui: (contributes.settings as Record<string, unknown>).ui as string }
  }
  const manifest: PluginManifest = {
    id: record.id as string,
    name: record.name as string,
    version: record.version as string,
    hostApiVersion: record.hostApiVersion as string,
    main: record.main as string,
    contributes: built,
    capabilities: record.capabilities as PluginManifest['capabilities']
  }
  if (record.settingsSchema !== undefined) {
    manifest.settingsSchema = record.settingsSchema as Record<string, unknown>
  }
  return { ok: true, manifest }
}
