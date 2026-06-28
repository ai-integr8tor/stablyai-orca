// Type guards for the "ready" result frame each streaming subscription returns
// before its data frames: terminal.subscribe -> { type: 'subscribed', streamId }
// and browser.screencast -> { type: 'ready', subscriptionId }. The rpc-client
// message loop uses these to bind a subscription's server-assigned id.

export function isTerminalSubscribedResult(
  value: unknown
): value is { type: 'subscribed'; streamId: number } {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'subscribed' &&
    typeof (value as { streamId?: unknown }).streamId === 'number'
  )
}

export function isBrowserScreencastReadyResult(
  value: unknown
): value is { type: 'ready'; subscriptionId: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'ready' &&
    typeof (value as { subscriptionId?: unknown }).subscriptionId === 'string'
  )
}
