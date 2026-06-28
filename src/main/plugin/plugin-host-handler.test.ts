import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHostRequestHandler, type HostServices } from './plugin-host-handler'
import { PluginSettingsStore } from './plugin-settings-store'
import type { BridgeRequest } from '../../shared/plugin/api-contract'
import type { PluginCapability } from '../../shared/plugin/manifest'

let tmp: string

function makeServices(): HostServices {
  return {
    getWorkspaceSnapshot: vi.fn(async () => ({
      workspaceName: 'orca',
      currentBranch: 'main',
      isDirty: false,
      openFileCount: 2,
      // a service that leaks extra fields — the gate must project them away:
      absolutePath: '/Users/me/secret'
    })) as unknown as HostServices['getWorkspaceSnapshot'],
    invokeCommand: vi.fn(async () => 'invoked'),
    settings: new PluginSettingsStore(tmp, 'acme.foo')
  }
}

function req(method: string, params?: unknown): BridgeRequest {
  return { reqId: 'r1', method: method as BridgeRequest['method'], params }
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'host-handler-'))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('createHostRequestHandler', () => {
  const all: PluginCapability[] = ['workspace:read', 'commands', 'settings']

  it('denies a method whose capability was not declared', async () => {
    const handle = createHostRequestHandler([], makeServices())
    expect(await handle(req('workspace.getSnapshot'))).toEqual({
      reqId: 'r1',
      ok: false,
      error: 'capability_denied'
    })
  })

  it('returns a projected workspace snapshot (no leaked fields)', async () => {
    const handle = createHostRequestHandler(all, makeServices())
    const res = await handle(req('workspace.getSnapshot'))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.result).toEqual({
        workspaceName: 'orca',
        currentBranch: 'main',
        isDirty: false,
        openFileCount: 2
      })
      expect(res.result).not.toHaveProperty('absolutePath')
    }
  })

  it('validates host commands before invoking', async () => {
    const services = makeServices()
    const handle = createHostRequestHandler(all, services)
    // bad scheme is rejected without invoking
    const bad = await handle(
      req('commands.invokeHost', { name: 'open-external-url', params: { url: 'file:///x' } })
    )
    expect(bad).toEqual({ reqId: 'r1', ok: false, error: 'invalid_params' })
    expect(services.invokeCommand).not.toHaveBeenCalled()
    // good command invokes
    const good = await handle(
      req('commands.invokeHost', { name: 'copy-to-clipboard', params: { text: 'hi' } })
    )
    expect(good.ok).toBe(true)
    expect(services.invokeCommand).toHaveBeenCalledOnce()
  })

  it('round-trips settings get/set through the per-plugin store', async () => {
    const services = makeServices()
    const handle = createHostRequestHandler(all, services)
    expect((await handle(req('settings.set', { key: 'theme', value: 'dark' }))).ok).toBe(true)
    const got = await handle(req('settings.get', { key: 'theme' }))
    expect(got.ok && got.result).toBe('dark')
  })

  it('rejects an unknown method and maps thrown errors to internal', async () => {
    const services = makeServices()
    services.getWorkspaceSnapshot = vi.fn(async () => {
      throw new Error('boom')
    }) as unknown as HostServices['getWorkspaceSnapshot']
    const handle = createHostRequestHandler(all, services)
    expect(await handle(req('does.not.exist'))).toEqual({
      reqId: 'r1',
      ok: false,
      error: 'unknown_method'
    })
    expect(await handle(req('workspace.getSnapshot'))).toEqual({
      reqId: 'r1',
      ok: false,
      error: 'internal'
    })
  })
})
