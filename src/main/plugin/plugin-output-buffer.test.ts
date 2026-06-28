import { describe, expect, it } from 'vitest'
import { PluginOutputBuffer } from './plugin-output-buffer'

describe('PluginOutputBuffer', () => {
  it('records complete lines with monotonic seq', () => {
    const buf = new PluginOutputBuffer()
    buf.append('stdout', 'a\nb\n')
    buf.append('stderr', 'c\n')
    const snap = buf.snapshot()
    expect(snap.map((l) => l.text)).toEqual(['a', 'b', 'c'])
    expect(snap.map((l) => l.channel)).toEqual(['stdout', 'stdout', 'stderr'])
    expect(snap.map((l) => l.seq)).toEqual([0, 1, 2])
  })

  it('reassembles a line split across chunk boundaries', () => {
    const buf = new PluginOutputBuffer()
    buf.append('stdout', 'hel')
    buf.append('stdout', 'lo\nworld')
    // 'hello' is complete; 'world' is still pending (no newline yet)
    expect(buf.snapshot().map((l) => l.text)).toEqual(['hello'])
    buf.flush()
    expect(buf.snapshot().map((l) => l.text)).toEqual(['hello', 'world'])
  })

  it('strips a trailing CR from CRLF output', () => {
    const buf = new PluginOutputBuffer()
    buf.append('stdout', 'line1\r\nline2\r\n')
    expect(buf.snapshot().map((l) => l.text)).toEqual(['line1', 'line2'])
  })

  it('caps a newline-less flood to maxLineLength instead of growing unbounded', () => {
    const buf = new PluginOutputBuffer(1000, 8)
    buf.append('stdout', 'x'.repeat(50)) // no newline, exceeds maxLineLength=8
    const snap = buf.snapshot()
    expect(snap).toHaveLength(1)
    expect(snap[0].text).toBe('xxxxxxxx') // truncated to 8
  })

  it('truncates an over-long completed line', () => {
    const buf = new PluginOutputBuffer(1000, 5)
    buf.append('stdout', 'abcdefghij\n')
    expect(buf.snapshot()[0].text).toBe('abcde')
  })

  it('drops oldest lines past capacity (ring behavior)', () => {
    const buf = new PluginOutputBuffer(3)
    buf.append('stdout', '1\n2\n3\n4\n5\n')
    expect(buf.snapshot().map((l) => l.text)).toEqual(['3', '4', '5'])
    expect(buf.size).toBe(3)
  })

  it('ignores empty chunks; clear resets lines and pending but keeps seq monotonic', () => {
    const buf = new PluginOutputBuffer()
    buf.append('stdout', '')
    expect(buf.size).toBe(0)
    buf.append('stdout', 'a\n')
    buf.clear()
    expect(buf.snapshot()).toEqual([])
    buf.append('stdout', 'b\n')
    expect(buf.snapshot()[0].seq).toBe(1) // continues from before clear, not reset to 0
  })

  it('rejects non-positive capacity / maxLineLength', () => {
    expect(() => new PluginOutputBuffer(0)).toThrow()
    expect(() => new PluginOutputBuffer(10, 0)).toThrow()
  })
})
