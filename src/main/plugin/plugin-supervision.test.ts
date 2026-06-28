import { describe, expect, it } from 'vitest'
import { PluginSupervisor } from './plugin-supervision'

describe('PluginSupervisor', () => {
  it('starts inactive and becomes running', () => {
    const sup = new PluginSupervisor()
    expect(sup.getState('p')).toBe('inactive')
    sup.markRunning('p', { resetRestarts: true })
    expect(sup.getState('p')).toBe('running')
  })

  it('treats a clean exit as inactive with no restart', () => {
    const sup = new PluginSupervisor()
    sup.markRunning('p', { resetRestarts: true })
    expect(sup.markExited('p', { crashed: false })).toEqual({ restart: false, state: 'inactive' })
    expect(sup.getState('p')).toBe('inactive')
  })

  it('restarts a crash with backoff until maxRestarts, then errors', () => {
    const sup = new PluginSupervisor({ maxRestarts: 3, backoffMs: [500, 2000, 5000] })
    sup.markRunning('p', { resetRestarts: true })

    expect(sup.markExited('p', { crashed: true })).toEqual({
      restart: true,
      delayMs: 500,
      attempt: 1
    })
    expect(sup.markExited('p', { crashed: true })).toEqual({
      restart: true,
      delayMs: 2000,
      attempt: 2
    })
    expect(sup.markExited('p', { crashed: true })).toEqual({
      restart: true,
      delayMs: 5000,
      attempt: 3
    })
    // 4th crash exceeds maxRestarts -> errored, no restart
    expect(sup.markExited('p', { crashed: true })).toEqual({ restart: false, state: 'errored' })
    expect(sup.getState('p')).toBe('errored')
  })

  it('reuses the last backoff entry past the schedule length', () => {
    const sup = new PluginSupervisor({ maxRestarts: 5, backoffMs: [100, 200] })
    sup.markRunning('p', { resetRestarts: true })
    sup.markExited('p', { crashed: true }) // attempt 1 -> 100
    sup.markExited('p', { crashed: true }) // attempt 2 -> 200
    expect(sup.markExited('p', { crashed: true })).toEqual({
      restart: true,
      delayMs: 200,
      attempt: 3
    })
  })

  it('a fresh activation resets the crash counter', () => {
    const sup = new PluginSupervisor({ maxRestarts: 1, backoffMs: [10] })
    sup.markRunning('p', { resetRestarts: true })
    sup.markExited('p', { crashed: true }) // attempt 1
    expect(sup.restartCount('p')).toBe(1)
    sup.markRunning('p', { resetRestarts: true }) // user re-activated
    expect(sup.restartCount('p')).toBe(0)
  })

  it('does not cross-contaminate plugins', () => {
    const sup = new PluginSupervisor({ maxRestarts: 0, backoffMs: [10] })
    sup.markRunning('a', { resetRestarts: true })
    sup.markRunning('b', { resetRestarts: true })
    expect(sup.markExited('a', { crashed: true })).toEqual({ restart: false, state: 'errored' })
    expect(sup.getState('b')).toBe('running')
  })

  it('reset clears state', () => {
    const sup = new PluginSupervisor()
    sup.markRunning('p', { resetRestarts: true })
    sup.reset('p')
    expect(sup.getState('p')).toBe('inactive')
  })

  it('rejects an empty backoff schedule (would index [-1] -> undefined delay)', () => {
    expect(() => new PluginSupervisor({ backoffMs: [] })).toThrow()
  })

  it('rejects a negative maxRestarts', () => {
    expect(() => new PluginSupervisor({ maxRestarts: -1 })).toThrow()
  })

  it('treats an exit for an untracked plugin as inactive (no phantom restart)', () => {
    const sup = new PluginSupervisor()
    expect(sup.markExited('never-ran', { crashed: true })).toEqual({
      restart: false,
      state: 'inactive'
    })
  })
})
