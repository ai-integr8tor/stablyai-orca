import type { RefObject } from 'react'
import type { SlashCommandSuggestion } from '../../../../shared/native-chat-slash-commands'
import type { TerminalRichInputQuery } from './terminal-rich-input-autocomplete'

type TerminalRichInputKeydownContext = {
  mentionRef: RefObject<TerminalRichInputQuery | null>
  slashRef: RefObject<TerminalRichInputQuery | null>
  fileSuggestionsRef: RefObject<string[]>
  slashSuggestionsRef: RefObject<SlashCommandSuggestion[]>
  activeSuggestionRef: RefObject<number>
  setActiveSuggestion: (update: (index: number) => number) => void
  pasteImageFromClipboard: () => void
  chooseFile: (path: string) => void
  chooseSlash: (command: SlashCommandSuggestion, submit: boolean) => void
  closeAutocomplete: () => void
  closeComposer: () => void
  submit: () => void
}

export function handleTerminalRichInputKeyDown(
  event: KeyboardEvent,
  context: TerminalRichInputKeydownContext
): boolean {
  if (event.isComposing) {
    return false
  }
  if (event.key.toLowerCase() === 'v' && (event.metaKey || event.ctrlKey)) {
    // Native Electron image clipboards can omit the DOM paste payload. Probe
    // first, but the attachment hook does not block text paste unless an image exists.
    context.pasteImageFromClipboard()
  }
  const currentMention = context.mentionRef.current
  const fileSuggestions = context.fileSuggestionsRef.current
  const currentSlash = context.slashRef.current
  const slashSuggestions = context.slashSuggestionsRef.current
  const suggestionCount = currentMention
    ? fileSuggestions.length
    : currentSlash
      ? slashSuggestions.length
      : 0
  if (suggestionCount > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault()
    const direction = event.key === 'ArrowDown' ? 1 : -1
    context.setActiveSuggestion((index) => (index + direction + suggestionCount) % suggestionCount)
    return true
  }
  if (currentMention && fileSuggestions.length > 0) {
    if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
      event.preventDefault()
      context.chooseFile(fileSuggestions[context.activeSuggestionRef.current] ?? fileSuggestions[0])
      return true
    }
  }
  if (currentSlash && slashSuggestions.length > 0) {
    if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
      event.preventDefault()
      context.chooseSlash(
        slashSuggestions[context.activeSuggestionRef.current] ?? slashSuggestions[0],
        event.key === 'Enter'
      )
      return true
    }
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (currentMention || currentSlash) {
      context.closeAutocomplete()
    } else {
      context.closeComposer()
    }
    return true
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    context.submit()
    return true
  }
  return false
}
