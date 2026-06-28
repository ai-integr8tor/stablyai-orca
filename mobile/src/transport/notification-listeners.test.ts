import { describe, expect, it } from 'vitest'
import { createNotificationRegistry } from './notification-listeners'

describe('createNotificationRegistry', () => {
  it('dispatches a notification frame (method, no id) to a registered listener', () => {
    const reg = createNotificationRegistry()
    const seen: Record<string, unknown>[] = []
    reg.add('plugin.uiMessage', (params) => seen.push(params))
    const consumed = reg.tryDispatch({ method: 'plugin.uiMessage', params: { pluginId: 'a' } })
    expect(consumed).toBe(true)
    expect(seen).toEqual([{ pluginId: 'a' }])
  })

  it('fans out to every listener on the same method', () => {
    const reg = createNotificationRegistry()
    let a = 0
    let b = 0
    reg.add('m', () => (a += 1))
    reg.add('m', () => (b += 1))
    reg.tryDispatch({ method: 'm', params: {} })
    expect([a, b]).toEqual([1, 1])
  })

  it('defaults params to {} when the frame omits them', () => {
    const reg = createNotificationRegistry()
    let received: unknown
    reg.add('m', (params) => (received = params))
    reg.tryDispatch({ method: 'm' })
    expect(received).toEqual({})
  })

  it('does not consume a frame that carries an id (a request reply)', () => {
    const reg = createNotificationRegistry()
    let called = false
    reg.add('m', () => (called = true))
    expect(reg.tryDispatch({ method: 'm', id: 'r1' })).toBe(false)
    expect(called).toBe(false)
  })

  it('does not consume a frame whose method is not a string', () => {
    const reg = createNotificationRegistry()
    expect(reg.tryDispatch({ method: 42 })).toBe(false)
    expect(reg.tryDispatch({})).toBe(false)
  })

  it('unsubscribe removes only the returned listener', () => {
    const reg = createNotificationRegistry()
    let a = 0
    let b = 0
    const off = reg.add('m', () => (a += 1))
    reg.add('m', () => (b += 1))
    off()
    reg.tryDispatch({ method: 'm', params: {} })
    expect([a, b]).toEqual([0, 1])
  })
})
