import { describe, expect, it } from 'vitest'
import {
  formatInstallRgMessage,
  parseInstallRgMessage
} from './quick-open-install-rg-message-format'

describe('install-rg message format round trip', () => {
  it('parses a local message the formatter produced', () => {
    const message = formatInstallRgMessage({
      reason: 'File listing exceeded 10000 files',
      location: 'local',
      command: 'brew install ripgrep'
    })

    expect(parseInstallRgMessage(message)).toEqual({
      reason: 'File listing exceeded 10000 files',
      isRemote: false,
      tail: 'brew install ripgrep'
    })
  })

  it('parses a remote message and flags it as remote', () => {
    const message = formatInstallRgMessage({
      reason: 'File listing timed out',
      location: 'remote',
      command: 'sudo apt install ripgrep'
    })

    expect(parseInstallRgMessage(message)).toEqual({
      reason: 'File listing timed out',
      isRemote: true,
      tail: 'sudo apt install ripgrep'
    })
  })

  it('keeps a multi-word guidance tail intact', () => {
    const message = formatInstallRgMessage({
      reason: 'File listing timed out',
      location: 'remote',
      command: 'install ripgrep via your package manager (e.g. apt/dnf/pacman)'
    })

    expect(parseInstallRgMessage(message)?.tail).toBe(
      'install ripgrep via your package manager (e.g. apt/dnf/pacman)'
    )
  })

  it('parses a reason that itself contains parentheses', () => {
    const message = formatInstallRgMessage({
      reason: "EACCES: permission denied, scandir '/foo (bar)'",
      location: 'remote',
      command: 'sudo apt install ripgrep'
    })

    expect(parseInstallRgMessage(message)).toEqual({
      reason: "EACCES: permission denied, scandir '/foo (bar)'",
      isRemote: true,
      tail: 'sudo apt install ripgrep'
    })
  })

  it('returns null for an unrelated message', () => {
    expect(parseInstallRgMessage('some other error')).toBeNull()
  })
})
