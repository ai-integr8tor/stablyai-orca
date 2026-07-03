import type { SkillDiscoveryResult, SkillDiscoveryTarget } from '../../../shared/skills'
import { callRuntimeRpc, type RuntimeClientTarget } from './runtime-rpc-client'

const SKILL_DISCOVERY_TIMEOUT_MS = 15_000

/**
 * Discover skills on the runtime that actually runs them: the local desktop host
 * (or its WSL/project runtime) by default, or a connected remote Orca runtime
 * when one is active. A remote runtime scans its own home roots, so the
 * local-only discovery target (WSL/project runtime) is dropped and only an
 * explicit cwd is forwarded. This keeps install badges in sync with where the
 * skill files land instead of always reading the client's disk (#6789).
 */
export async function discoverSkillsForRuntimeTarget(
  runtimeTarget: RuntimeClientTarget,
  target?: SkillDiscoveryTarget
): Promise<SkillDiscoveryResult> {
  if (runtimeTarget.kind === 'local') {
    return window.api.skills.discover(target)
  }
  const cwd = target?.cwd?.trim() || undefined
  return callRuntimeRpc<SkillDiscoveryResult>(
    runtimeTarget,
    'skills.discover',
    cwd ? { cwd } : {},
    {
      timeoutMs: SKILL_DISCOVERY_TIMEOUT_MS
    }
  )
}
