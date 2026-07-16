#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { forwardSynchronousChildFailure } from './synchronous-child-process-result.mjs'

if (process.platform === 'win32') {
  runNodeScript('config/scripts/build-windows-cli-launcher.mjs')
  process.exit(0)
}

if (process.platform !== 'darwin') {
  console.log(`[native-build] no macOS native computer build required on ${process.platform}`)
  process.exit(0)
}

runPnpmScript('build:computer-macos')
runPnpmScript('build:notification-status-macos')
process.exit(0)

function runPnpmScript(scriptName) {
  const npmExecPath = process.env.npm_execpath
  const command = npmExecPath
    ? process.execPath
    : process.platform === 'win32'
      ? 'pnpm.cmd'
      : 'pnpm'
  const args = npmExecPath ? [npmExecPath, 'run', scriptName] : ['run', scriptName]
  const result = spawnSync(command, args, { stdio: 'inherit' })
  forwardSynchronousChildFailure(result)
}

function runNodeScript(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit' })
  forwardSynchronousChildFailure(result)
}
