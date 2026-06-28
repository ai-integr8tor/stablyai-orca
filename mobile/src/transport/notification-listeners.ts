// Registry for server-pushed JSON-RPC notifications (a `method`, no `id`) routed
// by method name — e.g. plugin.uiMessage. Kept out of rpc-client so the
// frame-dispatch logic is isolated and unit-testable.

export type NotificationListener = (params: Record<string, unknown>) => void

export type NotificationFrame = { method?: unknown; id?: unknown; params?: unknown }

export function createNotificationRegistry() {
  const listeners = new Map<string, Set<NotificationListener>>()

  function add(method: string, listener: NotificationListener): () => void {
    let set = listeners.get(method)
    if (!set) {
      set = new Set()
      listeners.set(method, set)
    }
    set.add(listener)
    return () => {
      listeners.get(method)?.delete(listener)
    }
  }

  // Route a parsed frame to method-keyed listeners. Returns true when the frame
  // was a notification (a `method` and no `id`) and was therefore consumed, so
  // the caller can stop before the id-keyed request/stream branches.
  function tryDispatch(frame: NotificationFrame): boolean {
    if (typeof frame.method !== 'string' || frame.id !== undefined) {
      return false
    }
    const params = (frame.params ?? {}) as Record<string, unknown>
    for (const listener of listeners.get(frame.method) ?? []) {
      listener(params)
    }
    return true
  }

  return { add, tryDispatch }
}
