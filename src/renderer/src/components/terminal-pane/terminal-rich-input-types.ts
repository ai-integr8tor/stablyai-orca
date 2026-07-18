import type { AgentType } from '../../../../shared/agent-status-types'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import type { TerminalRichInputSubmitResult } from './terminal-rich-input-submit'

export type TerminalRichInputProps = {
  open: boolean
  pane: ManagedPane
  scopeKey: string
  worktreeId: string
  agent: AgentType | null
  connectionId: string | null
  runtimeEnvironmentId: string | null
  onClose: () => void
  onSubmit: (text: string, imagePaths: string[]) => Promise<TerminalRichInputSubmitResult>
}
