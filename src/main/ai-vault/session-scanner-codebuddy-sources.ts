import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AiVaultScanIssue } from '../../shared/ai-vault-types'
import { SUBAGENT_DIR_NAME } from './session-scanner-subagent-transcripts'
import { discoverFiles } from './session-scanner-discovery'
import type { AiVaultScanOptions, SessionFileDiscovery } from './session-scanner-types'

// Why: CodeBuddy is built on the Claude Agent SDK, so its transcripts live under
// `~/.codebuddy/projects` with the same `<cwd-hash>/<sessionId>.jsonl` layout.
const CODEBUDDY_PROJECTS_DIR = join(homedir(), '.codebuddy', 'projects')

export function codebuddyDiscoveries(
  options: AiVaultScanOptions,
  wslHomeDirs: readonly string[],
  limit: number,
  issues: AiVaultScanIssue[]
): Promise<SessionFileDiscovery>[] {
  return codebuddyProjectsRootDirs(wslHomeDirs).map((rootDir) =>
    discoverFiles({
      rootDir,
      limit,
      agent: 'codebuddy',
      issues,
      extensions: ['.jsonl'],
      // Why: same as Claude — Task subagent transcripts under `<session>/subagents/`
      // share the parent sessionId and aren't independently resumable.
      directoryPredicate: (name) => name !== SUBAGENT_DIR_NAME
    })
  )
}

function codebuddyProjectsRootDirs(wslHomeDirs: readonly string[]): string[] {
  return [
    CODEBUDDY_PROJECTS_DIR,
    ...wslHomeDirs.map((homeDir) => join(homeDir, '.codebuddy', 'projects'))
  ]
}
