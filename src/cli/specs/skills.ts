import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const SKILL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['skills', 'list'],
    summary: 'List version-matched skill guides bundled with this Orca CLI',
    usage: 'orca skills list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Reads bundled guide metadata locally without contacting the Orca runtime.',
      'Without --json, prints just the skill names, one per line.',
      'With --json, prints a topics array of canonical names and one-line descriptions.',
      'Use `orca skills get <name>` for the full guide, or `orca skills install` to install skills.'
    ]
  },
  {
    path: ['skills', 'get'],
    aliases: [['skills', 'show']],
    summary: 'Print a version-matched skill guide as Markdown',
    usage: 'orca skills get <topic> [--full] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'topic', 'full'],
    positionalArgs: ['topic'],
    notes: [
      'Reads bundled guide content locally without contacting the Orca runtime.',
      'Use --full to include bundled reference documents when the guide provides them.',
      'Use --json for a deterministic object containing canonical topic metadata and content.'
    ],
    examples: ['orca skills get orca-cli', 'orca skills get orchestration --full']
  },
  {
    path: ['skills', 'install'],
    summary: 'Install bundled Orca skills via the community skills CLI',
    usage: 'orca skills install [--skill <name>]... [--all] [--local] [--dry-run] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'skill', 'all', 'local', 'dry-run'],
    notes: [
      'Reads the bundled skill registry locally without contacting the Orca runtime.',
      'Resolves to the same `npx skills add <repo> --skill <names...>` command used by ' +
        'Orca Settings, then runs it via npx and forwards its output and exit code.',
      'Installs globally (all projects, adds --global) by default. Use --local to install ' +
        'into the current project instead.',
      'Use --dry-run to print the resolved command without running it.',
      'Omit --skill and --all to list installable skill names.',
      'Intended for headless hosts (SSH, containers, CI) with no desktop Settings UI to copy the install command from.'
    ],
    examples: [
      'orca skills install',
      'orca skills install --skill orca-cli --skill orchestration',
      'orca skills install --skill orca-cli --local',
      'orca skills install --all --dry-run'
    ]
  }
]
