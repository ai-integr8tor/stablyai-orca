import { afterEach, describe, expect, it } from 'vitest'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import {
  defaultRelayWorkspaceSnapshot,
  relayPluginHostEntryPath,
  relayPluginsDir
} from './relay-plugin-config'

describe('relay plugin config', () => {
  it('resolves the plugins dir under the $HOME/.orca-relay userData equivalent', () => {
    expect(relayPluginsDir()).toBe(join(homedir(), '.orca-relay', 'plugins'))
  })

  it('returns a bounded empty default workspace snapshot', () => {
    // No live workspace root on the relay (registerRoot is a no-op), so the
    // only workspace:read surface defaults to an empty, safe snapshot.
    expect(defaultRelayWorkspaceSnapshot()).toEqual({
      workspaceName: '',
      currentBranch: null,
      isDirty: false,
      openFileCount: 0
    })
  })

  describe('relayPluginHostEntryPath', () => {
    afterEach(() => {
      delete process.env.ORCA_RELAY_PLUGIN_HOST_ENTRY
    })

    it('honors the env override verbatim (highest precedence)', () => {
      process.env.ORCA_RELAY_PLUGIN_HOST_ENTRY = '/custom/path/host-entry.js'
      expect(relayPluginHostEntryPath()).toBe('/custom/path/host-entry.js')
    })

    it('defaults to a bundle-relative plugin-host-entry.js (not the $HOME plugins dir)', () => {
      delete process.env.ORCA_RELAY_PLUGIN_HOST_ENTRY
      const resolved = relayPluginHostEntryPath()
      expect(basename(resolved)).toBe('plugin-host-entry.js')
      expect(resolved).not.toContain(join('.orca-relay', 'plugins'))
    })
  })
})
