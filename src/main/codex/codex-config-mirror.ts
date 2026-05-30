/* eslint-disable max-lines -- Why: this file mirrors TOML without reserializing user config, so section parsing and merge rules need to stay together for auditability. */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import { getOrcaManagedCodexHomePath, getSystemCodexHomePath } from './codex-home-paths'
import { getCodexCanonicalTrustPath, parseTrustKey } from './config-toml-trust'

export type CodexConfigSyncResult = {
  repairDetails: string[]
  error: string | null
}

function getRuntimeCodexConfigTomlPath(): string {
  return join(getOrcaManagedCodexHomePath(), 'config.toml')
}

function getRuntimeCodexHooksJsonPath(): string {
  return join(getOrcaManagedCodexHomePath(), 'hooks.json')
}

function getSystemCodexConfigTomlPath(): string {
  return join(getSystemCodexHomePath(), 'config.toml')
}

export function syncSystemConfigIntoManagedCodexHome(): CodexConfigSyncResult {
  try {
    return syncSystemConfigIntoManagedCodexHomeUnsafe()
  } catch (error) {
    console.warn('[codex-config] Failed to mirror system Codex config:', error)
    return {
      repairDetails: [],
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function syncSystemConfigIntoManagedCodexHomeUnsafe(): CodexConfigSyncResult {
  const systemConfigPath = getSystemCodexConfigTomlPath()
  const runtimeConfigPath = getRuntimeCodexConfigTomlPath()
  const systemConfigExists = existsSync(systemConfigPath)
  const runtimeConfigExists = existsSync(runtimeConfigPath)
  if (!systemConfigExists && !runtimeConfigExists) {
    return { repairDetails: [], error: null }
  }

  const systemConfig = systemConfigExists ? readFileSync(systemConfigPath, 'utf-8') : ''
  if (!runtimeConfigExists) {
    // Why: trust blocks carry source identity. Runtime hook trust is keyed to
    // Orca's managed files and should not inherit hashes from ~/.codex.
    writeFileAtomically(runtimeConfigPath, seedCodexRuntimeConfigFromSystemConfig(systemConfig))
    return { repairDetails: [], error: null }
  }

  const runtimeConfig = readFileSync(runtimeConfigPath, 'utf-8')
  const { config: mergedConfig, repairDetails } = mergeCodexConfigIntoManagedRuntime(
    runtimeConfig,
    systemConfig,
    getRuntimeCodexHooksJsonPath()
  )
  if (mergedConfig !== runtimeConfig) {
    writeFileAtomically(runtimeConfigPath, mergedConfig)
  }
  return { repairDetails, error: null }
}

function normalizeDeprecatedCodexHookFeatureFlag(config: string): string {
  if (!config.includes('codex_hooks')) {
    return config
  }

  const lines = config.split('\n')
  const featureSections: { start: number; end: number }[] = []
  let featureStart: number | null = null

  for (let index = 0; index <= lines.length; index += 1) {
    const line = lines[index]
    const isHeader = line === undefined || /^[ \t]*\[[^\]]+\][ \t]*(?:#.*)?$/.test(line)
    if (!isHeader) {
      continue
    }

    if (featureStart !== null) {
      featureSections.push({ start: featureStart, end: index })
      featureStart = null
    }
    if (line !== undefined && /^[ \t]*\[features\][ \t]*(?:#.*)?$/.test(line)) {
      featureStart = index
    }
  }

  for (const section of featureSections.reverse()) {
    normalizeFeatureSectionLines(lines, section.start + 1, section.end)
  }
  return lines.join('\n')
}

function normalizeFeatureSectionLines(lines: string[], start: number, end: number): void {
  const deprecatedIndexes: number[] = []
  let hasHooksKey = false
  for (let index = start; index < end; index += 1) {
    const line = lines[index] ?? ''
    if (/^[ \t]*hooks[ \t]*=/.test(line)) {
      hasHooksKey = true
    }
    if (/^[ \t]*codex_hooks[ \t]*=/.test(line)) {
      deprecatedIndexes.push(index)
    }
  }
  if (deprecatedIndexes.length === 0) {
    return
  }

  if (!hasHooksKey) {
    const firstDeprecatedIndex = deprecatedIndexes.shift()
    if (firstDeprecatedIndex !== undefined) {
      // Why: Codex 0.133 warns on the old key. Mirror into Orca's runtime
      // config using the new key without rewriting the user's real config.
      lines[firstDeprecatedIndex] = lines[firstDeprecatedIndex]!.replace(
        /^([ \t]*)codex_hooks([ \t]*=)/,
        '$1hooks$2'
      )
    }
  }

  for (const index of deprecatedIndexes.reverse()) {
    lines.splice(index, 1)
  }
}

export function seedCodexRuntimeConfigFromSystemConfig(systemConfig: string): string {
  return stripRuntimeOwnedTomlSections(normalizeDeprecatedCodexHookFeatureFlag(systemConfig))
}

export function mergeCodexConfigIntoManagedRuntime(
  runtimeConfig: string,
  systemConfig: string,
  runtimeHooksJsonPath: string,
  options: { preserveRuntimeHookTrust?: boolean } = {}
): { config: string; repairDetails: string[] } {
  const preserveRuntimeHookTrust = options.preserveRuntimeHookTrust !== false
  const runtimeSections = getTomlSections(runtimeConfig)
  const runtimeProjectHeaders = new Set(
    runtimeSections
      .filter((section) => isRuntimeProjectTomlSection(section.header))
      .map((section) => getTomlSectionHeaderKey(section.header))
  )
  const systemUntrustedProjectHeaders = new Set(
    getTomlSections(systemConfig)
      .filter((section) => isRuntimeProjectTomlSection(section.header))
      .filter((section) => getProjectTrustLevel(section.block) === 'untrusted')
      .map((section) => getTomlSectionHeaderKey(section.header))
  )
  const droppedRuntimeHookDeclarationCount = runtimeSections.filter((section) =>
    isHookDeclarationTomlSection(section.header)
  ).length
  const repairDetails: string[] = []
  if (droppedRuntimeHookDeclarationCount > 0) {
    repairDetails.push(
      `Dropped ${droppedRuntimeHookDeclarationCount} non-Orca Codex hook declaration section(s) from managed runtime config.toml.`
    )
    console.warn(
      `[codex-config] dropped ${droppedRuntimeHookDeclarationCount} non-Orca Codex hook declaration section(s) from managed runtime config.toml; move them to a source-preserving Codex layer when available.`
    )
  }
  const preservedRuntimeBlocks = runtimeSections
    .filter((section) =>
      isRuntimePreservedTomlSection(section.header, runtimeHooksJsonPath, preserveRuntimeHookTrust)
    )
    .filter(
      (section) =>
        !isRuntimeProjectTomlSection(section.header) ||
        !systemUntrustedProjectHeaders.has(getTomlSectionHeaderKey(section.header))
    )
    .map((section) => section.block)
  // Why: ordinary Codex settings should mirror ~/.codex. Runtime hook trust and
  // project trust are written under Orca's managed CODEX_HOME and must survive
  // the copy unless the user explicitly revoked project trust in the system config.
  return {
    config: joinTomlBlocks([
      stripRuntimeOwnedTomlSections(
        normalizeDeprecatedCodexHookFeatureFlag(systemConfig),
        runtimeProjectHeaders
      ),
      ...preservedRuntimeBlocks
    ]),
    repairDetails
  }
}

type TomlSection = {
  header: string
  block: string
  start: number
}

type TomlMultilineState = {
  basic: boolean
  literal: boolean
}

type TomlMultilineMode = 'basic' | 'literal' | null

function stripRuntimeOwnedTomlSections(
  config: string,
  runtimeProjectHeaders = new Set<string>()
): string {
  const lines = config.split('\n')
  const sections = getTomlSections(config)
  const firstSectionIndex = sections[0]?.start ?? -1
  const preamble = firstSectionIndex === -1 ? config : lines.slice(0, firstSectionIndex).join('\n')
  const blocks = sections
    .filter((section) => !isRuntimeHookTrustTomlSection(section.header))
    // Why: inline hook declarations carry source path, key, trust, and plugin
    // identity. Copying them into Orca's managed home rewrites that identity.
    .filter((section) => !isHookDeclarationTomlSection(section.header))
    .filter(
      (section) =>
        !isRuntimeProjectTomlSection(section.header) ||
        !runtimeProjectHeaders.has(getTomlSectionHeaderKey(section.header)) ||
        getProjectTrustLevel(section.block) === 'untrusted'
    )
  return joinTomlBlocks([preamble, ...blocks.map((section) => section.block)])
}

function getTomlSections(config: string): TomlSection[] {
  const lines = config.split('\n')
  const sections: TomlSection[] = []
  let sectionStart = -1
  let sectionHeader: string | null = null
  let multilineState: TomlMultilineState = { basic: false, literal: false }

  for (let index = 0; index < lines.length; index += 1) {
    const header = isInsideTomlMultilineString(multilineState)
      ? null
      : getTomlTableHeader(lines[index] ?? '')
    if (!header) {
      multilineState = updateTomlMultilineState(multilineState, lines[index] ?? '')
      continue
    }

    if (sectionStart !== -1) {
      sections.push({
        header: sectionHeader ?? '',
        block: lines.slice(sectionStart, index).join('\n'),
        start: sectionStart
      })
    }
    sectionStart = index
    sectionHeader = header
    multilineState = updateTomlMultilineState(multilineState, lines[index] ?? '')
  }

  if (sectionStart !== -1) {
    sections.push({
      header: sectionHeader ?? '',
      block: lines.slice(sectionStart).join('\n'),
      start: sectionStart
    })
  }
  return sections
}

function isRuntimePreservedTomlSection(
  header: string,
  runtimeHooksJsonPath: string,
  preserveRuntimeHookTrust: boolean
): boolean {
  return (
    (preserveRuntimeHookTrust &&
      shouldPreserveRuntimeHookTrustTomlSection(header, runtimeHooksJsonPath)) ||
    isRuntimeProjectTomlSection(header)
  )
}

function isRuntimeHookTrustTomlSection(header: string): boolean {
  return header.trimStart().startsWith('[hooks.state.')
}

function shouldPreserveRuntimeHookTrustTomlSection(
  header: string,
  runtimeHooksJsonPath: string
): boolean {
  if (!isRuntimeHookTrustTomlSection(header)) {
    return false
  }
  const key = getRuntimeHookTrustKeyFromHeader(header)
  const parsed = key ? parseTrustKey(key) : null
  return (
    parsed !== null &&
    getCodexCanonicalTrustPath(parsed.sourcePath) ===
      getCodexCanonicalTrustPath(runtimeHooksJsonPath)
  )
}

function getRuntimeHookTrustKeyFromHeader(header: string): string | null {
  const match = /^[ \t]*\[hooks\.state\."((?:[^"\\]|\\.)*)"\][ \t]*$/.exec(header)
  return match ? unescapeTomlBasicString(match[1]!) : null
}

function unescapeTomlBasicString(escaped: string): string {
  let result = ''
  for (let index = 0; index < escaped.length; index += 1) {
    const char = escaped[index]
    if (char !== '\\') {
      result += char
      continue
    }
    index += 1
    const next = escaped[index]
    if (next === undefined) {
      result += '\\'
      break
    }
    result +=
      ({ b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' } as Record<string, string>)[next] ?? next
  }
  return result
}

function isHookDeclarationTomlSection(header: string): boolean {
  if (isRuntimeHookTrustTomlSection(header)) {
    return false
  }
  const trimmed = header.trimStart()
  return (
    trimmed.startsWith('[hooks]') || trimmed.startsWith('[hooks.') || trimmed.startsWith('[[hooks.')
  )
}

function isRuntimeProjectTomlSection(header: string): boolean {
  return header.trimStart().startsWith('[projects.')
}

function getTomlSectionHeaderKey(header: string): string {
  return header.trim()
}

function getProjectTrustLevel(block: string): 'trusted' | 'untrusted' | null {
  const match =
    /^[ \t]*trust_level[ \t]*=[ \t]*(?:"(trusted|untrusted)"|'(trusted|untrusted)')[ \t\r]*(?:#.*)?$/m.exec(
      block
    )
  const trustLevel = match?.[1] ?? match?.[2] ?? null
  return trustLevel === 'trusted' || trustLevel === 'untrusted' ? trustLevel : null
}

function joinTomlBlocks(blocks: string[]): string {
  const normalizedBlocks = blocks.map((block) => block.trim()).filter((block) => block.length > 0)
  return normalizedBlocks.length === 0 ? '' : `${normalizedBlocks.join('\n\n')}\n`
}

function getTomlTableHeader(line: string): string | null {
  const match = /^(\s*\[\[?.+\]\]?\s*)(?:#.*)?$/.exec(line)
  return match?.[1] ?? null
}

function isInsideTomlMultilineString(state: TomlMultilineState): boolean {
  return state.basic || state.literal
}

function updateTomlMultilineState(state: TomlMultilineState, line: string): TomlMultilineState {
  let mode: TomlMultilineMode = state.basic ? 'basic' : state.literal ? 'literal' : null
  let index = 0
  while (index < line.length) {
    if (mode === 'basic') {
      if (line[index] === '\\') {
        index += 2
        continue
      }
      if (line.startsWith('"""', index)) {
        mode = null
        index += 3
        continue
      }
      index += 1
      continue
    }
    if (mode === 'literal') {
      if (line.startsWith("'''", index)) {
        mode = null
        index += 3
        continue
      }
      index += 1
      continue
    }

    const char = line[index]
    if (char === '#') {
      break
    }
    if (line.startsWith('"""', index)) {
      mode = 'basic'
      index += 3
      continue
    }
    if (line.startsWith("'''", index)) {
      mode = 'literal'
      index += 3
      continue
    }
    if (char === '"') {
      index = skipTomlBasicString(line, index + 1)
      continue
    }
    if (char === "'") {
      index = skipTomlLiteralString(line, index + 1)
      continue
    }
    index += 1
  }
  return { basic: mode === 'basic', literal: mode === 'literal' }
}

function skipTomlBasicString(line: string, startIndex: number): number {
  let index = startIndex
  while (index < line.length) {
    const char = line[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '"') {
      return index + 1
    }
    index += 1
  }
  return index
}

function skipTomlLiteralString(line: string, startIndex: number): number {
  const endIndex = line.indexOf("'", startIndex)
  return endIndex === -1 ? line.length : endIndex + 1
}
