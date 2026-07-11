import { describe, expect, it, vi } from 'vitest'
import { connectCodexAppServer } from './codex-app-server-jsonl-client'
import { CodexAppServerTestProcess, initializeTestAppServer } from './codex-app-server-test-process'

describe('Codex app-server JSONL client', () => {
  it('initializes before sending requests and routes responses', async () => {
    const process = new CodexAppServerTestProcess((message, server) => {
      if (initializeTestAppServer(message, server)) {
        return
      }
      if (message.method === 'config/read') {
        server.send({ id: message.id, result: { config: { mcp_servers: {} } } })
      }
    })

    const client = await connectCodexAppServer({
      processFactory: () => process.asProcess()
    })
    const result = await client.request('config/read', { cwd: '/repo' })

    expect(client.initializeResult.platformOs).toBe('linux')
    expect(process.received.map((message) => message.method)).toEqual([
      'initialize',
      'initialized',
      'config/read'
    ])
    expect(result).toEqual({ config: { mcp_servers: {} } })
    client.dispose()
  })

  it('routes notifications and lets the host answer server requests', async () => {
    const process = new CodexAppServerTestProcess((message, server) => {
      initializeTestAppServer(message, server)
    })
    const client = await connectCodexAppServer({
      processFactory: () => process.asProcess()
    })
    const notifications = vi.fn()
    const requests = vi.fn((request) => client.respond(request.id, { answers: {} }))
    client.onNotification(notifications)
    client.onServerRequest(requests)

    process.send({ method: 'item/agentMessage/delta', params: { delta: 'Hi' } })
    process.send({ id: 91, method: 'item/tool/requestUserInput', params: { questions: [] } })

    expect(notifications).toHaveBeenCalledWith({
      method: 'item/agentMessage/delta',
      params: { delta: 'Hi' }
    })
    expect(requests).toHaveBeenCalledWith({
      id: 91,
      method: 'item/tool/requestUserInput',
      params: { questions: [] }
    })
    expect(process.received.at(-1)).toEqual({ id: 91, result: { answers: {} } })
    client.dispose()
  })

  it('rejects in-flight requests when the process exits', async () => {
    const process = new CodexAppServerTestProcess((message, server) => {
      initializeTestAppServer(message, server)
    })
    const client = await connectCodexAppServer({
      processFactory: () => process.asProcess()
    })

    const pending = client.request('thread/start', {})
    process.stderr.write('startup failed')
    process.close(7)

    await expect(pending).rejects.toThrow('exited with code 7: startup failed')
    await expect(client.request('thread/start', {})).rejects.toThrow('exited with code 7')
  })

  it('fails closed when stdout is not valid JSONL', async () => {
    const process = new CodexAppServerTestProcess((message, server) => {
      initializeTestAppServer(message, server)
    })
    const client = await connectCodexAppServer({
      processFactory: () => process.asProcess()
    })

    const pending = client.request('thread/start', {})
    process.sendRaw('{nope')

    await expect(pending).rejects.toThrow('invalid JSON')
    client.dispose()
  })

  it('terminates a server whose request times out', async () => {
    vi.useFakeTimers()
    try {
      const process = new CodexAppServerTestProcess((message, server) => {
        initializeTestAppServer(message, server)
      })
      const client = await connectCodexAppServer({
        processFactory: () => process.asProcess(),
        requestTimeoutMs: 50
      })

      const pending = client.request('thread/start', {})
      const rejection = expect(pending).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(50)

      await rejection
      expect(process.killed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
