import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { SlashCommandSuggestion } from '../../../../shared/native-chat-slash-commands'

export function TerminalRichInputSlashMenu({
  suggestions,
  activeIndex,
  onChoose
}: {
  suggestions: readonly SlashCommandSuggestion[]
  activeIndex: number
  onChoose: (command: SlashCommandSuggestion) => void
}): React.JSX.Element | null {
  const activeRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])
  if (suggestions.length === 0) {
    return null
  }
  return (
    <div
      className="scrollbar-sleek absolute bottom-full left-0 right-0 z-20 mb-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      data-terminal-rich-input-menu=""
      role="listbox"
      aria-label={translate('components.terminal.richInput.slashCommands', 'Slash commands')}
    >
      {suggestions.map((command, index) => (
        <button
          key={command.name}
          ref={index === activeIndex ? activeRef : undefined}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChoose(command)}
          className={cn(
            'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
            index === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground'
          )}
        >
          <span className="shrink-0 font-medium">/{command.name}</span>
          {command.description ? (
            <span className="truncate text-xs text-muted-foreground">{command.description}</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
