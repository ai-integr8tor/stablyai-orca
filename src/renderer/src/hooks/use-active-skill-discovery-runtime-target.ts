import { useMemo } from 'react'
import { getActiveRuntimeTarget, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'

/**
 * Runtime that owns skill discovery: a connected remote Orca runtime when one is
 * active, otherwise the local host. Lets badges read where skill files land
 * rather than always scanning the client's disk (#6789).
 */
export function useActiveSkillDiscoveryRuntimeTarget(): RuntimeClientTarget {
  const activeRuntimeEnvironmentId = useAppStore(
    (state) => state.settings?.activeRuntimeEnvironmentId ?? null
  )
  return useMemo(
    () => getActiveRuntimeTarget({ activeRuntimeEnvironmentId }),
    [activeRuntimeEnvironmentId]
  )
}
