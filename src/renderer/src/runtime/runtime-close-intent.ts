import { createBrowserUuid } from '@/lib/browser-uuid'
import type {
  RuntimeCloseIntent,
  RuntimeCloseIntentSource
} from '../../../shared/runtime-close-intent'

export function createRuntimeCloseIntent(args: {
  source: RuntimeCloseIntentSource
  userInitiated: boolean
  worktreeId: string
  clientTabId?: string
  hostTabId?: string
  ptyOrHandle?: string
}): RuntimeCloseIntent {
  return {
    ...args,
    requestId: createBrowserUuid(),
    occurredAt: Date.now()
  }
}
