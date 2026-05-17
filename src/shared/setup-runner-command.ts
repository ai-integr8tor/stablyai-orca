export type SetupRunnerCommandPlatform = 'windows' | 'posix'

export function inferSetupRunnerCommandPlatform(
  runnerScriptPath: string
): SetupRunnerCommandPlatform {
  if (isWslUncPath(runnerScriptPath)) {
    return 'posix'
  }
  return /^[A-Za-z]:[\\/]/.test(runnerScriptPath) || /^\\\\(?!wsl[.$\\])/i.test(runnerScriptPath)
    ? 'windows'
    : 'posix'
}

export function buildSetupRunnerCommand(
  runnerScriptPath: string,
  platform: SetupRunnerCommandPlatform
): string {
  if (isWslUncPath(runnerScriptPath)) {
    const linuxPath = wslUncToLinuxPath(runnerScriptPath)
    return `bash ${quotePosixArg(linuxPath)}`
  }

  if (platform === 'windows') {
    return `cmd.exe /c ${quoteWindowsArg(runnerScriptPath)}`
  }

  return `bash ${quotePosixArg(runnerScriptPath)}`
}

function isWslUncPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  return /^\/\/(wsl\.localhost|wsl\$)\//.test(normalized)
}

function wslUncToLinuxPath(windowsPath: string): string {
  const normalized = windowsPath.replace(/\\/g, '/')
  const match = normalized.match(/^\/\/(wsl\.localhost|wsl\$)\/[^/]+(\/.*)?$/)
  return match?.[2] || '/'
}

function quotePosixArg(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value
  }

  return `'${value.replace(/'/g, `'\\''`)}'`
}

function quoteWindowsArg(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}
