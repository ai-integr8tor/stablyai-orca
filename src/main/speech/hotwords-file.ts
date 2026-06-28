import { app } from 'electron'
import { createHash } from 'crypto'
import { unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { normalizeSpeechHotwords } from '../../shared/speech-hotwords'

export async function writeSpeechHotwordsFile(hotwords: unknown): Promise<string | undefined> {
  const normalizedHotwords = normalizeSpeechHotwords(hotwords)
  if (normalizedHotwords.length === 0) {
    return undefined
  }

  const content = `${normalizedHotwords.map((word) => `${word} :2.0`).join('\n')}\n`
  const digest = createHash('sha256').update(content).digest('hex').slice(0, 12)
  const hotwordsFilePath = join(app.getPath('userData'), `speech-hotwords-${digest}.txt`)
  await writeFile(hotwordsFilePath, content, 'utf-8')
  return hotwordsFilePath
}

export function removeSpeechHotwordsFile(path: string | undefined): void {
  if (path) {
    unlink(path).catch(() => {})
  }
}
