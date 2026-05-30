/* eslint-disable max-lines -- Why: this suite shares mocked homedir/userData setup across local/system Codex hook install, trust, and legacy-cleanup regressions. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import type * as Os from 'os'
import { join } from 'path'
import { wrapPosixHookCommand } from '../agent-hooks/installer-utils'
import { upsertHookTrustEntriesInContent } from './config-toml-trust'

const { getPathMock, homedirMock } = vi.hoisted(() => ({
  getPathMock: vi.fn<(name: string) => string>(),
  homedirMock: vi.fn<() => string>()
}))

vi.mock('electron', () => ({
  app: {
    getPath: getPathMock
  }
}))

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof Os>()
  return {
    ...actual,
    homedir: homedirMock
  }
})

import { CodexHookService } from './hook-service'

let tmpHome: string
let userDataDir: string
let previousUserDataPath: string | undefined

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'orca-codex-home-'))
  userDataDir = mkdtempSync(join(tmpdir(), 'orca-codex-user-data-'))
  previousUserDataPath = process.env.ORCA_USER_DATA_PATH
  process.env.ORCA_USER_DATA_PATH = userDataDir
  homedirMock.mockReturnValue(tmpHome)
  getPathMock.mockImplementation((name: string) => {
    if (name === 'userData') {
      return userDataDir
    }
    throw new Error(`unexpected app.getPath(${name})`)
  })
})

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true })
  rmSync(userDataDir, { recursive: true, force: true })
  if (previousUserDataPath === undefined) {
    delete process.env.ORCA_USER_DATA_PATH
  } else {
    process.env.ORCA_USER_DATA_PATH = previousUserDataPath
  }
  vi.clearAllMocks()
})

function escapeTomlBasicString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function hookTrustHeader(key: string): string {
  return `[hooks.state."${escapeTomlBasicString(canonicalizeHookTrustKeyForTest(key))}"]`
}

function canonicalizeHookTrustKeyForTest(key: string): string {
  const lastColon = key.lastIndexOf(':')
  const secondLast = lastColon === -1 ? -1 : key.lastIndexOf(':', lastColon - 1)
  const thirdLast = secondLast === -1 ? -1 : key.lastIndexOf(':', secondLast - 1)
  if (thirdLast === -1) {
    return key
  }
  const sourcePath = key.slice(0, thirdLast)
  try {
    return `${realpathSync.native(sourcePath)}${key.slice(thirdLast)}`
  } catch {
    return key
  }
}

describe('CodexHookService', () => {
  it('installs PermissionRequest with trust so Codex approval prompts reach Orca', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      join(systemCodexHome, 'config.toml'),
      'model = "gpt-5.2-codex"\napproval_policy = "on-request"\n',
      'utf-8'
    )

    const status = new CodexHookService().install()

    expect(status.state).toBe('installed')

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    const hooksConfig = JSON.parse(readFileSync(join(managedCodexHome, 'hooks.json'), 'utf-8')) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }

    expect(Object.keys(hooksConfig.hooks).sort()).toEqual(
      [
        'PermissionRequest',
        'PostToolUse',
        'PreToolUse',
        'SessionStart',
        'Stop',
        'UserPromptSubmit'
      ].sort()
    )
    expect(hooksConfig.hooks.PermissionRequest?.[0]?.hooks?.[0]?.command).toContain('agent-hooks')
    expect(hooksConfig.hooks.PermissionRequest?.[0]?.hooks?.[0]?.command).toContain('codex-hook')

    const trustConfig = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(trustConfig).toContain('model = "gpt-5.2-codex"')
    expect(trustConfig).toContain('approval_policy = "on-request"')
    expect(trustConfig).toContain(':permission_request:0:0')
  })

  it('keeps hooks isolated by Orca userData instead of mutating system ~/.codex', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    const systemHooksPath = join(systemCodexHome, 'hooks.json')
    const existingSystemHooks = '{"hooks":{"Stop":[{"hooks":[{"command":"user-hook"}]}]}}\n'
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(systemHooksPath, existingSystemHooks, 'utf-8')

    const devUserDataDir = mkdtempSync(join(tmpdir(), 'orca-dev-codex-user-data-'))
    const prodUserDataDir = mkdtempSync(join(tmpdir(), 'orca-prod-codex-user-data-'))
    try {
      getPathMock.mockImplementation((name: string) => {
        if (name === 'userData') {
          return devUserDataDir
        }
        throw new Error(`unexpected app.getPath(${name})`)
      })
      process.env.ORCA_USER_DATA_PATH = devUserDataDir
      expect(new CodexHookService().install().state).toBe('installed')

      getPathMock.mockImplementation((name: string) => {
        if (name === 'userData') {
          return prodUserDataDir
        }
        throw new Error(`unexpected app.getPath(${name})`)
      })
      process.env.ORCA_USER_DATA_PATH = prodUserDataDir
      expect(new CodexHookService().install().state).toBe('installed')

      const devHooksPath = join(devUserDataDir, 'codex-runtime-home', 'home', 'hooks.json')
      const prodHooksPath = join(prodUserDataDir, 'codex-runtime-home', 'home', 'hooks.json')
      expect(existsSync(devHooksPath)).toBe(true)
      expect(existsSync(prodHooksPath)).toBe(true)
      const devHooks = JSON.parse(readFileSync(devHooksPath, 'utf-8')) as {
        hooks: Record<string, { hooks?: { command?: string }[] }[]>
      }
      const prodHooks = JSON.parse(readFileSync(prodHooksPath, 'utf-8')) as {
        hooks: Record<string, { hooks?: { command?: string }[] }[]>
      }
      expect(JSON.stringify(devHooks)).not.toContain('user-hook')
      expect(JSON.stringify(prodHooks)).not.toContain('user-hook')
      expect(
        devHooks.hooks.Stop?.some((definition) =>
          definition.hooks?.[0]?.command?.includes('codex-hook')
        )
      ).toBe(true)
      expect(
        prodHooks.hooks.Stop?.some((definition) =>
          definition.hooks?.[0]?.command?.includes('codex-hook')
        )
      ).toBe(true)
      expect(readFileSync(systemHooksPath, 'utf-8')).toBe(existingSystemHooks)
    } finally {
      process.env.ORCA_USER_DATA_PATH = userDataDir
      rmSync(devUserDataDir, { recursive: true, force: true })
      rmSync(prodUserDataDir, { recursive: true, force: true })
    }
  })

  it('does not mirror trusted system user hook approvals into the runtime CODEX_HOME', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    const systemHooksPath = join(systemCodexHome, 'hooks.json')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      systemHooksPath,
      `${JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                matcher: '*',
                hooks: [
                  {
                    type: 'command',
                    command: 'user-hook',
                    timeout: 12,
                    async: true,
                    statusMessage: 'Running user hook'
                  }
                ]
              }
            ]
          }
        },
        null,
        2
      )}\n`,
      'utf-8'
    )
    writeFileSync(
      join(systemCodexHome, 'config.toml'),
      upsertHookTrustEntriesInContent('model = "system-model"\n', [
        {
          sourcePath: systemHooksPath,
          eventLabel: 'stop',
          groupIndex: 0,
          handlerIndex: 0,
          command: 'user-hook',
          timeoutSec: 12,
          async: true,
          matcher: '*',
          statusMessage: 'Running user hook'
        }
      ]),
      'utf-8'
    )

    expect(new CodexHookService().install().state).toBe('installed')

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    const managedHooksPath = join(managedCodexHome, 'hooks.json')
    const runtimeHooks = JSON.parse(readFileSync(managedHooksPath, 'utf-8')) as {
      hooks: Record<
        string,
        { matcher?: string; hooks?: { command?: string; statusMessage?: string }[] }[]
      >
    }
    const stopCommands =
      runtimeHooks.hooks.Stop?.flatMap(
        (definition) => definition.hooks?.map((hook) => hook.command ?? '') ?? []
      ) ?? []
    expect(stopCommands).not.toContain('user-hook')
    expect(JSON.stringify(runtimeHooks)).not.toContain('Running user hook')
    expect(stopCommands.some((command) => command.includes('codex-hook'))).toBe(true)

    const runtimeToml = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(runtimeToml).toContain(hookTrustHeader(`${managedHooksPath}:stop:0:0`))
    expect(runtimeToml).not.toContain(hookTrustHeader(`${systemHooksPath}:stop:0:0`))
  })

  it('keeps all system hooks out of runtime CODEX_HOME without mutating them', () => {
    const pluginCommands = [
      'node "${CODEX_PLUGIN_ROOT}/scripts/on-stop.mjs"',
      'node "${CODEX_PLUGIN_DATA}/scripts/on-stop.mjs"',
      'node "${CLAUDE_PLUGIN_ROOT}/scripts/on-stop.mjs"',
      'node "${CLAUDE_PLUGIN_DATA}/scripts/on-stop.mjs"',
      'node "${PLUGIN_ROOT}/scripts/on-stop.mjs"',
      'node "${PLUGIN_DATA}/scripts/on-stop.mjs"',
      'node "$CLAUDE_PLUGIN_ROOT/scripts/on-stop.mjs"',
      'node "${CODEX_PLUGIN_ROOT:-/missing}/scripts/on-stop.mjs"',
      'node "${CODEX_PLUGIN_ROOT-/missing}/scripts/on-stop.mjs"',
      'node "${CODEX_PLUGIN_ROOT+/present}/scripts/on-stop.mjs"',
      'node "${CODEX_PLUGIN_ROOT?missing}/scripts/on-stop.mjs"',
      'node "${CODEX_PLUGIN_ROOT%/}/scripts/on-stop.mjs"',
      'node "${CODEX_PLUGIN_ROOT#prefix}/scripts/on-stop.mjs"',
      'node "${CODEX_PLUGIN_ROOT/scripts/hooks}/on-stop.mjs"',
      'node "${CODEX_PLUGIN_ROOT=/missing}/scripts/on-stop.mjs"',
      'powershell -File "$env:CLAUDE_PLUGIN_ROOT\\scripts\\on-stop.ps1"',
      'powershell -File "${env:CLAUDE_PLUGIN_ROOT}\\scripts\\on-stop.ps1"',
      'cmd /c "%CLAUDE_PLUGIN_ROOT%\\scripts\\on-stop.cmd"',
      'cmd /v:on /c "!CLAUDE_PLUGIN_ROOT!\\scripts\\on-stop.cmd"'
    ]
    const userCommand = 'user-stop-hook'
    const windowsPluginFallbackCommand = 'fallback-command-with-plugin-command-windows'
    const stopEventLabel = 'stop' as const
    const systemCodexHome = join(tmpHome, '.codex')
    const systemHooksPath = join(systemCodexHome, 'hooks.json')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      systemHooksPath,
      `${JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                hooks: [
                  ...pluginCommands.map((command) => ({ type: 'command', command })),
                  {
                    type: 'command',
                    command: windowsPluginFallbackCommand,
                    commandWindows: '%CLAUDE_PLUGIN_ROOT%\\scripts\\on-stop.cmd'
                  },
                  { type: 'command', command: userCommand }
                ]
              }
            ],
            PreCompact: pluginCommands.map((command) => ({
              hooks: [{ type: 'command', command }]
            }))
          }
        },
        null,
        2
      )}\n`,
      'utf-8'
    )
    writeFileSync(
      join(systemCodexHome, 'config.toml'),
      upsertHookTrustEntriesInContent('model = "system-model"\n', [
        ...pluginCommands.map((command, handlerIndex) => ({
          sourcePath: systemHooksPath,
          eventLabel: stopEventLabel,
          groupIndex: 0,
          handlerIndex,
          command
        })),
        {
          sourcePath: systemHooksPath,
          eventLabel: stopEventLabel,
          groupIndex: 0,
          handlerIndex: pluginCommands.length + 1,
          command: userCommand
        }
      ]),
      'utf-8'
    )

    expect(new CodexHookService().install().state).toBe('installed')

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    const managedHooksPath = join(managedCodexHome, 'hooks.json')
    const runtimeHooksText = readFileSync(managedHooksPath, 'utf-8')
    const runtimeHooks = JSON.parse(runtimeHooksText) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }
    const stopCommands =
      runtimeHooks.hooks.Stop?.flatMap(
        (definition) => definition.hooks?.map((hook) => hook.command ?? '') ?? []
      ) ?? []

    expect(stopCommands).not.toContain(userCommand)
    expect(stopCommands).not.toContain(windowsPluginFallbackCommand)
    expect(stopCommands.some((command) => command.includes('codex-hook'))).toBe(true)
    expect(runtimeHooks.hooks.PreCompact).toBeUndefined()
    for (const command of pluginCommands) {
      expect(runtimeHooksText).not.toContain(command)
    }

    const runtimeToml = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(runtimeToml).toContain(hookTrustHeader(`${managedHooksPath}:stop:0:0`))
    for (const command of pluginCommands) {
      expect(runtimeToml).not.toContain(command)
    }
    expect(readFileSync(systemHooksPath, 'utf-8')).toContain('${CLAUDE_PLUGIN_ROOT}')
  })

  it('does not remove ambiguous plugin-placeholder groups from system hooks', () => {
    const pluginCommand = '$CLAUDE_PLUGIN_ROOT/scripts/on-stop.sh'
    const mixedPluginCommand = '%CLAUDE_PLUGIN_ROOT%\\scripts\\on-prompt-submit.cmd'
    const userCommand = 'user-stop-hook'
    const mixedUserCommand = 'user-prompt-hook'
    const windowsPluginFallbackCommand = 'fallback-command-with-plugin-command-windows'
    const systemCodexHome = join(tmpHome, '.codex')
    const systemHooksPath = join(systemCodexHome, 'hooks.json')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      systemHooksPath,
      `${JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                hooks: [{ type: 'command', command: pluginCommand }]
              },
              {
                hooks: [
                  {
                    type: 'command',
                    command: windowsPluginFallbackCommand,
                    commandWindows: '%CLAUDE_PLUGIN_ROOT%\\scripts\\on-stop.cmd'
                  }
                ]
              },
              {
                hooks: [{ type: 'command', command: userCommand }]
              }
            ],
            UserPromptSubmit: [
              {
                hooks: [
                  { type: 'command', command: mixedPluginCommand },
                  { type: 'command', command: mixedUserCommand }
                ]
              }
            ]
          }
        },
        null,
        2
      )}\n`,
      'utf-8'
    )
    writeFileSync(
      join(systemCodexHome, 'config.toml'),
      upsertHookTrustEntriesInContent('model = "system-model"\n', [
        {
          sourcePath: systemHooksPath,
          eventLabel: 'stop',
          groupIndex: 0,
          handlerIndex: 0,
          command: pluginCommand
        },
        {
          sourcePath: systemHooksPath,
          eventLabel: 'stop',
          groupIndex: 1,
          handlerIndex: 0,
          command: windowsPluginFallbackCommand
        },
        {
          sourcePath: systemHooksPath,
          eventLabel: 'stop',
          groupIndex: 2,
          handlerIndex: 0,
          command: userCommand
        },
        {
          sourcePath: systemHooksPath,
          eventLabel: 'user_prompt_submit',
          groupIndex: 0,
          handlerIndex: 0,
          command: mixedPluginCommand
        },
        {
          sourcePath: systemHooksPath,
          eventLabel: 'user_prompt_submit',
          groupIndex: 0,
          handlerIndex: 1,
          command: mixedUserCommand
        }
      ]),
      'utf-8'
    )

    expect(new CodexHookService().install().state).toBe('installed')

    const systemHooksText = readFileSync(systemHooksPath, 'utf-8')
    const systemHooks = JSON.parse(systemHooksText) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }
    const systemCommands =
      Object.values(systemHooks.hooks).flatMap(
        (definitions) =>
          definitions.flatMap(
            (definition) => definition.hooks?.map((hook) => hook.command ?? '') ?? []
          ) ?? []
      ) ?? []
    expect(systemHooksText).toContain(pluginCommand)
    expect(systemHooksText).toContain(windowsPluginFallbackCommand)
    expect(systemCommands).toContain(mixedPluginCommand)
    expect(systemCommands).toContain(userCommand)
    expect(systemCommands).toContain(mixedUserCommand)

    const systemToml = readFileSync(join(systemCodexHome, 'config.toml'), 'utf-8')
    expect(systemToml).toContain(hookTrustHeader(`${systemHooksPath}:stop:1:0`))
    expect(systemToml).toContain(hookTrustHeader(`${systemHooksPath}:stop:2:0`))
    expect(systemToml).toContain(hookTrustHeader(`${systemHooksPath}:stop:0:0`))
    expect(systemToml).toContain(hookTrustHeader(`${systemHooksPath}:user_prompt_submit:0:0`))
  })

  it('does not mirror compact-event user hook approvals or disabled trust entries', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    const systemHooksPath = join(systemCodexHome, 'hooks.json')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      systemHooksPath,
      `${JSON.stringify(
        {
          hooks: {
            PreCompact: [{ hooks: [{ type: 'command', command: 'pre-compact-user' }] }],
            PostCompact: [{ hooks: [{ type: 'command', command: 'post-compact-disabled' }] }]
          }
        },
        null,
        2
      )}\n`,
      'utf-8'
    )
    const disabledPostCompactHeader = hookTrustHeader(`${systemHooksPath}:post_compact:0:0`)
    writeFileSync(
      join(systemCodexHome, 'config.toml'),
      upsertHookTrustEntriesInContent('model = "system-model"\n', [
        {
          sourcePath: systemHooksPath,
          eventLabel: 'pre_compact',
          groupIndex: 0,
          handlerIndex: 0,
          command: 'pre-compact-user'
        },
        {
          sourcePath: systemHooksPath,
          eventLabel: 'post_compact',
          groupIndex: 0,
          handlerIndex: 0,
          command: 'post-compact-disabled'
        }
      ]).replace(
        `${disabledPostCompactHeader}\nenabled = true`,
        `${disabledPostCompactHeader}\nenabled = false`
      ),
      'utf-8'
    )

    expect(new CodexHookService().install().state).toBe('installed')

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    const managedHooksPath = join(managedCodexHome, 'hooks.json')
    const runtimeHooks = JSON.parse(readFileSync(managedHooksPath, 'utf-8')) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }
    expect(runtimeHooks.hooks.PreCompact).toBeUndefined()
    expect(runtimeHooks.hooks.PostCompact).toBeUndefined()

    const runtimeToml = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(runtimeToml).not.toContain(hookTrustHeader(`${managedHooksPath}:pre_compact:0:0`))
    expect(runtimeToml).not.toContain(hookTrustHeader(`${managedHooksPath}:post_compact:0:0`))
    expect(runtimeToml).not.toContain(hookTrustHeader(`${systemHooksPath}:pre_compact:0:0`))
    expect(runtimeToml).not.toContain(hookTrustHeader(`${systemHooksPath}:post_compact:0:0`))
  })

  it('drops trusted runtime-local user hooks during install', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    const systemHooksPath = join(systemCodexHome, 'hooks.json')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      systemHooksPath,
      `${JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'user-hook' }] }] }
      })}\n`,
      'utf-8'
    )
    writeFileSync(join(systemCodexHome, 'config.toml'), 'model = "system-model"\n', 'utf-8')
    const service = new CodexHookService()
    expect(service.install().state).toBe('installed')

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    const managedHooksPath = join(managedCodexHome, 'hooks.json')
    writeFileSync(
      managedHooksPath,
      `${JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'stale-runtime-user-hook' }] }] }
      })}\n`,
      'utf-8'
    )
    writeFileSync(
      join(managedCodexHome, 'config.toml'),
      upsertHookTrustEntriesInContent('model = "runtime-model"\n', [
        {
          sourcePath: managedHooksPath,
          eventLabel: 'stop',
          groupIndex: 0,
          handlerIndex: 0,
          command: 'stale-runtime-user-hook'
        }
      ]),
      'utf-8'
    )

    const reinstallStatus = service.install()
    expect(reinstallStatus.state).toBe('partial')
    expect(reinstallStatus.detail).toContain('Dropped 1 non-Orca Codex hook group(s)')

    const runtimeUserTrustHeader = hookTrustHeader(`${managedHooksPath}:stop:0:0`)
    const runtimeToml = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(runtimeToml).toContain(runtimeUserTrustHeader)
    expect(runtimeToml).not.toContain('stale-runtime-user-hook')
    expect(runtimeToml).toContain(hookTrustHeader(`${managedHooksPath}:stop:0:0`))
    const runtimeHooks = JSON.parse(readFileSync(managedHooksPath, 'utf-8')) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }
    const stopCommands =
      runtimeHooks.hooks.Stop?.flatMap(
        (definition) => definition.hooks?.map((hook) => hook.command ?? '') ?? []
      ) ?? []
    expect(stopCommands).not.toContain('stale-runtime-user-hook')
    expect(stopCommands.some((command) => command.includes('codex-hook'))).toBe(true)
  })

  it('keeps only managed runtime trust when system hook approval changes', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    const systemHooksPath = join(systemCodexHome, 'hooks.json')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      systemHooksPath,
      `${JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'user-hook' }] }] }
      })}\n`,
      'utf-8'
    )
    writeFileSync(
      join(systemCodexHome, 'config.toml'),
      upsertHookTrustEntriesInContent('model = "system-model"\n', [
        {
          sourcePath: systemHooksPath,
          eventLabel: 'stop',
          groupIndex: 0,
          handlerIndex: 0,
          command: 'user-hook'
        }
      ]),
      'utf-8'
    )
    const service = new CodexHookService()
    expect(service.install().state).toBe('installed')

    writeFileSync(join(systemCodexHome, 'config.toml'), 'model = "system-model"\n', 'utf-8')
    expect(service.install().state).toBe('installed')

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    const managedHooksPath = join(managedCodexHome, 'hooks.json')
    const runtimeHooks = JSON.parse(readFileSync(managedHooksPath, 'utf-8')) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }
    const stopCommands =
      runtimeHooks.hooks.Stop?.flatMap(
        (definition) => definition.hooks?.map((hook) => hook.command ?? '') ?? []
      ) ?? []
    expect(stopCommands).not.toContain('user-hook')
    expect(stopCommands.some((command) => command.includes('codex-hook'))).toBe(true)

    const runtimeToml = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(runtimeToml).toContain(hookTrustHeader(`${managedHooksPath}:stop:0:0`))
    expect(runtimeToml).not.toContain(hookTrustHeader(`${managedHooksPath}:stop:1:0`))
  })

  it('drops stale runtime hooks during install', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(join(systemCodexHome, 'config.toml'), 'model = "system-model"\n', 'utf-8')

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    const managedHooksPath = join(managedCodexHome, 'hooks.json')
    mkdirSync(managedCodexHome, { recursive: true })
    writeFileSync(
      managedHooksPath,
      `${JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'old-mirrored-user-hook' }] }] }
      })}\n`,
      'utf-8'
    )
    writeFileSync(
      join(managedCodexHome, 'config.toml'),
      upsertHookTrustEntriesInContent('model = "runtime-model"\n', [
        {
          sourcePath: managedHooksPath,
          eventLabel: 'stop',
          groupIndex: 0,
          handlerIndex: 0,
          command: 'old-mirrored-user-hook'
        }
      ]),
      'utf-8'
    )

    const status = new CodexHookService().install()
    expect(status.state).toBe('partial')
    expect(status.detail).toContain('Dropped 1 non-Orca Codex hook group(s)')

    const runtimeHooks = JSON.parse(readFileSync(managedHooksPath, 'utf-8')) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }
    const stopCommands =
      runtimeHooks.hooks.Stop?.flatMap(
        (definition) => definition.hooks?.map((hook) => hook.command ?? '') ?? []
      ) ?? []
    expect(stopCommands).not.toContain('old-mirrored-user-hook')

    const runtimeToml = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(runtimeToml).not.toContain('old-mirrored-user-hook')
    expect(runtimeToml).toContain(hookTrustHeader(`${managedHooksPath}:stop:0:0`))
  })

  it('drops stale inline hook declarations during install', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(join(systemCodexHome, 'config.toml'), 'model = "system-model"\n', 'utf-8')

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    mkdirSync(managedCodexHome, { recursive: true })
    writeFileSync(
      join(managedCodexHome, 'config.toml'),
      [
        'model = "runtime-model"',
        '',
        '[[hooks.Stop]]',
        '[[hooks.Stop.hooks]]',
        'type = "command"',
        'command = "old-mirrored-inline-hook"',
        ''
      ].join('\n'),
      'utf-8'
    )

    const status = new CodexHookService().install()
    expect(status.state).toBe('partial')
    expect(status.detail).toContain('Dropped 2 non-Orca Codex hook declaration section(s)')

    const runtimeToml = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(runtimeToml).toContain('model = "system-model"')
    expect(runtimeToml).not.toContain('old-mirrored-inline-hook')
  })

  it('drops stale runtime hooks without requiring mirror state', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(join(systemCodexHome, 'config.toml'), 'model = "system-model"\n', 'utf-8')

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    const managedHooksPath = join(managedCodexHome, 'hooks.json')
    mkdirSync(managedCodexHome, { recursive: true })
    writeFileSync(
      join(managedCodexHome, 'orca-system-hook-mirror-state.json'),
      '{not json',
      'utf-8'
    )
    writeFileSync(
      managedHooksPath,
      `${JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'old-mirrored-user-hook' }] }] }
      })}\n`,
      'utf-8'
    )

    const status = new CodexHookService().install()
    expect(status.state).toBe('partial')
    expect(status.detail).toContain('Dropped 1 non-Orca Codex hook group(s)')

    const runtimeHooks = JSON.parse(readFileSync(managedHooksPath, 'utf-8')) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }
    const stopCommands =
      runtimeHooks.hooks.Stop?.flatMap(
        (definition) => definition.hooks?.map((hook) => hook.command ?? '') ?? []
      ) ?? []
    expect(stopCommands).not.toContain('old-mirrored-user-hook')
  })

  it('drops runtime-local hooks instead of rekeying them after removing mirrors', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    const systemHooksPath = join(systemCodexHome, 'hooks.json')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      systemHooksPath,
      `${JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'system-hook' }] }] }
      })}\n`,
      'utf-8'
    )
    writeFileSync(
      join(systemCodexHome, 'config.toml'),
      upsertHookTrustEntriesInContent('model = "system-model"\n', [
        {
          sourcePath: systemHooksPath,
          eventLabel: 'stop',
          groupIndex: 0,
          handlerIndex: 0,
          command: 'system-hook'
        }
      ]),
      'utf-8'
    )
    const service = new CodexHookService()
    expect(service.install().state).toBe('installed')

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    const managedHooksPath = join(managedCodexHome, 'hooks.json')
    writeFileSync(
      managedHooksPath,
      `${JSON.stringify({
        hooks: {
          Stop: [
            { hooks: [{ type: 'command', command: 'system-hook' }] },
            { hooks: [{ type: 'command', command: 'runtime-local-hook' }] }
          ]
        }
      })}\n`,
      'utf-8'
    )
    writeFileSync(
      join(managedCodexHome, 'config.toml'),
      upsertHookTrustEntriesInContent('model = "runtime-model"\n', [
        {
          sourcePath: managedHooksPath,
          eventLabel: 'stop',
          groupIndex: 1,
          handlerIndex: 0,
          command: 'runtime-local-hook'
        }
      ]),
      'utf-8'
    )

    writeFileSync(join(systemCodexHome, 'config.toml'), 'model = "system-model"\n', 'utf-8')
    const reinstallStatus = service.install()
    expect(reinstallStatus.state).toBe('partial')
    expect(reinstallStatus.detail).toContain('Dropped 2 non-Orca Codex hook group(s)')

    const runtimeHooks = JSON.parse(readFileSync(managedHooksPath, 'utf-8')) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }
    expect(runtimeHooks.hooks.Stop?.[0]?.hooks?.[0]?.command).toContain('codex-hook')
    const runtimeToml = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(runtimeToml).toContain(hookTrustHeader(`${managedHooksPath}:stop:0:0`))
    expect(runtimeToml).not.toContain('runtime-local-hook')
  })

  it('ignores system user hook changes while keeping managed status hooks installed', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    const systemHooksPath = join(systemCodexHome, 'hooks.json')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      systemHooksPath,
      `${JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'user-hook-old' }] }] }
      })}\n`,
      'utf-8'
    )

    const service = new CodexHookService()
    expect(service.install().state).toBe('installed')

    writeFileSync(
      systemHooksPath,
      `${JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'user-hook-new' }] }] }
      })}\n`,
      'utf-8'
    )
    expect(service.install().state).toBe('installed')

    const managedHooksPath = join(userDataDir, 'codex-runtime-home', 'home', 'hooks.json')
    const runtimeHooks = JSON.parse(readFileSync(managedHooksPath, 'utf-8')) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }
    const stopCommands =
      runtimeHooks.hooks.Stop?.flatMap(
        (definition) => definition.hooks?.map((hook) => hook.command ?? '') ?? []
      ) ?? []
    expect(stopCommands).not.toContain('user-hook-new')
    expect(stopCommands).not.toContain('user-hook-old')
    expect(stopCommands.some((command) => command.includes('codex-hook'))).toBe(true)
  })

  it('refreshes runtime user hooks without installing Orca-managed hooks', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    const systemHooksPath = join(systemCodexHome, 'hooks.json')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      systemHooksPath,
      `${JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'user-stop-hook' }] }] }
      })}\n`,
      'utf-8'
    )
    const disabledStopHeader = hookTrustHeader(`${systemHooksPath}:stop:0:0`)
    writeFileSync(
      join(systemCodexHome, 'config.toml'),
      upsertHookTrustEntriesInContent('model = "system-model"\n', [
        {
          sourcePath: systemHooksPath,
          eventLabel: 'stop',
          groupIndex: 0,
          handlerIndex: 0,
          command: 'user-stop-hook'
        }
      ]).replace(`${disabledStopHeader}\nenabled = true`, `${disabledStopHeader}\nenabled = false`),
      'utf-8'
    )

    const service = new CodexHookService()
    expect(service.install().state).toBe('installed')

    const status = service.refreshRuntimeUserHooks()

    expect(status.state).toBe('not_installed')
    expect(status.managedHooksPresent).toBe(false)
    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    const managedHooksPath = join(managedCodexHome, 'hooks.json')
    const runtimeHooks = JSON.parse(readFileSync(managedHooksPath, 'utf-8')) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }
    const runtimeCommands = Object.values(runtimeHooks.hooks).flatMap((definitions) =>
      definitions.flatMap((definition) => definition.hooks?.map((hook) => hook.command ?? '') ?? [])
    )
    expect(runtimeCommands).toEqual([])
    expect(runtimeCommands.some((command) => command.includes('codex-hook'))).toBe(false)

    const runtimeToml = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(runtimeToml).not.toContain(hookTrustHeader(`${managedHooksPath}:stop:0:0`))
    expect(runtimeToml).not.toContain(':permission_request:0:0')
  })

  it('removes legacy Orca-managed hooks from system ~/.codex during install', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    const systemHooksPath = join(systemCodexHome, 'hooks.json')
    const legacyScriptPath = join(
      tmpHome,
      '.orca',
      'agent-hooks',
      process.platform === 'win32' ? 'codex-hook.cmd' : 'codex-hook.sh'
    )
    const legacyCommand =
      process.platform === 'win32' ? legacyScriptPath : wrapPosixHookCommand(legacyScriptPath)
    const unrelatedAgentHooksCommand =
      process.platform === 'win32'
        ? join(tmpHome, 'user-tools', 'agent-hooks', 'codex-hook.cmd')
        : wrapPosixHookCommand(join(tmpHome, 'user-tools', 'agent-hooks', 'codex-hook.sh'))
    const oldSharedScriptPath = join(
      tmpHome,
      '.orca',
      'agent-hooks',
      process.platform === 'win32' ? 'codex-hook.cmd' : 'codex-hook.sh'
    )
    const oldSharedCommand =
      process.platform === 'win32' ? oldSharedScriptPath : `/bin/sh '${oldSharedScriptPath}'`
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      systemHooksPath,
      `${JSON.stringify(
        {
          hooks: {
            Stop: [
              { hooks: [{ type: 'command', command: 'user-hook' }] },
              { hooks: [{ type: 'command', command: unrelatedAgentHooksCommand }] },
              { hooks: [{ type: 'command', command: legacyCommand }] },
              { hooks: [{ type: 'command', command: oldSharedCommand }] }
            ],
            SessionStart: [{ hooks: [{ type: 'command', command: legacyCommand }] }]
          }
        },
        null,
        2
      )}\n`,
      'utf-8'
    )
    writeFileSync(
      join(systemCodexHome, 'config.toml'),
      upsertHookTrustEntriesInContent('model = "system-model"\n', [
        {
          sourcePath: systemHooksPath,
          eventLabel: 'stop',
          groupIndex: 1,
          handlerIndex: 0,
          command: legacyCommand
        },
        {
          sourcePath: systemHooksPath,
          eventLabel: 'session_start',
          groupIndex: 0,
          handlerIndex: 0,
          command: legacyCommand
        },
        {
          sourcePath: systemHooksPath,
          eventLabel: 'stop',
          groupIndex: 3,
          handlerIndex: 0,
          command: oldSharedCommand
        }
      ]),
      'utf-8'
    )

    expect(new CodexHookService().install().state).toBe('installed')

    const systemHooks = JSON.parse(readFileSync(systemHooksPath, 'utf-8')) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }
    expect(systemHooks.hooks.Stop).toEqual([
      { hooks: [{ type: 'command', command: 'user-hook' }] },
      { hooks: [{ type: 'command', command: unrelatedAgentHooksCommand }] }
    ])
    expect(systemHooks.hooks.SessionStart).toBeUndefined()
    const systemToml = readFileSync(join(systemCodexHome, 'config.toml'), 'utf-8')
    expect(systemToml).toContain('model = "system-model"')
    expect(systemToml).not.toContain(':stop:2:0')
    expect(systemToml).not.toContain(':stop:3:0')
    expect(systemToml).not.toContain(':session_start:0:0')
  })

  it('removes the legacy Orca Codex profile file when it only contains managed hooks', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    const profilePath = join(systemCodexHome, 'orca-agent-status.config.toml')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      profilePath,
      [
        '# BEGIN ORCA AGENT STATUS HOOKS',
        '[[hooks.PermissionRequest]]',
        '[[hooks.PermissionRequest.hooks]]',
        'type = "command"',
        'command = "codex-hook"',
        '# END ORCA AGENT STATUS HOOKS',
        ''
      ].join('\n'),
      'utf-8'
    )

    expect(new CodexHookService().install().state).toBe('installed')

    expect(existsSync(profilePath)).toBe(false)
  })

  it('removes only the legacy Orca block from a user-edited Codex profile file', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    const profilePath = join(systemCodexHome, 'orca-agent-status.config.toml')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      profilePath,
      [
        'model = "gpt-5.5"',
        '',
        '# BEGIN ORCA AGENT STATUS HOOKS',
        '[[hooks.PermissionRequest]]',
        '[[hooks.PermissionRequest.hooks]]',
        'type = "command"',
        'command = "codex-hook"',
        '# END ORCA AGENT STATUS HOOKS',
        ''
      ].join('\n'),
      'utf-8'
    )

    expect(new CodexHookService().install().state).toBe('installed')

    const profileConfig = readFileSync(profilePath, 'utf-8')
    expect(profileConfig).toContain('model = "gpt-5.5"')
    expect(profileConfig).not.toContain('ORCA AGENT STATUS HOOKS')
    expect(profileConfig).not.toContain('codex-hook')
  })

  it('cleans legacy system and profile hooks when runtime hooks.json is malformed during remove', () => {
    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    mkdirSync(managedCodexHome, { recursive: true })
    writeFileSync(join(managedCodexHome, 'hooks.json'), '{not json', 'utf-8')

    const systemCodexHome = join(tmpHome, '.codex')
    const systemHooksPath = join(systemCodexHome, 'hooks.json')
    const profilePath = join(systemCodexHome, 'orca-agent-status.config.toml')
    const legacyScriptPath = join(
      tmpHome,
      '.orca',
      'agent-hooks',
      process.platform === 'win32' ? 'codex-hook.cmd' : 'codex-hook.sh'
    )
    const legacyCommand =
      process.platform === 'win32' ? legacyScriptPath : wrapPosixHookCommand(legacyScriptPath)
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      systemHooksPath,
      `${JSON.stringify(
        {
          hooks: {
            Stop: [
              { hooks: [{ type: 'command', command: 'user-hook' }] },
              { hooks: [{ type: 'command', command: legacyCommand }] }
            ],
            SessionStart: [{ hooks: [{ type: 'command', command: legacyCommand }] }]
          }
        },
        null,
        2
      )}\n`,
      'utf-8'
    )
    writeFileSync(
      profilePath,
      [
        '# BEGIN ORCA AGENT STATUS HOOKS',
        '[[hooks.PermissionRequest]]',
        '[[hooks.PermissionRequest.hooks]]',
        'type = "command"',
        'command = "codex-hook"',
        '# END ORCA AGENT STATUS HOOKS',
        ''
      ].join('\n'),
      'utf-8'
    )

    const status = new CodexHookService().remove()

    expect(status.state).toBe('error')
    expect(status.detail).toBe('Could not parse Codex hooks.json')
    const systemHooks = JSON.parse(readFileSync(systemHooksPath, 'utf-8')) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }
    expect(systemHooks.hooks.Stop).toEqual([{ hooks: [{ type: 'command', command: 'user-hook' }] }])
    expect(systemHooks.hooks.SessionStart).toBeUndefined()
    expect(existsSync(profilePath)).toBe(false)
  })

  it('cleans duplicate Codex hook representations while keeping status hooks in runtime CODEX_HOME', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    const systemHooksPath = join(systemCodexHome, 'hooks.json')
    const systemTomlPath = join(systemCodexHome, 'config.toml')
    const legacyProfilePath = join(systemCodexHome, 'orca-agent-status.config.toml')
    const legacyScriptPath = join(
      tmpHome,
      '.orca',
      'agent-hooks',
      process.platform === 'win32' ? 'codex-hook.cmd' : 'codex-hook.sh'
    )
    const legacyCommand =
      process.platform === 'win32' ? legacyScriptPath : wrapPosixHookCommand(legacyScriptPath)
    const userCommand = 'user-stop-hook'
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      systemHooksPath,
      `${JSON.stringify(
        {
          hooks: {
            Stop: [
              { hooks: [{ type: 'command', command: userCommand }] },
              { hooks: [{ type: 'command', command: legacyCommand }] }
            ],
            SessionStart: [{ hooks: [{ type: 'command', command: legacyCommand }] }]
          }
        },
        null,
        2
      )}\n`,
      'utf-8'
    )
    writeFileSync(
      systemTomlPath,
      upsertHookTrustEntriesInContent(
        ['model = "system-model"', '', '[features]', 'codex_hooks = true', ''].join('\n'),
        [
          {
            sourcePath: systemHooksPath,
            eventLabel: 'stop',
            groupIndex: 0,
            handlerIndex: 0,
            command: userCommand
          },
          {
            sourcePath: systemHooksPath,
            eventLabel: 'session_start',
            groupIndex: 0,
            handlerIndex: 0,
            command: legacyCommand
          }
        ]
      ),
      'utf-8'
    )
    writeFileSync(
      legacyProfilePath,
      [
        '# BEGIN ORCA AGENT STATUS HOOKS',
        '[[hooks.PermissionRequest]]',
        '[[hooks.PermissionRequest.hooks]]',
        'type = "command"',
        'command = "codex-hook"',
        '# END ORCA AGENT STATUS HOOKS',
        ''
      ].join('\n'),
      'utf-8'
    )

    const service = new CodexHookService()
    expect(service.install().state).toBe('installed')

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    const managedHooksPath = join(managedCodexHome, 'hooks.json')
    const runtimeHooks = JSON.parse(readFileSync(managedHooksPath, 'utf-8')) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }
    const stopCommands =
      runtimeHooks.hooks.Stop?.flatMap(
        (definition) => definition.hooks?.map((hook) => hook.command ?? '') ?? []
      ) ?? []
    expect(stopCommands).not.toContain(userCommand)
    expect(stopCommands.some((command) => command.includes('codex-hook'))).toBe(true)
    expect(runtimeHooks.hooks.PermissionRequest?.[0]?.hooks?.[0]?.command).toContain('codex-hook')

    const runtimeToml = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(runtimeToml).toContain('[features]\nhooks = true')
    expect(runtimeToml).not.toContain('codex_hooks')
    expect(runtimeToml).toContain(hookTrustHeader(`${managedHooksPath}:stop:0:0`))
    expect(runtimeToml).toContain(hookTrustHeader(`${managedHooksPath}:permission_request:0:0`))

    const systemHooks = JSON.parse(readFileSync(systemHooksPath, 'utf-8')) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }
    expect(systemHooks.hooks.Stop).toEqual([{ hooks: [{ type: 'command', command: userCommand }] }])
    expect(systemHooks.hooks.SessionStart).toBeUndefined()
    const systemToml = readFileSync(systemTomlPath, 'utf-8')
    expect(systemToml).toContain('codex_hooks = true')
    expect(systemToml).not.toContain(':session_start:0:0')
    expect(existsSync(legacyProfilePath)).toBe(false)
    expect(service.getStatus().state).toBe('installed')
  })

  it('removes managed trust entries when userData resolves through a symlink', () => {
    const linkedUserDataDir = join(tmpHome, 'linked-user-data')
    symlinkSync(userDataDir, linkedUserDataDir, process.platform === 'win32' ? 'junction' : 'dir')
    process.env.ORCA_USER_DATA_PATH = linkedUserDataDir

    const service = new CodexHookService()
    expect(service.install().state).toBe('installed')

    const linkedManagedCodexHome = join(linkedUserDataDir, 'codex-runtime-home', 'home')
    const linkedHooksPath = join(linkedManagedCodexHome, 'hooks.json')
    let runtimeToml = readFileSync(join(linkedManagedCodexHome, 'config.toml'), 'utf-8')
    expect(runtimeToml).toContain(hookTrustHeader(`${linkedHooksPath}:permission_request:0:0`))

    const status = service.remove()

    expect(status.state).toBe('not_installed')
    runtimeToml = readFileSync(join(linkedManagedCodexHome, 'config.toml'), 'utf-8')
    expect(runtimeToml).not.toContain(':permission_request:0:0')
    expect(runtimeToml).not.toContain(':stop:0:0')
  })

  it('mirrors system Codex config while removing stale runtime hook trust on hook install', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(join(systemCodexHome, 'config.toml'), 'model = "system-model"\n', 'utf-8')

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    const managedHooksPath = join(managedCodexHome, 'hooks.json')
    mkdirSync(managedCodexHome, { recursive: true })
    writeFileSync(
      join(managedCodexHome, 'config.toml'),
      [
        'model = "runtime-model"',
        '',
        `[hooks.state."${managedHooksPath}:stop:0:0"]`,
        'enabled = false',
        'trusted_hash = "sha256:runtime"',
        ''
      ].join('\n'),
      'utf-8'
    )

    const status = new CodexHookService().install()

    expect(status.state).toBe('installed')
    const trustConfig = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(trustConfig).toContain('model = "system-model"')
    expect(trustConfig).toContain(hookTrustHeader(`${managedHooksPath}:stop:0:0`))
    expect(trustConfig).not.toContain('trusted_hash = "sha256:runtime"')
    expect(trustConfig).toContain(':permission_request:0:0')
    expect(trustConfig).not.toContain('model = "runtime-model"')
  })

  it('preserves runtime-only project trust while honoring system project untrust', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      join(systemCodexHome, 'config.toml'),
      ['model = "system-model"', '', '[projects."/repo"]', 'trust_level = "untrusted"', ''].join(
        '\n'
      ),
      'utf-8'
    )

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    mkdirSync(managedCodexHome, { recursive: true })
    writeFileSync(
      join(managedCodexHome, 'config.toml'),
      [
        'model = "runtime-model"',
        '',
        '[projects."/repo"]',
        'trust_level = "trusted"',
        '',
        '[projects."/runtime-only"]',
        'trust_level = "trusted"',
        ''
      ].join('\n'),
      'utf-8'
    )

    const status = new CodexHookService().install()

    expect(status.state).toBe('installed')
    const trustConfig = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(trustConfig).toContain('model = "system-model"')
    expect(trustConfig).toContain('[projects."/repo"]\ntrust_level = "untrusted"')
    expect(trustConfig).toContain('[projects."/runtime-only"]\ntrust_level = "trusted"')
    expect(trustConfig).not.toContain('model = "runtime-model"')
  })
})
