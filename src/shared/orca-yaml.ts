import { parse } from 'yaml'
import { MAX_QUICK_COMMANDS } from './terminal-quick-commands'
import type {
  OrcaDefaultTabTemplate,
  OrcaHooks,
  OrcaQuickCommandTemplate,
  OrcaVmRecipe,
  OrcaVmRecipeDiagnostic
} from './types'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const DEFAULT_TAB_COLOR_RE = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/
export const ORCA_VM_RECIPE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
export const ORCA_VM_RECIPE_ID_RULE =
  'Use 1-64 lowercase letters, numbers, dots, underscores, or hyphens, starting with a letter or number.'

function normalizeDefaultTabs(value: unknown): OrcaDefaultTabTemplate[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => {
      const record = asRecord(entry)
      if (!record) {
        return null
      }
      const title = asTrimmedString(record.title)
      const command = asTrimmedString(record.command)
      const color = asTrimmedString(record.color)
      const normalizedColor = color && DEFAULT_TAB_COLOR_RE.test(color) ? color : undefined
      if (!title && !command && !normalizedColor) {
        return null
      }
      return {
        ...(title ? { title } : {}),
        ...(normalizedColor ? { color: normalizedColor } : {}),
        ...(command ? { command } : {})
      }
    })
    .filter((entry): entry is OrcaDefaultTabTemplate => entry !== null)
}

function normalizeQuickCommands(value: unknown): OrcaQuickCommandTemplate[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry): OrcaQuickCommandTemplate | null => {
      const record = asRecord(entry)
      if (!record) {
        return null
      }
      const label = asTrimmedString(record.label)
      if (!label) {
        return null
      }
      if (record.action === 'agent-prompt') {
        const agent = asTrimmedString(record.agent)
        const prompt = typeof record.prompt === 'string' ? record.prompt.trimEnd() : ''
        if (!agent || !prompt.trim()) {
          return null
        }
        return { action: 'agent-prompt', label, agent, prompt }
      }
      const rawCommand = typeof record.command === 'string' ? record.command : ''
      // Why: insert-only commands may end with an intentional cursor space, so
      // strip only block-scalar newlines for them instead of a full trimEnd.
      const command =
        record.appendEnter === false ? rawCommand.replace(/[\r\n]+$/, '') : rawCommand.trimEnd()
      if (!command.trim()) {
        return null
      }
      return {
        action: 'terminal-command',
        label,
        command,
        ...(record.appendEnter === false ? { appendEnter: false } : {})
      }
    })
    .filter((entry): entry is OrcaQuickCommandTemplate => entry !== null)
    .slice(0, MAX_QUICK_COMMANDS)
}

type VmRecipeParseResult = {
  recipes: OrcaVmRecipe[]
  diagnostics: OrcaVmRecipeDiagnostic[]
}

function normalizeVmRecipes(value: unknown): VmRecipeParseResult {
  const diagnostics: OrcaVmRecipeDiagnostic[] = []
  if (!Array.isArray(value)) {
    return { recipes: [], diagnostics }
  }

  const seenIds = new Set<string>()
  const recipes = value
    .map((entry, index) => {
      const record = asRecord(entry)
      if (!record) {
        diagnostics.push({
          index,
          message: 'Recipe entry must be a mapping.'
        })
        return null
      }
      const id = asTrimmedString(record.id)
      const name = asTrimmedString(record.name)
      const create = asTrimmedString(record.create) ?? asTrimmedString(record.command)
      if (!id) {
        diagnostics.push({ index, field: 'id', message: 'Recipe id is required.' })
        return null
      }
      if (!ORCA_VM_RECIPE_ID_PATTERN.test(id)) {
        diagnostics.push({
          index,
          field: 'id',
          message: `Invalid recipe id "${id}". ${ORCA_VM_RECIPE_ID_RULE}`
        })
        return null
      }
      if (seenIds.has(id)) {
        diagnostics.push({
          index,
          field: 'id',
          message: `Duplicate recipe id "${id}". Recipe ids must be unique.`
        })
        return null
      }
      if (!name) {
        diagnostics.push({ index, field: 'name', message: `Recipe "${id}" is missing name.` })
        return null
      }
      if (!create) {
        diagnostics.push({ index, field: 'create', message: `Recipe "${id}" is missing create.` })
        return null
      }
      seenIds.add(id)
      const description = asTrimmedString(record.description)
      const suspend = asTrimmedString(record.suspend)
      const resume = asTrimmedString(record.resume)
      const destroyValue = asTrimmedString(record.destroy) ?? asTrimmedString(record.cleanup)
      const destroyDisabled = destroyValue === 'none'
      return {
        id,
        name,
        create,
        ...(description ? { description } : {}),
        ...(suspend ? { suspend } : {}),
        ...(resume ? { resume } : {}),
        ...(destroyValue && !destroyDisabled ? { destroy: destroyValue } : {}),
        ...(destroyDisabled ? { destroyDisabled: true } : {})
      }
    })
    .filter((entry): entry is OrcaVmRecipe => entry !== null)
  return { recipes, diagnostics }
}

/**
 * Parse the supported project defaults from `orca.yaml`.
 */
export function parseOrcaYaml(content: string): OrcaHooks | null {
  let root: unknown
  try {
    root = parse(content)
  } catch {
    return null
  }

  const record = asRecord(root)
  if (!record) {
    return null
  }

  const scriptsRecord = asRecord(record.scripts)
  const setup = scriptsRecord ? asTrimmedString(scriptsRecord.setup) : undefined
  const archive = scriptsRecord ? asTrimmedString(scriptsRecord.archive) : undefined
  const issueCommand = asTrimmedString(record.issueCommand)
  const defaultTabs = normalizeDefaultTabs(record.defaultTabs)
  const quickCommands = normalizeQuickCommands(record.quickCommands)
  const environmentRecipeParse = normalizeVmRecipes(record.environmentRecipes)
  const environmentRecipes = environmentRecipeParse.recipes
  const environmentRecipeDiagnostics = environmentRecipeParse.diagnostics

  if (
    !setup &&
    !archive &&
    !issueCommand &&
    defaultTabs.length === 0 &&
    quickCommands.length === 0 &&
    environmentRecipes.length === 0 &&
    environmentRecipeDiagnostics.length === 0
  ) {
    return null
  }

  return {
    scripts: {
      ...(setup ? { setup } : {}),
      ...(archive ? { archive } : {})
    },
    ...(issueCommand ? { issueCommand } : {}),
    ...(defaultTabs.length > 0 ? { defaultTabs } : {}),
    ...(quickCommands.length > 0 ? { quickCommands } : {}),
    ...(environmentRecipes.length > 0 ? { environmentRecipes } : {}),
    ...(environmentRecipeDiagnostics.length > 0 ? { environmentRecipeDiagnostics } : {})
  }
}
