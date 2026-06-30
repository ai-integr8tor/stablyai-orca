import { app, ipcMain } from 'electron'
import type { Store } from '../persistence'
import { discoverSkills } from '../skills/discovery'
import type { SkillDiscoveryResult, SkillDiscoveryTarget } from '../../shared/skills'
import { getDefaultWslDistro, getWslHome } from '../wsl'
import { callRuntimeEnvironment } from './runtime-environment-transport-routing'

type SkillDiscoveryRuntimeTarget =
  | { runtime: 'host' }
  | { runtime: 'wsl'; wslDistro: string | null | undefined }

function getSkillDiscoveryRuntimeTarget(
  target: SkillDiscoveryTarget | undefined
): SkillDiscoveryRuntimeTarget {
  const projectRuntime = target?.projectRuntime
  if (!projectRuntime) {
    return target?.runtime === 'wsl'
      ? { runtime: 'wsl', wslDistro: target.wslDistro }
      : { runtime: 'host' }
  }

  if (projectRuntime.status === 'repair-required') {
    throw new Error(
      `Project runtime requires repair before skill discovery: ${projectRuntime.repair.reason}`
    )
  }

  if (projectRuntime.runtime.kind === 'wsl') {
    return { runtime: 'wsl', wslDistro: projectRuntime.runtime.distro }
  }

  return { runtime: 'host' }
}

export function registerSkillsHandlers(store: Store): void {
  ipcMain.handle(
    'skills:discover',
    async (_event, target?: SkillDiscoveryTarget): Promise<SkillDiscoveryResult> => {
      // Why: when connected to a remote Orca runtime the skill files live on
      // the server, not on the local host. Proxy to the server's RPC method so
      // discovery scans the correct filesystem. Prefer an explicit environmentId
      // from the caller, then fall back to the persisted active environment.
      const environmentId =
        target?.environmentId?.trim() || store.getSettings().activeRuntimeEnvironmentId?.trim()
      if (environmentId) {
        const response = await callRuntimeEnvironment(
          app.getPath('userData'),
          environmentId,
          'skills.discover',
          target,
          15_000
        )
        if (response.ok) {
          return response.result as SkillDiscoveryResult
        }
        return { skills: [], sources: [], scannedAt: Date.now() }
      }

      const runtimeTarget = getSkillDiscoveryRuntimeTarget(target)
      if (runtimeTarget.runtime === 'wsl') {
        if (process.platform !== 'win32') {
          throw new Error('WSL skill discovery is only available on Windows.')
        }
        const distro = runtimeTarget.wslDistro?.trim() || getDefaultWslDistro()
        if (!distro) {
          throw new Error('No WSL distribution is available for skill discovery.')
        }
        const homeDir = getWslHome(distro)
        if (!homeDir) {
          throw new Error(`Could not resolve the WSL home directory for ${distro}.`)
        }
        return discoverSkills({ repos: [], homeDir, cwd: homeDir })
      }

      const cwd = target?.cwd?.trim() || undefined
      return cwd ? discoverSkills({ repos: [], cwd }) : discoverSkills({ repos: store.getRepos() })
    }
  )
}
