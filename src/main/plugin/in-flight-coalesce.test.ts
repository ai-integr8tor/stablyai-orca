import { describe, expect, it, vi } from 'vitest'
import { coalesceByKey } from './in-flight-coalesce'

// A deferred whose promise is resolved/rejected by the test, to hold an entry
// "in flight" deterministically.
function deferred<T>(): {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
} {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('coalesceByKey', () => {
  it('shares one in-flight promise for concurrent calls with the same key', async () => {
    const map = new Map<string, Promise<number>>()
    const d = deferred<number>()
    const factory = vi.fn(() => d.promise)

    const a = coalesceByKey(map, 'k', factory)
    const b = coalesceByKey(map, 'k', factory)

    expect(factory).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)

    d.resolve(42)
    expect(await a).toBe(42)
    expect(await b).toBe(42)
  })

  it('clears the entry on resolve so a later call re-runs the factory', async () => {
    const map = new Map<string, Promise<number>>()
    const factory = vi.fn(() => Promise.resolve(1))

    await coalesceByKey(map, 'k', factory)
    expect(map.has('k')).toBe(false)

    await coalesceByKey(map, 'k', factory)
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('clears the entry on reject so a later call re-runs the factory', async () => {
    const map = new Map<string, Promise<number>>()
    const factory = vi
      .fn()
      .mockReturnValueOnce(Promise.reject(new Error('boom')))
      .mockReturnValueOnce(Promise.resolve(7))

    await expect(coalesceByKey(map, 'k', factory)).rejects.toThrow('boom')
    expect(map.has('k')).toBe(false)

    await expect(coalesceByKey(map, 'k', factory)).resolves.toBe(7)
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('does not coalesce across different keys', () => {
    const map = new Map<string, Promise<number>>()
    const factory = vi.fn(() => deferred<number>().promise)

    const a = coalesceByKey(map, 'a', factory)
    const b = coalesceByKey(map, 'b', factory)

    expect(factory).toHaveBeenCalledTimes(2)
    expect(a).not.toBe(b)
  })

  it('does not delete a newer entry that replaced a settled one for the same key', async () => {
    const map = new Map<string, Promise<number>>()
    const first = deferred<number>()
    const second = deferred<number>()

    // First in-flight promise for 'k'.
    const a = coalesceByKey(map, 'k', () => first.promise)
    // Force a newer entry for the same key (simulating a re-run that raced the
    // first one's settle) by overwriting the map directly.
    map.set('k', second.promise)

    // Settling the first promise must NOT evict the newer entry.
    first.resolve(1)
    await a
    expect(map.get('k')).toBe(second.promise)

    second.resolve(2)
    await second.promise
  })
})
