import { describe, expect, it, vi } from 'vitest'
import { activatePluginForWorkspace, type ActivationDeps } from './plugin-activation-coordinator'
import type { PluginBundle } from './plugin-bundle'

const bundle: PluginBundle = { pluginId: 'acme.foo', files: [], integrity: 'h' }

// A relay request fn that records calls and returns canned results per method.
function fakeRelay(results: Record<string, unknown>): {
  request: ActivationDeps['relayRequest']
  calls: { method: string; params?: Record<string, unknown> }[]
} {
  const calls: { method: string; params?: Record<string, unknown> }[] = []
  const request: ActivationDeps['relayRequest'] = (method, params) => {
    calls.push({ method, params })
    return Promise.resolve(results[method])
  }
  return { request, calls }
}

// Default to a delay that never resolves so the timeout never fires unless a
// test opts in by injecting an immediate `delay`. The relay-request work always
// wins the race in these cases.
const neverDelay = (): Promise<void> => new Promise<void>(() => {})
const immediateDelay = (): Promise<void> => Promise.resolve()
const neverResolves = (): Promise<never> => new Promise<never>(() => {})

function deps(over: Partial<ActivationDeps> = {}): ActivationDeps {
  return {
    pluginsDir: '/plugins',
    localActivate: vi.fn(() => ({ ok: true }) as const),
    relayRequest: () => Promise.resolve({ ok: true }),
    readBundle: () => bundle,
    delay: neverDelay,
    ...over
  }
}

describe('activatePluginForWorkspace', () => {
  it('activates locally and touches neither bundle nor relay when not remote', async () => {
    const localActivate = vi.fn(() => ({ ok: true }) as const)
    const readBundle = vi.fn(() => bundle)
    const { request, calls } = fakeRelay({})
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: null },
      deps({ localActivate, readBundle, relayRequest: request })
    )
    expect(result).toEqual({ ok: true })
    expect(localActivate).toHaveBeenCalledWith('acme.foo')
    expect(readBundle).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('remote happy path provisions then activates, in that order', async () => {
    const localActivate = vi.fn(() => ({ ok: true }) as const)
    const { request, calls } = fakeRelay({
      'plugin.provision': { ok: true },
      'plugin.activate': { ok: true }
    })
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ localActivate, relayRequest: request })
    )
    expect(result).toEqual({ ok: true })
    expect(localActivate).not.toHaveBeenCalled()
    expect(calls.map((c) => c.method)).toEqual(['plugin.provision', 'plugin.activate'])
    expect(calls[0].params).toEqual({ bundle })
    expect(calls[1].params).toEqual({ pluginId: 'acme.foo' })
  })

  it('aborts before activate when provisioning fails', async () => {
    const { request, calls } = fakeRelay({
      'plugin.provision': { ok: false, error: 'integrity_mismatch' }
    })
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request })
    )
    expect(result).toEqual({ ok: false, error: 'integrity_mismatch' })
    expect(calls.map((c) => c.method)).toEqual(['plugin.provision'])
  })

  it('returns a typed error when the bundle read throws (no relay calls)', async () => {
    const { request, calls } = fakeRelay({ 'plugin.provision': { ok: true } })
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({
        relayRequest: request,
        readBundle: () => {
          throw new Error('ENOENT plugin dir')
        }
      })
    )
    expect(result).toEqual({ ok: false, error: 'ENOENT plugin dir' })
    expect(calls).toEqual([])
  })

  it('maps a rejected remote activate to a typed failure and still compensates', async () => {
    const calls: string[] = []
    const request: ActivationDeps['relayRequest'] = (method) => {
      calls.push(method)
      return method === 'plugin.provision'
        ? Promise.resolve({ ok: true })
        : Promise.reject(new Error('relay disconnected'))
    }
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request })
    )
    expect(result).toEqual({ ok: false, error: 'relay disconnected' })
    expect(calls).toEqual(['plugin.provision', 'plugin.activate', 'plugin.deactivate'])
  })

  it('reports a relay activate that returns ok:false', async () => {
    const { request } = fakeRelay({
      'plugin.provision': { ok: true },
      'plugin.activate': { ok: false, error: 'unknown_plugin' }
    })
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request })
    )
    expect(result).toEqual({ ok: false, error: 'unknown_plugin' })
  })

  it('normalizes a missing/non-{ok} activate response to no_response and compensates', async () => {
    // 'plugin.activate' omitted → request resolves undefined.
    const { request, calls } = fakeRelay({ 'plugin.provision': { ok: true } })
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request })
    )
    expect(result).toEqual({ ok: false, error: 'no_response' })
    // Provision committed, so a failed activate fires a best-effort deactivate.
    expect(calls.map((c) => c.method)).toEqual([
      'plugin.provision',
      'plugin.activate',
      'plugin.deactivate'
    ])
  })

  it('falls back to provision_failed when provision fails without an error string', async () => {
    const { request, calls } = fakeRelay({ 'plugin.provision': { ok: false } })
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request })
    )
    expect(result).toEqual({ ok: false, error: 'provision_failed' })
    expect(calls.map((c) => c.method)).toEqual(['plugin.provision'])
  })

  it('falls back to bundle_read_failed when readBundle throws a non-Error', async () => {
    const { request, calls } = fakeRelay({ 'plugin.provision': { ok: true } })
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({
        relayRequest: request,
        readBundle: () => {
          throw 'disk_error'
        }
      })
    )
    expect(result).toEqual({ ok: false, error: 'bundle_read_failed' })
    expect(calls).toEqual([])
  })

  it('falls back to activate_failed when the activate request rejects with a non-Error', async () => {
    const request: ActivationDeps['relayRequest'] = (method) =>
      method === 'plugin.provision' ? Promise.resolve({ ok: true }) : Promise.reject('string_error')
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request })
    )
    expect(result).toEqual({ ok: false, error: 'activate_failed' })
  })

  it('awaits a Promise-returning localActivate (does not leak the pending promise)', async () => {
    const localActivate = vi.fn(() => Promise.resolve({ ok: false, error: 'fork_failed' } as const))
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: null },
      deps({ localActivate })
    )
    expect(result).toEqual({ ok: false, error: 'fork_failed' })
  })

  it('treats an explicit non-remote descriptor ({ isRemote: false }) as local', async () => {
    const localActivate = vi.fn(() => ({ ok: true }) as const)
    const { request, calls } = fakeRelay({})
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: false } },
      deps({ localActivate, relayRequest: request })
    )
    expect(result).toEqual({ ok: true })
    expect(localActivate).toHaveBeenCalledWith('acme.foo')
    expect(calls).toEqual([])
  })

  it('rejects an unsafe (traversal) pluginId before any local, bundle, or relay work', async () => {
    const localActivate = vi.fn(() => ({ ok: true }) as const)
    const readBundle = vi.fn(() => bundle)
    const { request, calls } = fakeRelay({ 'plugin.provision': { ok: true } })
    const result = await activatePluginForWorkspace(
      { pluginId: '../../../etc', remote: { isRemote: true } },
      deps({ localActivate, readBundle, relayRequest: request })
    )
    expect(result).toEqual({ ok: false, error: 'unsafe_plugin_id' })
    expect(localActivate).not.toHaveBeenCalled()
    expect(readBundle).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  // U1 — per-request timeout

  it('times out a stuck provision and aborts before activate (no deactivate)', async () => {
    const calls: string[] = []
    const request: ActivationDeps['relayRequest'] = (method) => {
      calls.push(method)
      // provision never resolves; the injected immediate delay wins the race.
      return method === 'plugin.provision' ? neverResolves() : Promise.resolve({ ok: true })
    }
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request, delay: immediateDelay })
    )
    expect(result).toEqual({ ok: false, error: 'provision_timeout' })
    expect(calls).toEqual(['plugin.provision'])
  })

  it('times out a stuck activate and fires a compensating deactivate', async () => {
    const calls: string[] = []
    const request: ActivationDeps['relayRequest'] = (method) => {
      calls.push(method)
      if (method === 'plugin.provision') {
        return Promise.resolve({ ok: true })
      }
      if (method === 'plugin.activate') {
        return neverResolves() // hangs → times out
      }
      return Promise.resolve(undefined)
    }
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request, delay: immediateDelay })
    )
    expect(result).toEqual({ ok: false, error: 'activate_timeout' })
    expect(calls).toEqual(['plugin.provision', 'plugin.activate', 'plugin.deactivate'])
  })

  it('returns activate_timeout without hanging even when the compensating deactivate also hangs', async () => {
    const calls: string[] = []
    const request: ActivationDeps['relayRequest'] = (method) => {
      calls.push(method)
      // provision succeeds; activate AND the compensating deactivate both hang.
      // The deadline-bounded deactivate must not stall the overall activation.
      return method === 'plugin.provision' ? Promise.resolve({ ok: true }) : neverResolves()
    }
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request, delay: immediateDelay })
    )
    expect(result).toEqual({ ok: false, error: 'activate_timeout' })
    expect(calls).toEqual(['plugin.provision', 'plugin.activate', 'plugin.deactivate'])
  })

  it('uses the default timeout/delay when none is injected (happy path still resolves)', async () => {
    const { request } = fakeRelay({
      'plugin.provision': { ok: true },
      'plugin.activate': { ok: true }
    })
    // Build deps WITHOUT a delay override so the real (unref'd) default timer backs the race.
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      {
        pluginsDir: '/plugins',
        localActivate: () => ({ ok: true }),
        relayRequest: request,
        readBundle: () => bundle
      }
    )
    expect(result).toEqual({ ok: true })
  })

  // U2 — best-effort compensating deactivate on partial commit

  it('compensates with a best-effort deactivate when activate returns ok:false', async () => {
    const { request, calls } = fakeRelay({
      'plugin.provision': { ok: true },
      'plugin.activate': { ok: false, error: 'unknown_plugin' }
    })
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request })
    )
    expect(result).toEqual({ ok: false, error: 'unknown_plugin' })
    expect(calls.map((c) => c.method)).toEqual([
      'plugin.provision',
      'plugin.activate',
      'plugin.deactivate'
    ])
    expect(calls[2].params).toEqual({ pluginId: 'acme.foo' })
  })

  it('a rejecting compensating deactivate does not mask the original activate error', async () => {
    const calls: string[] = []
    const request: ActivationDeps['relayRequest'] = (method) => {
      calls.push(method)
      if (method === 'plugin.provision') {
        return Promise.resolve({ ok: true })
      }
      // both activate and the compensating deactivate reject; deactivate's
      // rejection must be swallowed, the activate error preserved.
      return Promise.reject(new Error('relay disconnected'))
    }
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request })
    )
    expect(result).toEqual({ ok: false, error: 'relay disconnected' })
    expect(calls).toEqual(['plugin.provision', 'plugin.activate', 'plugin.deactivate'])
  })

  it('does not compensate (no deactivate) when provisioning fails', async () => {
    const { request, calls } = fakeRelay({ 'plugin.provision': { ok: false, error: 'integrity' } })
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request })
    )
    expect(result).toEqual({ ok: false, error: 'integrity' })
    expect(calls.map((c) => c.method)).toEqual(['plugin.provision'])
  })

  it('never deactivates on the local path', async () => {
    const { request, calls } = fakeRelay({})
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: null },
      deps({ relayRequest: request })
    )
    expect(result).toEqual({ ok: true })
    expect(calls).toEqual([])
  })
})
