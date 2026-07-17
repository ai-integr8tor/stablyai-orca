import { SquareTerminal } from 'lucide-react'
import { translate } from '@/i18n/i18n'

export type TerminalRichInputSendError = 'not-started' | 'partially-written' | null

export function TerminalRichInputStatus({
  error
}: {
  error: TerminalRichInputSendError
}): React.JSX.Element {
  const text = error
    ? error === 'partially-written'
      ? translate(
          'components.terminal.richInput.sendPartial',
          'Part of the input was pasted. Check the terminal before retrying.'
        )
      : translate('components.terminal.richInput.sendFailed', 'Terminal input was not sent.')
    : translate('components.terminal.richInput.hint', 'Enter to send · Shift+Enter for newline')
  return (
    <>
      <SquareTerminal className="size-3.5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{text}</span>
    </>
  )
}
