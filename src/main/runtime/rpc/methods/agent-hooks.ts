import { getManagedAgentHookStatuses } from '../../../agent-hooks/managed-agent-hook-controls'
import { getActiveSshAgentHookInstallReports } from '../../../ipc/ssh'
import { defineMethod, type RpcMethod } from '../core'

export const AGENT_HOOK_METHODS: RpcMethod[] = [
  defineMethod({
    // Why: hooks on SSH remotes are installed host-side, so only the running
    // runtime can answer where they actually landed. The CLI's offline check
    // of local files reported `installed` for hosts it never inspected (#8711).
    name: 'agentHooks.status',
    params: null,
    handler: () => ({
      local: getManagedAgentHookStatuses(),
      remotes: getActiveSshAgentHookInstallReports()
    })
  })
]
