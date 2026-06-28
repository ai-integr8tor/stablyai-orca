import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginHost } from './plugin-host-process'
import { PluginOutputBuffer } from './plugin-output-buffer'
import type { BridgeRequest, BridgeResponse } from '../../shared/plugin/api-contract'

// A CJS fixture that speaks the child side of the host protocol, so we fork a
// real Node child and exercise PluginHost end-to-end without Electron. (The
// production plugin-host-entry.ts mirrors this protocol.)
const FIXTURE_ENTRY = `
process.on('message', (msg) => {
  if (msg.type === 'activate') {
    if (process.env.FIXTURE_CRASH === '1') { process.exit(1); return }
    process.stdout.write('hello from plugin\\n')
    const reqId = 'x1'
    const onResp = (m) => {
      if (m && m.type === 'host-response' && m.response.reqId === reqId) {
        process.off('message', onResp)
        process.send({ type: 'ready' })
      }
    }
    process.on('message', onResp)
    process.send({ type: 'host-request', request: { reqId, method: 'workspace.getSnapshot', params: {} } })
  } else if (msg.type === 'deactivate') {
    process.exit(0)
  }
})
`

let tmp: string
let entryPath: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'plugin-host-'))
  entryPath = join(tmp, 'fixture-entry.cjs')
  writeFileSync(entryPath, FIXTURE_ENTRY)
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function snapshotResponse(request: BridgeRequest): BridgeResponse {
  return {
    reqId: request.reqId,
    ok: true,
    result: { workspaceName: 't', currentBranch: 'main', isDirty: false, openFileCount: 0 }
  }
}

describe('PluginHost (real forked child)', () => {
  it('starts, handles a backend->host bridge request, captures output, and stops', async () => {
    const output = new PluginOutputBuffer()
    const onHostRequest = vi.fn(async (request: BridgeRequest) => snapshotResponse(request))
    const host = new PluginHost({
      pluginId: 'acme.a',
      pluginDir: tmp,
      mainPath: 'unused',
      entryPath,
      output,
      onHostRequest
    })

    await host.start()
    expect(host.isRunning()).toBe(true)
    expect(onHostRequest).toHaveBeenCalledTimes(1)
    expect(onHostRequest.mock.calls[0][0].method).toBe('workspace.getSnapshot')
    expect(output.snapshot().map((l) => l.text)).toContain('hello from plugin')

    await host.stop(1000)
    expect(host.isRunning()).toBe(false)
  })

  it('isolates a crashing backend: a crash does not affect another running host', async () => {
    const output = new PluginOutputBuffer()
    const onHostRequest = vi.fn(async (request: BridgeRequest) => snapshotResponse(request))

    const healthy = new PluginHost({
      pluginId: 'acme.healthy',
      pluginDir: tmp,
      mainPath: 'unused',
      entryPath,
      output: new PluginOutputBuffer(),
      onHostRequest
    })
    await healthy.start()

    const exits: { expected: boolean }[] = []
    const crasher = new PluginHost({
      pluginId: 'acme.crasher',
      pluginDir: tmp,
      mainPath: 'unused',
      entryPath,
      env: { FIXTURE_CRASH: '1' },
      output,
      onHostRequest,
      onExit: (info) => exits.push({ expected: info.expected })
    })

    await expect(crasher.start()).rejects.toThrow()
    expect(crasher.isRunning()).toBe(false)
    expect(exits[0]?.expected).toBe(false) // crash, not a host-initiated stop
    // The healthy plugin's process is untouched by the crash.
    expect(healthy.isRunning()).toBe(true)

    await healthy.stop(1000)
  })
})
