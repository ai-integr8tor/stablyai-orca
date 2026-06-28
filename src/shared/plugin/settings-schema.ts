// A minimal JSON-Schema-subset validator for plugin settings. Plugin authors
// declare `settingsSchema` (JSON Schema) in their manifest; the settings store
// validates writes against it. Lives in `src/shared/` so both the Electron main
// store and the electron-free relay store validate identically.
//
// Intentionally a SUBSET — enough to validate plain settings objects without a
// heavy dependency: type, properties, required, items, enum, additionalProperties.
// Full JSON Schema (refs, allOf/anyOf, formats, etc.) is deferred.

export type JsonSchemaType =
  | 'object'
  | 'array'
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'null'

export type JsonSchema = {
  type?: JsonSchemaType
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: unknown[]
  additionalProperties?: boolean
}

export type SchemaValidation = { ok: true } | { ok: false; errors: string[] }

function typeOf(value: unknown): JsonSchemaType {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  if (Number.isInteger(value)) {
    return 'integer'
  }
  return typeof value as JsonSchemaType
}

function matchesType(value: unknown, expected: JsonSchemaType): boolean {
  const actual = typeOf(value)
  if (expected === 'number') {
    return actual === 'number' || actual === 'integer'
  }
  return actual === expected
}

function validate(value: unknown, schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.enum && !schema.enum.some((option) => option === value)) {
    errors.push(`${path}: value is not one of the allowed options`)
  }

  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${path}: expected ${schema.type}, got ${typeOf(value)}`)
    return
  }

  if (schema.type === 'object' && typeOf(value) === 'object') {
    const obj = value as Record<string, unknown>
    for (const key of schema.required ?? []) {
      if (!(key in obj)) {
        errors.push(`${path}.${key}: required`)
      }
    }
    if (schema.properties) {
      for (const [key, child] of Object.entries(schema.properties)) {
        if (key in obj) {
          validate(obj[key], child, `${path}.${key}`, errors)
        }
      }
    }
    if (schema.additionalProperties === false) {
      // With no `properties` declared, every key is "additional" and rejected.
      const allowed = new Set(Object.keys(schema.properties ?? {}))
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) {
          errors.push(`${path}.${key}: additional property not allowed`)
        }
      }
    }
  }

  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) =>
      validate(item, schema.items as JsonSchema, `${path}[${index}]`, errors)
    )
  }
}

export function validateAgainstSchema(
  value: unknown,
  schema: Record<string, unknown>
): SchemaValidation {
  const errors: string[] = []
  validate(value, schema as JsonSchema, '$', errors)
  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}
