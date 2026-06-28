#!/usr/bin/env node
/**
 * Bundle the relay daemon into a single relay.js file per platform.
 *
 * The relay runs on remote hosts via `node relay.js`, so it must be a
 * self-contained CommonJS bundle with no external dependencies beyond
 * Node.js built-ins. Native addons (node-pty, @parcel/watcher) are
 * marked external and expected to be installed on the remote or
 * gracefully degraded.
 */
import { build } from 'esbuild'
import { createHash } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Why: the script lives under config/scripts, so go two levels up to reach the repo root.
const ROOT = join(__dirname, '..', '..')
const RELAY_ENTRY = join(ROOT, 'src', 'relay', 'relay.ts')
// The trusted plugin backend child is forked by the relay from a co-located
// plugin-host-entry.js, so it ships alongside relay.js (resolved bundle-relative
// by relayPluginHostEntryPath) — only plugin *files* transfer at provision time.
const PLUGIN_HOST_ENTRY = join(ROOT, 'src', 'main', 'plugin', 'plugin-host-entry.ts')

const PLATFORMS = [
  'linux-x64',
  'linux-arm64',
  'darwin-x64',
  'darwin-arm64',
  'win32-x64',
  'win32-arm64'
]

const RELAY_VERSION = '0.1.0'

// Shared esbuild options for every node bundle this script emits. Native addons
// cannot be bundled — they must exist on the remote host; the relay gracefully
// degrades when absent.
const BASE_BUILD = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['node-pty', '@parcel/watcher'],
  sourcemap: false,
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"'
  }
}

for (const platform of PLATFORMS) {
  const outDir = join(ROOT, 'out', 'relay', platform)
  mkdirSync(outDir, { recursive: true })

  await build({ ...BASE_BUILD, entryPoints: [RELAY_ENTRY], outfile: join(outDir, 'relay.js') })

  // Ship the plugin backend host-entry next to relay.js so the relay can fork it
  // without a per-plugin transfer.
  await build({
    ...BASE_BUILD,
    entryPoints: [PLUGIN_HOST_ENTRY],
    outfile: join(outDir, 'plugin-host-entry.js')
  })

  // Why: include a content hash so the deploy check detects code changes
  // even when RELAY_VERSION hasn't been bumped (common during development).
  const relayContent = readFileSync(join(outDir, 'relay.js'))
  const hash = createHash('sha256').update(relayContent).digest('hex').slice(0, 12)
  writeFileSync(join(outDir, '.version'), `${RELAY_VERSION}+${hash}`)

  console.log(`Built relay for ${platform} → ${outDir}/relay.js`)
}

console.log('Relay build complete.')
