#!/usr/bin/env node

// Writes mobile/latest-version.json — the static manifest the app reads to
// detect TestFlight betas (iTunes Lookup cannot see them). Intended to run in
// CI after a successful TestFlight upload, deriving the just-shipped marketing
// version + iOS build number from the app.json that fastlane's prepare lane
// already bumped on the runner, then committing the manifest back to main so
// installed apps see it.
import fs from 'node:fs'
import path from 'node:path'

const mobileRoot = path.resolve(import.meta.dirname, '..')
const manifestPath = path.join(mobileRoot, 'latest-version.json')
const semverPattern = /^\d+\.\d+\.\d+$/

const version = process.argv[2]
const iosBuildNumber = process.argv[3]
const notes = process.argv[4] ?? 'Latest Orca Mobile updates and fixes.'
const iosUrl = (process.argv[5] ?? process.env.MOBILE_IOS_UPDATE_URL ?? '').trim()

function parseSemver(value) {
  if (!value || !semverPattern.test(value)) {
    return null
  }
  return value.split('.').map((part) => Number(part))
}

function compareSemver(a, b) {
  const parsedA = parseSemver(a)
  const parsedB = parseSemver(b)
  if (!parsedA && !parsedB) {
    return 0
  }
  if (!parsedA) {
    return -1
  }
  if (!parsedB) {
    return 1
  }
  for (let i = 0; i < parsedA.length; i += 1) {
    if (parsedA[i] !== parsedB[i]) {
      return parsedA[i] < parsedB[i] ? -1 : 1
    }
  }
  return 0
}

function parsePositiveInteger(value) {
  if (!value || !/^\d+$/.test(value)) {
    return null
  }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function readCurrentManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
}

if (!version || !semverPattern.test(version)) {
  console.error(
    'Usage: write-version-manifest.mjs <x.y.z> <iosBuildNumber> [releaseNotes] [iosUrl]'
  )
  process.exit(1)
}

const parsedBuildNumber = parsePositiveInteger(iosBuildNumber)
if (parsedBuildNumber === null) {
  console.error('iosBuildNumber must be a positive integer')
  process.exit(1)
}

const currentManifest = readCurrentManifest()
const currentVersion = String(currentManifest?.version ?? '')
const currentBuildNumber = parsePositiveInteger(String(currentManifest?.iosBuildNumber ?? ''))
const versionOrder = compareSemver(currentVersion, version)
if (
  versionOrder > 0 ||
  (versionOrder === 0 && currentBuildNumber !== null && currentBuildNumber >= parsedBuildNumber)
) {
  // Why: release jobs can finish out of order; never let an older/equal upload
  // regress the static "latest" manifest on main.
  console.log(
    `latest-version.json already advertises ${currentVersion} (${currentBuildNumber}); skipping ${version} (${iosBuildNumber})`
  )
  process.exit(0)
}

const manifest = {
  version,
  iosBuildNumber,
  releaseNotes: notes
}

if (iosUrl) {
  manifest.iosUrl = iosUrl
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote latest-version.json -> ${version} (${iosBuildNumber})`)
