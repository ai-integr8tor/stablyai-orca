import {
  buildSetupRunnerCommand as buildSharedSetupRunnerCommand,
  inferSetupRunnerCommandPlatform
} from '../../../shared/setup-runner-command'

export function buildSetupRunnerCommand(runnerScriptPath: string): string {
  return buildSharedSetupRunnerCommand(
    runnerScriptPath,
    inferSetupRunnerCommandPlatform(runnerScriptPath)
  )
}
