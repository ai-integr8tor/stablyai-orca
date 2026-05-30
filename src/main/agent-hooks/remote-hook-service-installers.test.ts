/* eslint-disable max-lines -- Why: this fixture verifies the shared remote hook installer fake across every managed agent so SSH regressions are caught together. */
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SFTPWrapper } from 'ssh2'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/orca-user-data'
  }
}))

import { CodexHookService } from '../codex/hook-service'
import { CursorHookService } from '../cursor/hook-service'
import { CommandCodeHookService } from '../command-code/hook-service'
import { GeminiHookService } from '../gemini/hook-service'
import { AntigravityHookService } from '../antigravity/hook-service'
import { AmpHookService } from '../amp/hook-service'
import { ClaudeHookService } from '../claude/hook-service'
import { GrokHookService } from '../grok/hook-service'
import { CopilotHookService } from '../copilot/hook-service'
import { HermesHookService } from '../hermes/hook-service'
import { openClaudeHookService } from '../openclaude/hook-service'

type FakeFs = {
  files: Map<string, string>
  dirs: Set<string>
  modes: Map<string, number>
  realpaths: Map<string, string>
  failWriteTo: Set<string>
  failRenameTo: Set<string>
}

function createFakeSftp(
  initialFiles: Record<string, string> = {},
  options: { realpaths?: Record<string, string> } = {}
): {
  sftp: SFTPWrapper
  fs: FakeFs
} {
  const fs: FakeFs = {
    files: new Map(Object.entries(initialFiles)),
    dirs: new Set(['/']),
    modes: new Map(),
    realpaths: new Map(Object.entries(options.realpaths ?? {})),
    failWriteTo: new Set(),
    failRenameTo: new Set()
  }
  const noEntryError = (path: string): { code: number; message: string } => ({
    code: 2,
    message: `ENOENT ${path}`
  })
  const fakeStats = (mode: number): { mode: number } => ({ mode })

  const sftp = {
    readFile: (path: string, _enc: string, cb: (err: unknown, data?: string) => void): void => {
      const v = fs.files.get(path)
      if (v === undefined) {
        cb(noEntryError(path))
        return
      }
      cb(null, v)
    },
    writeFile: (
      path: string,
      content: string,
      options: string | { mode?: number },
      cb: (err: unknown) => void
    ): void => {
      if (fs.failWriteTo.has(path)) {
        cb({ code: 4, message: `write failed ${path}` })
        return
      }
      fs.files.set(path, content)
      if (typeof options !== 'string' && options.mode !== undefined) {
        fs.modes.set(path, options.mode)
      }
      cb(null)
    },
    rename: (src: string, dst: string, cb: (err: unknown) => void): void => {
      if (fs.failRenameTo.has(dst)) {
        cb(Object.assign(new Error(`rename failed ${dst}`), { code: 4 }))
        return
      }
      const v = fs.files.get(src)
      if (v === undefined) {
        cb(noEntryError(src))
        return
      }
      fs.files.set(dst, v)
      fs.files.delete(src)
      const mode = fs.modes.get(src)
      if (mode !== undefined) {
        fs.modes.set(dst, mode)
        fs.modes.delete(src)
      }
      cb(null)
    },
    unlink: (path: string, cb: (err: unknown) => void): void => {
      fs.files.delete(path)
      fs.modes.delete(path)
      cb(null)
    },
    chmod: (path: string, mode: number, cb: (err: unknown) => void): void => {
      fs.modes.set(path, mode)
      cb(null)
    },
    stat: (path: string, cb: (err: unknown, stats?: { mode: number }) => void): void => {
      if (!fs.files.has(path)) {
        cb(noEntryError(path))
        return
      }
      cb(null, fakeStats(fs.modes.get(path) ?? 0o100644))
    },
    realpath: (path: string, cb: (err: unknown, resolvedPath?: string) => void): void => {
      if (!fs.files.has(path)) {
        cb(noEntryError(path))
        return
      }
      cb(null, fs.realpaths.get(path) ?? path)
    },
    readdir: (path: string, cb: (err: unknown, list?: { filename: string }[]) => void): void => {
      if (fs.dirs.has(path)) {
        cb(null, [])
        return
      }
      cb(noEntryError(path))
    },
    mkdir: (path: string, cb: (err: unknown) => void): void => {
      fs.dirs.add(path)
      cb(null)
    }
  } as unknown as SFTPWrapper
  return { sftp, fs }
}

describe('remote hook service installers', () => {
  it('always writes POSIX scripts for SSH remotes even from a Windows host', async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      const installers = [
        {
          path: '/home/dev/.orca/agent-hooks/claude-hook.sh',
          install: (sftp: SFTPWrapper) => new ClaudeHookService().installRemote(sftp, '/home/dev')
        },
        {
          path: '/home/dev/.orca/agent-hooks/openclaude-hook.sh',
          install: (sftp: SFTPWrapper) => openClaudeHookService.installRemote(sftp, '/home/dev')
        },
        {
          path: '/home/dev/.orca/agent-hooks/codex-hook.sh',
          install: (sftp: SFTPWrapper) => new CodexHookService().installRemote(sftp, '/home/dev')
        },
        {
          path: '/home/dev/.orca/agent-hooks/gemini-hook.sh',
          install: (sftp: SFTPWrapper) => new GeminiHookService().installRemote(sftp, '/home/dev')
        },
        {
          path: '/home/dev/.orca/agent-hooks/antigravity-hook.sh',
          install: (sftp: SFTPWrapper) =>
            new AntigravityHookService().installRemote(sftp, '/home/dev')
        },
        {
          path: '/home/dev/.config/amp/plugins/orca-agent-status.ts',
          install: (sftp: SFTPWrapper) => new AmpHookService().installRemote(sftp, '/home/dev')
        },
        {
          path: '/home/dev/.orca/agent-hooks/cursor-hook.sh',
          install: (sftp: SFTPWrapper) => new CursorHookService().installRemote(sftp, '/home/dev')
        },
        {
          path: '/home/dev/.orca/agent-hooks/command-code-hook.sh',
          install: (sftp: SFTPWrapper) =>
            new CommandCodeHookService().installRemote(sftp, '/home/dev')
        },
        {
          path: '/home/dev/.orca/agent-hooks/grok-hook.sh',
          install: (sftp: SFTPWrapper) => new GrokHookService().installRemote(sftp, '/home/dev')
        },
        {
          path: '/home/dev/.orca/agent-hooks/copilot-hook.sh',
          install: (sftp: SFTPWrapper) => new CopilotHookService().installRemote(sftp, '/home/dev')
        }
      ]

      for (const { install, path } of installers) {
        const { sftp, fs } = createFakeSftp({
          '/home/dev/.codex/auth.json': '{"account":"remote-system"}\n'
        })
        const status = await install(sftp)
        expect(status.state).toBe('installed')
        const script = fs.files.get(path)
        if (path.includes('/.config/amp/plugins/')) {
          expect(script).toContain('/hook/amp')
          expect(script).toContain("amp.on('agent.start'")
        } else {
          expect(script).toMatch(/^#!\/bin\/sh\n/)
        }
        expect(script).not.toContain('@echo off')
        expect(script).not.toContain('powershell -NoProfile')
      }
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform)
      }
    }
  })

  it('installs remote Codex hooks with matching trust entries', async () => {
    const { sftp, fs } = createFakeSftp({
      '/home/dev/.codex/auth.json': '{"account":"remote-system"}\n',
      '/home/dev/.codex/config.toml': [
        'model = "remote-model"',
        '',
        '[[hooks.Stop]]',
        '[[hooks.Stop.hooks]]',
        'type = "command"',
        'command = "system-inline-hook"',
        '',
        '[projects."/repo"]',
        'trust_level = "trusted"',
        ''
      ].join('\n'),
      '/home/dev/.codex/hooks.json': JSON.stringify({
        hooks: {
          Stop: [
            { hooks: [{ command: 'user-hook' }] },
            {
              hooks: [
                {
                  command:
                    "if [ -x '/home/dev/.orca/agent-hooks/codex-hook.sh' ]; then /bin/sh '/home/dev/.orca/agent-hooks/codex-hook.sh'; fi"
                }
              ]
            }
          ]
        }
      }),
      '/home/dev/.orca/codex-runtime-home/home/hooks.json':
        '{"hooks":{"Stop":[{"hooks":[{"command":"stale-runtime-hook"}]}]}}\n',
      '/home/dev/.orca/codex-runtime-home/home/config.toml': [
        'model = "stale-runtime-model"',
        '',
        '[[hooks.Stop]]',
        '[[hooks.Stop.hooks]]',
        'type = "command"',
        'command = "stale-inline-hook"',
        '',
        '[hooks.state."/home/dev/.orca/codex-runtime-home/home/hooks.json:stop:0:0"]',
        'enabled = true',
        'trusted_hash = "sha256:stale"',
        ''
      ].join('\n')
    })

    const status = await new CodexHookService().installRemote(sftp, '/home/dev/')

    expect(status.state).toBe('partial')
    expect(status.detail).toContain('Dropped 1 non-Orca Codex hook group(s)')
    expect(status.detail).toContain('Dropped 2 non-Orca Codex hook declaration section(s)')
    expect(status.configPath).toBe('/home/dev/.orca/codex-runtime-home/home/hooks.json')
    const hooks = JSON.parse(
      fs.files.get('/home/dev/.orca/codex-runtime-home/home/hooks.json')!
    ) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>
    }
    for (const eventName of [
      'SessionStart',
      'UserPromptSubmit',
      'PreToolUse',
      'PermissionRequest',
      'PostToolUse',
      'Stop'
    ]) {
      const command = hooks.hooks[eventName]?.[0]?.hooks?.[0]?.command
      expect(command).toContain('/home/dev/.orca/agent-hooks/codex-hook.sh')
      expect(command).toMatch(/^if \[ -x /)
    }
    expect(JSON.stringify(hooks)).not.toContain('stale-runtime-hook')
    expect(fs.files.get('/home/dev/.orca/agent-hooks/codex-hook.sh')).toContain('#!/bin/sh')
    expect(fs.modes.get('/home/dev/.orca/agent-hooks/codex-hook.sh')).toBe(0o755)
    const toml = fs.files.get('/home/dev/.orca/codex-runtime-home/home/config.toml')
    expect(toml).toContain(
      '/home/dev/.orca/codex-runtime-home/home/hooks.json:permission_request:0:0'
    )
    expect(toml).toContain('trusted_hash = "sha256:')
    expect(toml).toContain('model = "remote-model"')
    expect(toml).toContain('[projects."/repo"]')
    expect(toml).not.toContain('system-inline-hook')
    expect(toml).not.toContain('stale-inline-hook')
    expect(toml).not.toContain('sha256:stale')
    expect(fs.files.get('/home/dev/.orca/codex-runtime-home/home/auth.json')).toBe(
      '{"account":"remote-system"}\n'
    )
    expect(fs.files.get('/home/dev/.codex/hooks.json')).toContain('user-hook')
    expect(fs.files.get('/home/dev/.codex/hooks.json')).not.toContain('codex-hook.sh')
    expect(fs.files.get('/home/dev/.codex/config.toml')).toContain('system-inline-hook')
    expect(fs.files.has('/home/dev/.orca/codex-runtime-home/home/.orca-runtime-ready')).toBe(false)
  })

  it('reports Codex trust-write failures without rolling back installed hooks', async () => {
    const { sftp, fs } = createFakeSftp({
      '/home/dev/.codex/auth.json': '{"account":"remote-system"}\n'
    })
    fs.failRenameTo.add('/home/dev/.orca/codex-runtime-home/home/config.toml')

    const status = await new CodexHookService().installRemote(sftp, '/home/dev')

    expect(status.state).toBe('error')
    expect(status.managedHooksPresent).toBe(true)
    expect(status.detail).toContain('trust entries could not be written')
    expect(fs.files.get('/home/dev/.orca/codex-runtime-home/home/hooks.json')).toContain(
      'codex-hook.sh'
    )
    expect(fs.files.get('/home/dev/.orca/agent-hooks/codex-hook.sh')).toContain('#!/bin/sh')
  })

  it('reports remote Codex auth copy failures before enabling managed runtime home', async () => {
    const { sftp, fs } = createFakeSftp({
      '/home/dev/.codex/auth.json': '{"account":"remote-system"}\n'
    })
    fs.failRenameTo.add('/home/dev/.orca/codex-runtime-home/home/auth.json')

    const status = await new CodexHookService().installRemote(sftp, '/home/dev')

    expect(status.state).toBe('error')
    expect(status.managedHooksPresent).toBe(false)
    expect(status.detail).toContain('rename failed')
    expect(fs.files.has('/home/dev/.orca/codex-runtime-home/home/hooks.json')).toBe(false)
  })

  it('reports missing remote Codex auth before enabling managed runtime home', async () => {
    const { sftp, fs } = createFakeSftp({
      '/home/dev/.orca/codex-runtime-home/home/auth.json': '{"account":"stale"}\n'
    })

    const status = await new CodexHookService().installRemote(sftp, '/home/dev')

    expect(status.state).toBe('error')
    expect(status.managedHooksPresent).toBe(false)
    expect(status.detail).toContain('auth.json is missing')
    expect(fs.files.has('/home/dev/.orca/codex-runtime-home/home/hooks.json')).toBe(false)
  })

  it('reports legacy remote real-home cleanup failures before enabling managed runtime home', async () => {
    const legacyCommand =
      "if [ -x '/home/dev/.orca/agent-hooks/codex-hook.sh' ]; then /bin/sh '/home/dev/.orca/agent-hooks/codex-hook.sh'; fi"
    const { sftp, fs } = createFakeSftp({
      '/home/dev/.codex/auth.json': '{"account":"remote-system"}\n',
      '/home/dev/.codex/hooks.json': JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command: legacyCommand }] }] }
      })
    })
    fs.failRenameTo.add('/home/dev/.codex/hooks.json')

    const status = await new CodexHookService().installRemote(sftp, '/home/dev')

    expect(status.state).toBe('error')
    expect(status.managedHooksPresent).toBe(false)
    expect(status.detail).toContain('rename failed')
    expect(fs.files.has('/home/dev/.orca/codex-runtime-home/home/hooks.json')).toBe(false)
  })

  it('reports malformed legacy remote real-home hooks before enabling managed runtime home', async () => {
    const { sftp, fs } = createFakeSftp({
      '/home/dev/.codex/auth.json': '{"account":"remote-system"}\n',
      '/home/dev/.codex/hooks.json': '{not json'
    })

    const status = await new CodexHookService().installRemote(sftp, '/home/dev')

    expect(status.state).toBe('error')
    expect(status.managedHooksPresent).toBe(false)
    expect(status.detail).toContain('Could not parse legacy remote Codex hooks.json')
    expect(fs.files.has('/home/dev/.orca/codex-runtime-home/home/hooks.json')).toBe(false)
  })

  it('uses the remote canonical hooks path for remote Codex trust entries', async () => {
    const localRoot = mkdtempSync(join(tmpdir(), 'orca-remote-codex-trust-'))
    const localActual = join(localRoot, 'actual')
    const localLink = join(localRoot, 'link')
    mkdirSync(localActual)
    symlinkSync(localActual, localLink)
    try {
      const remoteCanonicalHooksPath = `${localLink}/hooks.json`
      const { sftp, fs } = createFakeSftp(
        { '/home/dev/.codex/auth.json': '{"account":"remote-system"}\n' },
        {
          realpaths: {
            '/home/dev/.orca/codex-runtime-home/home/hooks.json': remoteCanonicalHooksPath
          }
        }
      )

      const status = await new CodexHookService().installRemote(sftp, '/home/dev')

      expect(status.state).toBe('installed')
      const toml = fs.files.get('/home/dev/.orca/codex-runtime-home/home/config.toml')
      expect(toml).toContain(`${remoteCanonicalHooksPath}:stop:0:0`)
      expect(toml).not.toContain(`${localActual}/hooks.json:stop:0:0`)
      expect(toml).not.toContain('/home/dev/.orca/codex-runtime-home/home/hooks.json:stop:0:0')
    } finally {
      rmSync(localRoot, { recursive: true, force: true })
    }
  })

  it('installs remote Gemini, Antigravity, Cursor, Command Code, and Grok configs using their CLI-specific schemas', async () => {
    const gemini = createFakeSftp()
    const antigravity = createFakeSftp()
    const amp = createFakeSftp()
    const cursor = createFakeSftp()
    const commandCode = createFakeSftp()
    const grok = createFakeSftp()

    await new GeminiHookService().installRemote(gemini.sftp, '/home/dev')
    await new AntigravityHookService().installRemote(antigravity.sftp, '/home/dev')
    await new AmpHookService().installRemote(amp.sftp, '/home/dev')
    await new CursorHookService().installRemote(cursor.sftp, '/home/dev')
    await new CommandCodeHookService().installRemote(commandCode.sftp, '/home/dev')
    await new GrokHookService().installRemote(grok.sftp, '/home/dev')

    const geminiConfig = JSON.parse(gemini.fs.files.get('/home/dev/.gemini/settings.json')!) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>
    }
    for (const eventName of ['BeforeAgent', 'AfterAgent', 'AfterTool', 'BeforeTool']) {
      const command = geminiConfig.hooks[eventName]?.[0]?.hooks?.[0]?.command
      expect(command).toContain('/home/dev/.orca/agent-hooks/gemini-hook.sh')
      expect(command).toMatch(/^if \[ -x /)
    }
    expect(geminiConfig.hooks.PreToolUse).toBeUndefined()

    const antigravityConfig = JSON.parse(
      antigravity.fs.files.get('/home/dev/.gemini/config/hooks.json')!
    ) as {
      'orca-status': Record<
        string,
        { matcher?: string; command?: string; hooks?: { command: string }[] }[]
      >
    }
    for (const eventName of ['PreInvocation', 'PostInvocation', 'Stop']) {
      const command = antigravityConfig['orca-status'][eventName]?.[0]?.command
      expect(command).toContain('/home/dev/.orca/agent-hooks/antigravity-hook.sh')
      expect(command).toContain(`ORCA_ANTIGRAVITY_EVENT='${eventName}'`)
    }
    expect(antigravityConfig['orca-status'].PreToolUse).toBeUndefined()
    for (const eventName of ['PostToolUse']) {
      const definition = antigravityConfig['orca-status'][eventName]?.[0]
      const command = definition?.hooks?.[0]?.command
      expect(definition?.matcher).toBe('*')
      expect(command).toContain('/home/dev/.orca/agent-hooks/antigravity-hook.sh')
      expect(command).toContain(`ORCA_ANTIGRAVITY_EVENT='${eventName}'`)
    }

    const ampPlugin = amp.fs.files.get('/home/dev/.config/amp/plugins/orca-agent-status.ts')
    expect(ampPlugin).toContain('/hook/amp')
    expect(ampPlugin).toContain("amp.on('tool.call'")
    expect(ampPlugin).toContain('return { action: "allow" }')

    const cursorConfig = JSON.parse(cursor.fs.files.get('/home/dev/.cursor/hooks.json')!) as {
      version: number
      hooks: Record<string, { command?: string; hooks?: unknown[] }[]>
    }
    expect(cursorConfig.version).toBe(1)
    for (const eventName of [
      'beforeSubmitPrompt',
      'stop',
      'preToolUse',
      'postToolUse',
      'postToolUseFailure',
      'beforeShellExecution',
      'beforeMCPExecution',
      'afterAgentResponse'
    ]) {
      const definition = cursorConfig.hooks[eventName]?.[0]
      expect(definition?.command).toContain('/home/dev/.orca/agent-hooks/cursor-hook.sh')
      expect(definition?.hooks).toBeUndefined()
    }

    const commandCodeConfig = JSON.parse(
      commandCode.fs.files.get('/home/dev/.commandcode/settings.json')!
    ) as {
      hooks: Record<string, { matcher?: string; hooks?: { command: string }[] }[]>
    }
    for (const eventName of ['PreToolUse', 'PostToolUse', 'Stop']) {
      const definition = commandCodeConfig.hooks[eventName]?.[0]
      const command = definition?.hooks?.[0]?.command
      expect(command).toContain('/home/dev/.orca/agent-hooks/command-code-hook.sh')
      expect(command).toMatch(/^if \[ -x /)
    }
    expect(commandCodeConfig.hooks.PreToolUse?.[0]?.matcher).toBe('.*')
    expect(commandCodeConfig.hooks.PostToolUse?.[0]?.matcher).toBe('.*')
    expect(commandCodeConfig.hooks.Stop?.[0]?.matcher).toBeUndefined()

    const grokConfig = JSON.parse(grok.fs.files.get('/home/dev/.grok/hooks/orca-status.json')!) as {
      hooks: Record<string, { matcher?: string; hooks?: { command: string }[] }[]>
    }
    for (const eventName of [
      'SessionStart',
      'UserPromptSubmit',
      'Stop',
      'SessionEnd',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'Notification'
    ]) {
      const definition = grokConfig.hooks[eventName]?.[0]
      const command = definition?.hooks?.[0]?.command
      expect(command).toContain('/home/dev/.orca/agent-hooks/grok-hook.sh')
      expect(command).toMatch(/^if \[ -x /)
    }
    expect(grokConfig.hooks.PreToolUse?.[0]?.matcher).toBe('*')
  })

  it('removes stale remote Antigravity PreToolUse hooks while installing SSH hooks', async () => {
    const { sftp, fs } = createFakeSftp()
    fs.files.set(
      '/home/dev/.gemini/config/hooks.json',
      `${JSON.stringify(
        {
          'orca-status': {
            PreToolUse: [
              {
                matcher: '*',
                hooks: [
                  {
                    type: 'command',
                    command: '/tmp/old/agent-hooks/antigravity-hook.sh'
                  }
                ]
              }
            ],
            PostToolUse: [
              {
                matcher: '*',
                hooks: [
                  {
                    type: 'command',
                    command: 'echo user-authored'
                  }
                ]
              }
            ]
          }
        },
        null,
        2
      )}\n`
    )

    await new AntigravityHookService().installRemote(sftp, '/home/dev')

    const config = JSON.parse(fs.files.get('/home/dev/.gemini/config/hooks.json')!) as {
      'orca-status': Record<string, { hooks?: { command: string }[] }[]>
    }
    expect(config['orca-status'].PreToolUse).toBeUndefined()
    const postToolCommands = config['orca-status'].PostToolUse.flatMap((definition) =>
      (definition.hooks ?? []).map((hook) => hook.command)
    )
    expect(postToolCommands).toContain('echo user-authored')
    expect(postToolCommands.some((command) => command.includes('antigravity-hook.sh'))).toBe(true)
  })

  it('removes stale remote Gemini PreToolUse hooks while preserving user-authored hooks', async () => {
    const { sftp, fs } = createFakeSftp()
    fs.files.set(
      '/home/dev/.gemini/settings.json',
      `${JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                hooks: [
                  {
                    type: 'command',
                    command:
                      "if [ -x '/tmp/old/agent-hooks/gemini-hook.sh' ]; then /bin/sh '/tmp/old/agent-hooks/gemini-hook.sh'; fi"
                  }
                ]
              },
              {
                hooks: [
                  {
                    type: 'command',
                    command: 'echo user-authored'
                  }
                ]
              }
            ]
          }
        },
        null,
        2
      )}\n`
    )

    await new GeminiHookService().installRemote(sftp, '/home/dev')

    const config = JSON.parse(fs.files.get('/home/dev/.gemini/settings.json')!) as {
      hooks: Record<string, { hooks?: { command: string }[] }[]>
    }
    const preToolCommands = config.hooks.PreToolUse.flatMap((definition) =>
      (definition.hooks ?? []).map((hook) => hook.command)
    )
    expect(preToolCommands).toEqual(['echo user-authored'])
    const beforeToolCommands = config.hooks.BeforeTool.flatMap((definition) =>
      (definition.hooks ?? []).map((hook) => hook.command)
    )
    expect(beforeToolCommands.some((command) => command.includes('gemini-hook.sh'))).toBe(true)
  })

  it('installs remote Copilot hooks under the user-level hooks directory', async () => {
    const { sftp, fs } = createFakeSftp()
    fs.dirs.add('/home/dev/.copilot')
    fs.dirs.add('/home/dev/.copilot/hooks')
    fs.files.set(
      '/home/dev/.copilot/hooks/orca.json',
      JSON.stringify({
        version: 99,
        disableAllHooks: true,
        hooks: {}
      })
    )

    const status = await new CopilotHookService().installRemote(sftp, '/home/dev/')

    expect(status.state).toBe('installed')
    expect(status.configPath).toBe('/home/dev/.copilot/hooks/orca.json')
    const config = JSON.parse(fs.files.get('/home/dev/.copilot/hooks/orca.json')!) as {
      version: number
      disableAllHooks?: boolean
      hooks: Record<string, { bash?: string; timeoutSec?: number }[]>
    }
    expect(config.version).toBe(1)
    for (const eventName of [
      'SessionStart',
      'SessionEnd',
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'subagentStart',
      'SubagentStop',
      'PreCompact',
      'Stop',
      'ErrorOccurred',
      'PermissionRequest',
      'Notification'
    ]) {
      const definition = config.hooks[eventName]?.[0]
      expect(definition?.bash).toContain('/home/dev/.orca/agent-hooks/copilot-hook.sh')
      expect(definition?.bash).toContain(`ORCA_COPILOT_HOOK_EVENT='${eventName}'`)
      expect(definition?.timeoutSec).toBe(5)
    }
    expect(config.disableAllHooks).toBeUndefined()
    expect(fs.files.get('/home/dev/.orca/agent-hooks/copilot-hook.sh')).toContain('#!/bin/sh')
    expect(fs.modes.get('/home/dev/.orca/agent-hooks/copilot-hook.sh')).toBe(0o755)
  })

  it('installs remote Hermes plugin files and enables the plugin', async () => {
    const { sftp, fs } = createFakeSftp()

    const status = await new HermesHookService().installRemote(sftp, '/home/dev')

    expect(status.state).toBe('installed')
    expect(status.configPath).toBe('/home/dev/.hermes/config.yaml')
    expect(fs.files.get('/home/dev/.hermes/plugins/orca-status/plugin.yaml')).toContain(
      'pre_llm_call'
    )
    expect(fs.files.get('/home/dev/.hermes/plugins/orca-status/__init__.py')).toContain(
      '/hook/hermes'
    )
    expect(fs.files.get('/home/dev/.hermes/config.yaml')).toContain('orca-status')
  })

  it('does not overwrite a remote user-authored Amp plugin file', async () => {
    const { sftp, fs } = createFakeSftp({
      '/home/dev/.config/amp/plugins/orca-agent-status.ts':
        'export default function userPlugin() {}\n'
    })

    const status = await new AmpHookService().installRemote(sftp, '/home/dev/')

    expect(status).toMatchObject({
      agent: 'amp',
      state: 'partial',
      managedHooksPresent: false
    })
    expect(fs.files.get('/home/dev/.config/amp/plugins/orca-agent-status.ts')).toBe(
      'export default function userPlugin() {}\n'
    )
  })
})
