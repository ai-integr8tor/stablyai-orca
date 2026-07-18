import type { IPtyProvider } from '../providers/types'
import { isShellProcess } from '../../shared/shell-process-detection'
import type { PtyCleanupInspection, PtyCleanupSafety } from '../../shared/pty-inactive-cleanup'

export type PtyInactiveCleanupProvider = Pick<
  IPtyProvider,
  'listProcesses' | 'hasChildProcesses' | 'confirmForegroundProcess'
>

export type PtyInactiveCleanupTarget = {
  id: string
  provider: PtyInactiveCleanupProvider | null
}

const INACTIVE_REVALIDATION_DELAY_MS = 100

function classifyInspection(
  children: PromiseSettledResult<boolean>,
  foreground: PromiseSettledResult<string | null>
): PtyCleanupSafety {
  if (children.status === 'fulfilled' && children.value) {
    return 'active'
  }
  if (
    foreground.status === 'fulfilled' &&
    foreground.value !== null &&
    !isShellProcess(foreground.value)
  ) {
    return 'active'
  }
  if (
    children.status === 'fulfilled' &&
    !children.value &&
    foreground.status === 'fulfilled' &&
    foreground.value !== null &&
    isShellProcess(foreground.value)
  ) {
    return 'inactive'
  }
  return 'unknown'
}

async function inspectProviderTargets(
  provider: PtyInactiveCleanupProvider,
  ids: string[]
): Promise<Map<string, PtyCleanupSafety>> {
  const safetyById = new Map<string, PtyCleanupSafety>(ids.map((id) => [id, 'unknown']))
  let liveIds: Set<string>
  try {
    liveIds = new Set((await provider.listProcesses()).map((process) => process.id))
  } catch {
    return safetyById
  }

  await Promise.all(
    ids.map(async (id) => {
      if (!liveIds.has(id)) {
        safetyById.set(id, 'gone')
        return
      }

      const confirmedForeground = provider.confirmForegroundProcess
        ? provider.confirmForegroundProcess(id)
        : Promise.resolve(null)
      const [children, foreground] = await Promise.allSettled([
        provider.hasChildProcesses(id),
        confirmedForeground
      ])
      safetyById.set(id, classifyInspection(children, foreground))
    })
  )
  return safetyById
}

export async function inspectPtyInactiveCleanupTargets(
  targets: PtyInactiveCleanupTarget[]
): Promise<PtyCleanupInspection[]> {
  const providerIds = new Map<PtyInactiveCleanupProvider, string[]>()
  for (const { id, provider } of targets) {
    if (!provider) {
      continue
    }
    const ids = providerIds.get(provider)
    if (ids) {
      ids.push(id)
    } else {
      providerIds.set(provider, [id])
    }
  }

  const safetyByProvider = new Map<PtyInactiveCleanupProvider, Map<string, PtyCleanupSafety>>()
  await Promise.all(
    [...providerIds].map(async ([provider, ids]) => {
      safetyByProvider.set(provider, await inspectProviderTargets(provider, ids))
    })
  )

  return targets.map(({ id, provider }) => ({
    id,
    safety: provider ? (safetyByProvider.get(provider)?.get(id) ?? 'unknown') : 'unknown'
  }))
}

export async function revalidatePtyInactiveCleanupTargets(
  targets: PtyInactiveCleanupTarget[],
  delay: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds))
): Promise<PtyCleanupInspection[]> {
  const firstInspection = await inspectPtyInactiveCleanupTargets(targets)
  const inactiveTargets = targets.filter(
    ({ id }) => firstInspection.find((inspection) => inspection.id === id)?.safety === 'inactive'
  )
  if (inactiveTargets.length === 0) {
    return firstInspection
  }

  // Why: foreground-process detection can briefly report the shell immediately
  // after another fresh scan. Require stable inactivity before destructive cleanup.
  await delay(INACTIVE_REVALIDATION_DELAY_MS)
  const confirmedInactive = new Map(
    (await inspectPtyInactiveCleanupTargets(inactiveTargets)).map(({ id, safety }) => [id, safety])
  )
  return firstInspection.map((inspection) =>
    inspection.safety === 'inactive'
      ? { ...inspection, safety: confirmedInactive.get(inspection.id) ?? 'unknown' }
      : inspection
  )
}
