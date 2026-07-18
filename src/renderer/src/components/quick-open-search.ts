import { isClipboardTextByteLengthOverLimit } from '../../../shared/clipboard-text'
import { fuzzyMatchIndexedFile, prepareQuickOpenQuery } from './quick-open-fuzzy-match'

export const QUICK_OPEN_RESULT_LIMIT = 50
export const QUICK_OPEN_QUERY_MAX_BYTES = 2 * 1024

export type QuickOpenIndexedFile = {
  path: string
  lowerPath: string
  lowerFilename: string
  /**
   * Per lowerPath index: 1 when the char is a word start (path start, after a
   * separator, or identifier transition). Built from the original-case path
   * so ProductDetail stays two words after lowercasing.
   */
  wordStarts: Uint8Array
  inputIndex: number
}

export type QuickOpenSearchResult = {
  path: string
  score: number
}

export function prepareQuickOpenFiles(files: readonly string[]): QuickOpenIndexedFile[] {
  return files.map((path, inputIndex) => {
    // Why: Quick Open presents slash-normalized paths even on Windows.
    const searchPath = path.replace(/\\/g, '/')
    const lastSlash = searchPath.lastIndexOf('/')
    const { lowerPath, wordStarts } = buildSearchPathIndex(searchPath)
    return {
      path,
      lowerPath,
      lowerFilename: searchPath.slice(lastSlash + 1).toLowerCase(),
      wordStarts,
      inputIndex
    }
  })
}

export function isQuickOpenQueryTooLarge(
  query: string,
  maxBytes = QUICK_OPEN_QUERY_MAX_BYTES
): boolean {
  return isClipboardTextByteLengthOverLimit(query, maxBytes)
}

export function rankQuickOpenFiles(
  query: string,
  files: readonly QuickOpenIndexedFile[],
  limit = QUICK_OPEN_RESULT_LIMIT
): QuickOpenSearchResult[] {
  if (limit <= 0) {
    return []
  }
  if (isQuickOpenQueryTooLarge(query)) {
    return []
  }

  // Why: Quick Open presents slash-normalized paths even on Windows; users
  // still naturally type backslashes in path queries. Collapse internal
  // whitespace so "Product  Detail" behaves like "Product Detail".
  const normalizedQuery = query.trim().replace(/\\/g, '/').toLowerCase().replace(/\s+/g, ' ')
  if (!normalizedQuery) {
    return files.slice(0, limit).map((file) => ({ path: file.path, score: 0 }))
  }
  const preparedQuery = prepareQuickOpenQuery(normalizedQuery)

  const results: QuickOpenRankedResult[] = []
  for (const file of files) {
    const score = fuzzyMatchIndexedFile(preparedQuery, file)
    if (score === null) {
      continue
    }

    insertTopResult(results, { path: file.path, score, inputIndex: file.inputIndex }, limit)
  }

  return results.map(({ path, score }) => ({ path, score }))
}

/**
 * Word starts from the original-case slash-normalized path so identifier
 * boundaries survive lowercasing in lowerPath.
 */
function buildSearchPathIndex(searchPath: string): {
  lowerPath: string
  wordStarts: Uint8Array
} {
  const lowerPath = searchPath.toLowerCase()
  const starts = new Uint8Array(lowerPath.length)
  let lowerIndex = 0
  for (let i = 0; i < searchPath.length; i++) {
    // Why: this loop touches every character in repositories that can exceed
    // 100k paths; read each code unit once instead of repeatedly decoding it.
    const currCode = searchPath.charCodeAt(i)
    const prevCode = i > 0 ? searchPath.charCodeAt(i - 1) : -1
    const nextCode = i + 1 < searchPath.length ? searchPath.charCodeAt(i + 1) : -1
    if (
      i === 0 ||
      isPathSeparatorCode(prevCode) ||
      (isAsciiLetterCode(prevCode) && isAsciiDigitCode(currCode)) ||
      (isAsciiDigitCode(prevCode) && isAsciiLetterCode(currCode)) ||
      (isAsciiLowerOrDigitCode(prevCode) && isAsciiUpperCode(currCode)) ||
      (isAsciiUpperCode(prevCode) && isAsciiUpperCode(currCode) && isAsciiLowerCode(nextCode))
    ) {
      starts[lowerIndex] = 1
    }
    // Why: Unicode lowercasing can expand one source character, so boundary
    // offsets must advance in lowerPath's coordinate space. ASCII skips the
    // per-character lowercase allocation; 100k-file indexing is ~2x faster.
    lowerIndex += currCode < 128 ? 1 : searchPath[i].toLowerCase().length
  }
  return { lowerPath, wordStarts: starts }
}

function isAsciiLowerOrDigitCode(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122)
}

function isAsciiDigitCode(code: number): boolean {
  return code >= 48 && code <= 57
}

function isAsciiLetterCode(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function isAsciiUpperCode(code: number): boolean {
  return code >= 65 && code <= 90
}

function isAsciiLowerCode(code: number): boolean {
  return code >= 97 && code <= 122
}

function isPathSeparatorCode(code: number): boolean {
  return code === 47 || code === 95 || code === 45 || code === 46 || code === 32
}

type QuickOpenRankedResult = QuickOpenSearchResult & {
  inputIndex: number
}

function insertTopResult(
  results: QuickOpenRankedResult[],
  candidate: QuickOpenRankedResult,
  limit: number
): void {
  const worst = results.at(-1)
  if (results.length === limit && worst && compareRankedResult(candidate, worst) >= 0) {
    return
  }

  const insertAt = findInsertionIndex(results, candidate)
  results.splice(insertAt, 0, candidate)
  if (results.length > limit) {
    results.pop()
  }
}

function findInsertionIndex(
  results: readonly QuickOpenRankedResult[],
  candidate: QuickOpenRankedResult
): number {
  let low = 0
  let high = results.length

  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (compareRankedResult(candidate, results[mid]) < 0) {
      high = mid
    } else {
      low = mid + 1
    }
  }

  return low
}

function compareRankedResult(a: QuickOpenRankedResult, b: QuickOpenRankedResult): number {
  return a.score - b.score || a.inputIndex - b.inputIndex
}
