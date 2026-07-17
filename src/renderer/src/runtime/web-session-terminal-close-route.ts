const TERMINAL_CLOSE_ROUTE_TTL_MS = 10_000

export type WebSessionTerminalCloseRoute = {
  requestTabId: string
  terminalTabId: string
  worktreeId: string
  environmentId: string
  hostTabId: string
  recordedAt: number
}

type PendingTerminalCloseRoute = WebSessionTerminalCloseRoute & {
  localTabIds: readonly string[]
}

const pendingRouteByLocalTabId = new Map<string, Map<string, PendingTerminalCloseRoute>>()

function routeScopeKey(route: Pick<WebSessionTerminalCloseRoute, 'environmentId' | 'worktreeId'>) {
  return `${route.environmentId}\u0000${route.worktreeId}`
}

function deleteRoute(route: PendingTerminalCloseRoute): void {
  for (const localTabId of route.localTabIds) {
    const byScope = pendingRouteByLocalTabId.get(localTabId)
    byScope?.delete(routeScopeKey(route))
    if (byScope?.size === 0) {
      pendingRouteByLocalTabId.delete(localTabId)
    }
  }
}

function getPendingRoutes(): Set<PendingTerminalCloseRoute> {
  const routes = new Set<PendingTerminalCloseRoute>()
  for (const byScope of pendingRouteByLocalTabId.values()) {
    for (const route of byScope.values()) {
      routes.add(route)
    }
  }
  return routes
}

function isExpired(route: WebSessionTerminalCloseRoute, now: number): boolean {
  return now - route.recordedAt > TERMINAL_CLOSE_ROUTE_TTL_MS
}

function pruneExpiredRoutes(now: number): void {
  if (pendingRouteByLocalTabId.size === 0) {
    return
  }
  for (const route of getPendingRoutes()) {
    if (isExpired(route, now)) {
      deleteRoute(route)
    }
  }
}

export function hasPendingWebSessionTerminalCloseRoutes(now = Date.now()): boolean {
  pruneExpiredRoutes(now)
  return pendingRouteByLocalTabId.size > 0
}

export function recordWebSessionTerminalCloseRoute(
  route: Omit<WebSessionTerminalCloseRoute, 'recordedAt'> & { localTabIds?: readonly string[] },
  now = Date.now()
): void {
  pruneExpiredRoutes(now)
  const normalized = {
    requestTabId: route.requestTabId.trim(),
    terminalTabId: route.terminalTabId.trim(),
    worktreeId: route.worktreeId.trim(),
    environmentId: route.environmentId.trim(),
    hostTabId: route.hostTabId.trim()
  }
  if (Object.values(normalized).some((value) => !value)) {
    return
  }
  const localTabIds = [
    ...new Set(
      [normalized.requestTabId, normalized.terminalTabId, ...(route.localTabIds ?? [])]
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ]
  const next: PendingTerminalCloseRoute = { ...normalized, localTabIds, recordedAt: now }
  const scope = routeScopeKey(next)
  for (const localTabId of localTabIds) {
    const previous = pendingRouteByLocalTabId.get(localTabId)?.get(scope)
    if (previous) {
      deleteRoute(previous)
    }
  }
  for (const localTabId of localTabIds) {
    const byScope = pendingRouteByLocalTabId.get(localTabId) ?? new Map()
    byScope.set(scope, next)
    pendingRouteByLocalTabId.set(localTabId, byScope)
  }
}

export function consumeWebSessionTerminalCloseRoute(
  requestTabId: string,
  now = Date.now()
): WebSessionTerminalCloseRoute | null {
  const normalizedRequestTabId = requestTabId.trim()
  pruneExpiredRoutes(now)
  const byScope = pendingRouteByLocalTabId.get(normalizedRequestTabId)
  if (!byScope) {
    return null
  }
  const routes = [...(pendingRouteByLocalTabId.get(normalizedRequestTabId)?.values() ?? [])]
  // Why: a colliding local id across hosts is ambiguous; losing a close is safer
  // than routing destructive intent to the wrong authoritative terminal.
  if (routes.length !== 1) {
    return null
  }
  deleteRoute(routes[0]!)
  const { localTabIds: _localTabIds, ...route } = routes[0]!
  return route
}

export function clearWebSessionTerminalCloseRoutesForLocalTab(localTabId: string): void {
  const normalized = localTabId.trim()
  for (const route of getPendingRoutes()) {
    if (route.localTabIds.includes(normalized)) {
      deleteRoute(route)
    }
  }
}

export function clearWebSessionTerminalCloseRouteForExplicitClose(args: {
  localOrHostTabId: string
  worktreeId: string
  environmentId: string
}): void {
  const tabId = args.localOrHostTabId.trim()
  const worktreeId = args.worktreeId.trim()
  const environmentId = args.environmentId.trim()
  for (const route of getPendingRoutes()) {
    if (
      route.worktreeId === worktreeId &&
      route.environmentId === environmentId &&
      (route.localTabIds.includes(tabId) || route.hostTabId === tabId)
    ) {
      deleteRoute(route)
    }
  }
}

export function reconcileWebSessionTerminalCloseRoutes(args: {
  worktreeId: string
  environmentId: string
  hostTabIdByLocalTabId: ReadonlyMap<string, string>
  presentHostTabIds: ReadonlySet<string>
  now?: number
}): void {
  const now = args.now ?? Date.now()
  for (const route of getPendingRoutes()) {
    if (route.worktreeId !== args.worktreeId || route.environmentId !== args.environmentId) {
      continue
    }
    const authoritativeHostTabId = args.hostTabIdByLocalTabId.get(route.terminalTabId)
    if (
      isExpired(route, now) ||
      !args.presentHostTabIds.has(route.hostTabId) ||
      (authoritativeHostTabId !== undefined && authoritativeHostTabId !== route.hostTabId)
    ) {
      deleteRoute(route)
    }
  }
}

export function clearWebSessionTerminalCloseRoutesForWorktree(
  environmentId: string,
  worktreeId: string
): void {
  for (const route of getPendingRoutes()) {
    if (route.environmentId === environmentId && route.worktreeId === worktreeId) {
      deleteRoute(route)
    }
  }
}

export function clearWebSessionTerminalCloseRoutesForEnvironment(environmentId: string): void {
  for (const route of getPendingRoutes()) {
    if (route.environmentId === environmentId) {
      deleteRoute(route)
    }
  }
}

export function resetWebSessionTerminalCloseRoutesForTests(): void {
  pendingRouteByLocalTabId.clear()
}
