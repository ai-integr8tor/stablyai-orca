export function shouldShowNativeChatWorking(args: {
  isConversation: boolean
  viewWorking: boolean
  hookWorking: boolean
  pendingWorking?: boolean
  interrupted: boolean
}): boolean {
  const rawWorking =
    args.isConversation && (args.viewWorking || args.hookWorking || args.pendingWorking === true)
  return rawWorking && !args.interrupted
}

export function shouldClearNativeChatWorkingSuppression(args: {
  viewWorking: boolean
  hookWorking: boolean
  pendingWorking?: boolean
}): boolean {
  return !args.viewWorking && !args.hookWorking && args.pendingWorking !== true
}
