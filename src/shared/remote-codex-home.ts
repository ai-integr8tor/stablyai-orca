const REMOTE_ORCA_CODEX_HOME_RELATIVE_PATH = '.orca/codex-runtime-home/home'

export const REMOTE_CODEX_RUNTIME_HOME_CONFIGURE_METHOD = 'codex.runtimeHome.configure'

export function getRemoteOrcaCodexHomePath(remoteHome: string): string {
  return `${remoteHome.replace(/\/+$/, '')}/${REMOTE_ORCA_CODEX_HOME_RELATIVE_PATH}`
}
