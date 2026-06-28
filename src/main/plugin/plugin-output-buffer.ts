// Bounded ring buffer for a plugin backend's stdout/stderr. The plugin host
// captures child-process output here so the management UI's "View Output" can
// show recent logs without unbounded memory growth (authority in main, the
// renderer reads a snapshot). Pure + framework-free, so it unit-tests directly.
//
// Two bounds keep memory safe regardless of plugin behavior: `capacity` caps
// the number of retained lines, and `maxLineLength` caps any single line —
// without the latter, a plugin emitting a multi-MB line with no newline would
// grow the pending buffer without limit.

export type OutputChannel = 'stdout' | 'stderr'

export type OutputLine = {
  channel: OutputChannel
  text: string
  seq: number
}

const DEFAULT_CAPACITY = 1000
const DEFAULT_MAX_LINE_LENGTH = 64 * 1024

export class PluginOutputBuffer {
  private lines: OutputLine[] = []
  private nextSeq = 0
  // Unterminated tail per channel; completed when a newline arrives (or on
  // flush). Reassembles lines split across chunk boundaries.
  private pending: Record<OutputChannel, string> = { stdout: '', stderr: '' }

  constructor(
    private readonly capacity: number = DEFAULT_CAPACITY,
    private readonly maxLineLength: number = DEFAULT_MAX_LINE_LENGTH
  ) {
    if (capacity <= 0) {
      throw new Error('PluginOutputBuffer capacity must be > 0')
    }
    if (maxLineLength <= 0) {
      throw new Error('PluginOutputBuffer maxLineLength must be > 0')
    }
  }

  // Append a chunk. Complete lines (terminated by '\n', possibly preceded by a
  // chunk-boundary split) are recorded; the trailing partial is held until the
  // next newline or flush. An over-long pending tail is truncated to bound memory.
  append(channel: OutputChannel, chunk: string): void {
    if (chunk.length === 0) {
      return
    }
    let buffer = this.pending[channel] + chunk
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      this.pushLine(channel, buffer.slice(0, newlineIndex))
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
    }
    // Cap the unterminated tail so a newline-less flood can't grow without limit.
    if (buffer.length > this.maxLineLength) {
      this.pushLine(channel, buffer.slice(0, this.maxLineLength))
      buffer = ''
    }
    this.pending[channel] = buffer
  }

  // Emit any buffered partial line as a final line. Call when the backend exits
  // so a last unterminated line is not lost.
  flush(): void {
    for (const channel of ['stdout', 'stderr'] as OutputChannel[]) {
      if (this.pending[channel].length > 0) {
        this.pushLine(channel, this.pending[channel])
        this.pending[channel] = ''
      }
    }
  }

  private pushLine(channel: OutputChannel, raw: string): void {
    // Strip a single trailing CR so CRLF (Windows) output doesn't leave '\r'.
    let text = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (text.length > this.maxLineLength) {
      text = text.slice(0, this.maxLineLength)
    }
    this.lines.push({ channel, text, seq: this.nextSeq++ })
    if (this.lines.length > this.capacity) {
      this.lines.splice(0, this.lines.length - this.capacity)
    }
  }

  snapshot(): OutputLine[] {
    return [...this.lines]
  }

  // Clears retained + pending output. `seq` stays monotonic across clears so a
  // consumer polling by seq never sees a number it already processed reused.
  clear(): void {
    this.lines = []
    this.pending = { stdout: '', stderr: '' }
  }

  get size(): number {
    return this.lines.length
  }
}
