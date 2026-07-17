/* eslint-disable max-lines -- Why: local and relay Space scans share the same
   cancellation, symlink, and top-level compaction semantics in one scanner. */
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Dirent } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { platform } from 'node:process'
import type { Readable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import type {
  WorkspaceSpaceDirectoryScanResult,
  WorkspaceSpaceItem,
  WorkspaceSpaceItemKind
} from '../shared/workspace-space-types'
import { compactWorkspaceSpaceItems } from '../shared/workspace-space-compaction'
import type { RequestContext } from './dispatcher'

const RELAY_FS_CONCURRENCY = 48
const DU_STDERR_MAX_CHARS = 64 * 1024

type AsyncLimiter = <T>(task: () => Promise<T>) => Promise<T>

type ScanStats = {
  name: string
  path: string
  kind: WorkspaceSpaceItemKind
  sizeBytes: number
  skippedEntryCount: number
}

class RelayWorkspaceSpaceScanCancelledError extends Error {
  constructor() {
    super('Workspace space scan cancelled')
    this.name = 'RelayWorkspaceSpaceScanCancelledError'
  }
}

function throwIfCancelled(context: RequestContext): void {
  if (context.isStale() || context.signal?.aborted) {
    throw new RelayWorkspaceSpaceScanCancelledError()
  }
}

function createAsyncLimiter(maxConcurrent: number, context: RequestContext): AsyncLimiter {
  let active = 0
  const queue: { resolve: () => void }[] = []

  const acquire = async (): Promise<void> => {
    throwIfCancelled(context)
    if (active < maxConcurrent) {
      active += 1
      return
    }
    await new Promise<void>((resolve, reject) => {
      let onAbort: (() => void) | null = null
      const waiter = {
        resolve: () => {
          if (onAbort) {
            context.signal?.removeEventListener('abort', onAbort)
          }
          resolve()
        }
      }
      onAbort = () => {
        const index = queue.indexOf(waiter)
        if (index !== -1) {
          queue.splice(index, 1)
        }
        reject(new RelayWorkspaceSpaceScanCancelledError())
      }
      queue.push(waiter)
      if (context.signal) {
        context.signal.addEventListener('abort', onAbort, { once: true })
        if (context.signal.aborted) {
          onAbort()
        }
      }
    })
    throwIfCancelled(context)
    active += 1
  }

  return async <T>(task: () => Promise<T>): Promise<T> => {
    await acquire()
    try {
      return await task()
    } finally {
      active -= 1
      const next = queue.shift()
      next?.resolve()
    }
  }
}

function normalizeDuPath(pathValue: string): string {
  const trimmed = pathValue.replace(/\/+$/, '')
  return trimmed.length > 0 ? trimmed : pathValue
}

function parseDuDepthOneLine(line: string): [string, number] | null {
  const normalizedLine = line.endsWith('\r') ? line.slice(0, -1) : line
  if (!normalizedLine) {
    return null
  }
  const match = /^(\d+)\s+(.+)$/.exec(normalizedLine)
  if (!match) {
    return null
  }
  return [normalizeDuPath(match[2]), Number(match[1]) * 1024]
}

function consumeDuOutputChunk(
  sizes: Map<string, number>,
  bufferedLine: string,
  chunkText: string
): string {
  const lines = `${bufferedLine}${chunkText}`.split('\n')
  const nextBufferedLine = lines.pop() ?? ''
  for (const line of lines) {
    const parsed = parseDuDepthOneLine(line)
    if (parsed) {
      sizes.set(parsed[0], parsed[1])
    }
  }
  return nextBufferedLine
}

async function readDuDepthOne(
  rootPath: string,
  context: RequestContext
): Promise<Map<string, number>> {
  throwIfCancelled(context)
  return new Promise<Map<string, number>>((resolve, reject) => {
    let settled = false
    let child: ChildProcessByStdio<null, Readable, Readable> | undefined
    let onAbort: (() => void) | null = null
    let bufferedLine = ''
    let stderr = ''
    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')
    const sizes = new Map<string, number>()
    const appendStderr = (chunkText: string): void => {
      if (stderr.length < DU_STDERR_MAX_CHARS) {
        stderr = `${stderr}${chunkText}`.slice(0, DU_STDERR_MAX_CHARS)
      }
    }
    const settle = (callback: () => void): void => {
      if (settled) {
        return
      }
      settled = true
      if (onAbort) {
        context.signal?.removeEventListener('abort', onAbort)
      }
      callback()
    }
    onAbort = () => {
      settle(() => {
        child?.kill()
        reject(new RelayWorkspaceSpaceScanCancelledError())
      })
    }
    context.signal?.addEventListener('abort', onAbort, { once: true })
    if (context.signal?.aborted || context.isStale()) {
      onAbort()
      return
    }

    try {
      // Why: relay scans may run on huge remote worktrees; streaming avoids
      // execFile buffering while keeping native du as the exact source.
      child = spawn('du', ['-k', '-d', '1', rootPath], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      settle(() => reject(error))
      return
    }
    child.stdout.on('data', (chunk) => {
      bufferedLine = consumeDuOutputChunk(sizes, bufferedLine, stdoutDecoder.write(chunk))
    })
    child.stderr.on('data', (chunk) => {
      appendStderr(stderrDecoder.write(chunk))
    })
    child.once('error', (error) => {
      settle(() => reject(error))
    })
    child.once('close', (code) => {
      settle(() => {
        const decodedTail = stdoutDecoder.end()
        if (decodedTail) {
          bufferedLine = consumeDuOutputChunk(sizes, bufferedLine, decodedTail)
        }
        appendStderr(stderrDecoder.end())
        const parsed = parseDuDepthOneLine(bufferedLine)
        if (parsed) {
          sizes.set(parsed[0], parsed[1])
        }
        if (code === 0) {
          resolve(sizes)
          return
        }
        reject(new Error(stderr.trim() || `du exited with code ${code ?? 'null'}`))
      })
    })
  })
}

function toWorkspaceSpaceItem(stats: ScanStats): WorkspaceSpaceItem {
  return {
    name: stats.name,
    path: stats.path,
    kind: stats.kind,
    sizeBytes: stats.sizeBytes
  }
}

async function scanTopLevelEntryWithDu(
  entryPath: string,
  name: string,
  duSizes: Map<string, number>,
  limit: AsyncLimiter,
  context: RequestContext
): Promise<ScanStats> {
  throwIfCancelled(context)
  const stats = await limit(() => lstat(entryPath))
  throwIfCancelled(context)

  if (stats.isSymbolicLink()) {
    return {
      name,
      path: entryPath,
      kind: 'symlink',
      sizeBytes: stats.size,
      skippedEntryCount: 0
    }
  }

  if (!stats.isDirectory()) {
    return {
      name,
      path: entryPath,
      kind: 'file',
      sizeBytes: stats.size,
      skippedEntryCount: 0
    }
  }

  return {
    name,
    path: entryPath,
    kind: 'directory',
    sizeBytes: duSizes.get(normalizeDuPath(entryPath)) ?? stats.size,
    skippedEntryCount: 0
  }
}

async function scanEntryAggregate(
  entryPath: string,
  name: string,
  limit: AsyncLimiter,
  context: RequestContext
): Promise<ScanStats> {
  throwIfCancelled(context)
  const stats = await limit(() => lstat(entryPath))
  throwIfCancelled(context)

  if (stats.isSymbolicLink()) {
    return {
      name,
      path: entryPath,
      kind: 'symlink',
      sizeBytes: stats.size,
      skippedEntryCount: 0
    }
  }

  if (!stats.isDirectory()) {
    return {
      name,
      path: entryPath,
      kind: 'file',
      sizeBytes: stats.size,
      skippedEntryCount: 0
    }
  }

  let entries: Dirent[]
  try {
    entries = await limit(() => readdir(entryPath, { withFileTypes: true }))
  } catch {
    return {
      name,
      path: entryPath,
      kind: 'directory',
      sizeBytes: stats.size,
      skippedEntryCount: 1
    }
  }

  const childStats = await Promise.all(
    entries.map(async (entry): Promise<ScanStats | null> => {
      try {
        return await scanEntryAggregate(join(entryPath, entry.name), entry.name, limit, context)
      } catch (error) {
        if (error instanceof RelayWorkspaceSpaceScanCancelledError) {
          throw error
        }
        return null
      }
    })
  )

  let sizeBytes = stats.size
  let skippedEntryCount = 0
  for (const child of childStats) {
    if (!child) {
      skippedEntryCount += 1
      continue
    }
    sizeBytes += child.sizeBytes
    skippedEntryCount += child.skippedEntryCount
  }

  return {
    name,
    path: entryPath,
    kind: 'directory',
    sizeBytes,
    skippedEntryCount
  }
}

async function scanDirectoryWithDu(
  rootPath: string,
  context: RequestContext
): Promise<WorkspaceSpaceDirectoryScanResult> {
  throwIfCancelled(context)
  const rootStats = await lstat(rootPath)
  throwIfCancelled(context)
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    return scanDirectoryWithNode(rootPath, context)
  }

  const [entries, duSizes] = await Promise.all([
    readdir(rootPath, { withFileTypes: true }),
    readDuDepthOne(rootPath, context)
  ])
  throwIfCancelled(context)
  const limit = createAsyncLimiter(RELAY_FS_CONCURRENCY, context)
  const childStats = await Promise.all(
    entries.map(async (entry): Promise<ScanStats | null> => {
      try {
        return await scanTopLevelEntryWithDu(
          join(rootPath, entry.name),
          entry.name,
          duSizes,
          limit,
          context
        )
      } catch (error) {
        if (error instanceof RelayWorkspaceSpaceScanCancelledError) {
          throw error
        }
        return null
      }
    })
  )
  const children = childStats.filter((child): child is ScanStats => child !== null)
  const compact = compactWorkspaceSpaceItems(children.map(toWorkspaceSpaceItem))

  return {
    sizeBytes:
      duSizes.get(normalizeDuPath(rootPath)) ??
      rootStats.size + children.reduce((sum, child) => sum + child.sizeBytes, 0),
    skippedEntryCount: childStats.length - children.length,
    ...compact
  }
}

async function scanDirectoryWithNode(
  rootPath: string,
  context: RequestContext
): Promise<WorkspaceSpaceDirectoryScanResult> {
  throwIfCancelled(context)
  const limit = createAsyncLimiter(RELAY_FS_CONCURRENCY, context)
  const rootStats = await lstat(rootPath)
  throwIfCancelled(context)
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    const root = await scanEntryAggregate(rootPath, basename(rootPath), limit, context)
    return {
      sizeBytes: root.sizeBytes,
      skippedEntryCount: root.skippedEntryCount,
      topLevelItems: [],
      omittedTopLevelItemCount: 0,
      omittedTopLevelSizeBytes: 0
    }
  }

  let entries: Dirent[]
  try {
    entries = await readdir(rootPath, { withFileTypes: true })
  } catch {
    return {
      sizeBytes: rootStats.size,
      skippedEntryCount: 1,
      topLevelItems: [],
      omittedTopLevelItemCount: 0,
      omittedTopLevelSizeBytes: 0
    }
  }

  const childStats = await Promise.all(
    entries.map(async (entry): Promise<ScanStats | null> => {
      try {
        return await scanEntryAggregate(join(rootPath, entry.name), entry.name, limit, context)
      } catch (error) {
        if (error instanceof RelayWorkspaceSpaceScanCancelledError) {
          throw error
        }
        return null
      }
    })
  )
  const children = childStats.filter((child): child is ScanStats => child !== null)
  const compact = compactWorkspaceSpaceItems(children.map(toWorkspaceSpaceItem))

  return {
    sizeBytes: rootStats.size + children.reduce((sum, child) => sum + child.sizeBytes, 0),
    skippedEntryCount:
      children.reduce((sum, child) => sum + child.skippedEntryCount, 0) +
      childStats.length -
      children.length,
    ...compact
  }
}

export async function scanWorkspaceSpaceDirectory(
  rootPath: string,
  context: RequestContext
): Promise<WorkspaceSpaceDirectoryScanResult> {
  if (platform !== 'win32') {
    try {
      return await scanDirectoryWithDu(rootPath, context)
    } catch (error) {
      if (error instanceof RelayWorkspaceSpaceScanCancelledError) {
        throw error
      }
    }
  }
  return scanDirectoryWithNode(rootPath, context)
}
