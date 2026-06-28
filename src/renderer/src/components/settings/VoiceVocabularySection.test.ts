import { describe, expect, it } from 'vitest'
import { parseCustomVocabularyDraft } from './VoiceVocabularySection'

describe('parseCustomVocabularyDraft', () => {
  it('trims whitespace, drops empty lines, and deduplicates case-insensitively', () => {
    expect(parseCustomVocabularyDraft('  Orca\n\norca\nSynthGL\n  SynthGL  ')).toEqual([
      'Orca',
      'SynthGL'
    ])
  })

  it('matches IPC hotword limits before settings are saved', () => {
    expect(parseCustomVocabularyDraft(`Orca\nSynthGL\rbad\n${'x'.repeat(121)}`)).toEqual(['Orca'])
  })
})
