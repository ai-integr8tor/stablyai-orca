import { spawn } from 'node:child_process'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import { getRepeatedStringFlag } from '../flags'
import {
  ORCA_SKILLS_REPOSITORY_URL,
  buildAgentFeatureSkillInstallCommand
} from '../../shared/agent-feature-install-commands'

type BundledSkillGuide = {
  name: string
  description: string
  markdown: string
  fullMarkdown: string
  aliases: readonly string[]
}

function canonicalGuides(guides: readonly BundledSkillGuide[]): BundledSkillGuide[] {
  return [...guides].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  )
}

function requireTopic(
  flags: Map<string, string | boolean>,
  guides: BundledSkillGuide[]
): BundledSkillGuide {
  const availableTopics = guides.map((guide) => guide.name).join(', ')
  const topic = flags.get('topic')
  if (typeof topic !== 'string' || topic.length === 0) {
    throw new RuntimeClientError(
      'invalid_argument',
      `Missing skill topic. Available topics: ${availableTopics}`
    )
  }
  // Why: installed stubs may retain an old topic forever, so aliases and canonical
  // names share one lookup table instead of being treated as transient CLI aliases.
  const guideByTopic = new Map<string, BundledSkillGuide>(
    guides.flatMap((guide) => [guide.name, ...guide.aliases].map((name) => [name, guide]))
  )
  const guide = guideByTopic.get(topic)
  if (!guide) {
    throw new RuntimeClientError(
      'invalid_argument',
      `Unknown skill topic "${topic}". Available topics: ${availableTopics}`
    )
  }
  return guide
}

function writeStdout(value: string): void {
  process.stdout.write(value.endsWith('\n') ? value : `${value}\n`)
}

// Why: `--skill` accepts the same legacy topic aliases as `skills get` so an
// old topic name keeps working here even though the installable package name
// never changes underneath it.
function resolveInstallSkillNames(
  flags: Map<string, string | boolean>,
  guides: BundledSkillGuide[]
): string[] {
  const requestedSkills = getRepeatedStringFlag(flags, 'skill')
  const installAll = flags.get('all') === true
  if (installAll && requestedSkills.length > 0) {
    throw new RuntimeClientError('invalid_argument', 'Use either --all or --skill, not both.')
  }
  if (!installAll && requestedSkills.length === 0) {
    return []
  }
  if (installAll) {
    return guides.map((guide) => guide.name)
  }
  const availableTopics = guides.map((guide) => guide.name).join(', ')
  const guideByTopic = new Map<string, BundledSkillGuide>(
    guides.flatMap((guide) => [guide.name, ...guide.aliases].map((name) => [name, guide]))
  )
  const canonicalNames = new Set<string>()
  for (const requested of requestedSkills) {
    const guide = guideByTopic.get(requested)
    if (!guide) {
      throw new RuntimeClientError(
        'invalid_argument',
        `Unknown skill "${requested}". Available skills: ${availableTopics}`
      )
    }
    canonicalNames.add(guide.name)
  }
  return [...canonicalNames].sort()
}

function runSkillInstallCommand(skillNames: string[], global: boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    // Why: Windows only resolves the `npx.cmd` shim through a shell; macOS/Linux
    // spawn the `npx` script directly without one.
    const child = spawn(
      'npx',
      [
        'skills',
        'add',
        ORCA_SKILLS_REPOSITORY_URL,
        '--skill',
        ...skillNames,
        ...(global ? ['--global'] : [])
      ],
      { stdio: 'inherit', shell: process.platform === 'win32' }
    )
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      resolve(typeof code === 'number' ? code : signal ? 1 : 0)
    })
  })
}

export const SKILL_HANDLERS: Record<string, CommandHandler> = {
  'skills list': async ({ json }) => {
    // Why: the embedded guide table is large, so unrelated CLI commands must not
    // pay its module-load and parse cost during startup.
    const { BUNDLED_SKILL_GUIDES } = await import('../bundled-skill-guides.js')
    const guides = canonicalGuides(BUNDLED_SKILL_GUIDES)
    // Why: generated registry order is not a user-facing contract, while stable
    // canonical sorting keeps agent-visible output reproducible across builds.
    const topics = guides.map((guide) => ({
      name: guide.name,
      description: guide.description.replace(/\s+/g, ' ').trim()
    }))
    writeStdout(
      json ? JSON.stringify({ topics }, null, 2) : topics.map((topic) => topic.name).join('\n')
    )
  },
  'skills get': async ({ flags, json }) => {
    // Why: keep the large generated table off the eager handler registry path.
    const { BUNDLED_SKILL_GUIDES } = await import('../bundled-skill-guides.js')
    const guides = canonicalGuides(BUNDLED_SKILL_GUIDES)
    const guide = requireTopic(flags, guides)
    const full = flags.has('full')
    const markdown = full ? guide.fullMarkdown : guide.markdown
    writeStdout(json ? JSON.stringify({ name: guide.name, full, markdown }, null, 2) : markdown)
  },
  'skills install': async ({ flags, json }) => {
    // Why: keep the large generated table off the eager handler registry path.
    const { BUNDLED_SKILL_GUIDES } = await import('../bundled-skill-guides.js')
    const guides = canonicalGuides(BUNDLED_SKILL_GUIDES)
    const skillNames = resolveInstallSkillNames(flags, guides)

    if (skillNames.length === 0) {
      const topics = guides.map((guide) => guide.name)
      writeStdout(
        json
          ? JSON.stringify({ availableSkills: topics }, null, 2)
          : [
              'Choose one or more skills to install:',
              ...topics.map((name) => `  ${name}`),
              '',
              'Usage: orca skills install --skill <name> [--skill <name> ...]',
              '   or: orca skills install --all'
            ].join('\n')
      )
      return
    }

    const global = flags.get('local') !== true
    const command = buildAgentFeatureSkillInstallCommand(skillNames, { global })
    const dryRun = flags.get('dry-run') === true

    if (dryRun) {
      writeStdout(
        json
          ? JSON.stringify({ command, skills: skillNames, global, executed: false }, null, 2)
          : `${command}\n\nRerun without --dry-run to install now.`
      )
      return
    }

    // Why: stdio is inherited for the child below, so this status line must go to
    // stderr — stdout is npx's own output, not this command's JSON channel.
    process.stderr.write(`Running: ${command}\n`)
    process.exitCode = await runSkillInstallCommand(skillNames, global)
  }
}
