# Hello Sidebar — example Orca plugin

A minimal reference plugin for the Orca plugin system. It contributes a
right-sidebar panel showing the current workspace/branch/dirty state and a
settings page for a custom greeting, and demonstrates the trusted Node backend
(it reads host info and can ask the host to open a link).

## Layout

```
plugin.json        # manifest (id, version, hostApiVersion, contributes, capabilities, settingsSchema)
main.js            # backend (trusted Node) — exports activate(context) / deactivate()
ui/index.html      # sidebar panel UI (single self-contained file)
ui/settings.html   # settings page UI (single self-contained file)
```

## Authoring notes

- **Manifest.** `hostApiVersion` is pre-stable `0.x`. `contributes.sidebar.icon`
  is a Lucide icon name. `ui` entries must be **single self-contained `.html`
  files** (inline your JS/CSS) — multi-file UIs are not supported yet.
- **Backend.** `main` is a Node CommonJS module exporting `activate(context)`
  and optional `deactivate()`. It runs in a dedicated child process with the
  full Node runtime — `require`, `child_process`, network, fs all work.
- **`context` API (all host-backed calls are async — they cross a process
  boundary, and an SSH hop on mobile):**
  - `context.workspace.getSnapshot()` → `{ workspaceName, currentBranch, isDirty, openFileCount }`
  - `context.workspace.onDidChange(cb)` / `context.events.on<Event>(cb)`
  - `context.commands.invokeHost('open-external-url' | 'copy-to-clipboard', params)`
  - `context.settings.get(key)` / `set(key, value)` (per-plugin, schema-validated)
  - `context.ui.postMessage(msg)` / `onMessage(cb)` — talk to your webview(s)
  - `context.subscriptions.push(disposable)` — disposed on deactivate
- **UI ↔ backend.** The UI posts/receives generic messages; see
  `src/shared/plugin/ui-bridge-client.ts` for a substrate-detecting client that
  works in both the desktop webview and the mobile `react-native-webview`.
- **Capabilities** are declared in the manifest for install-time consent. They
  are **declared intent, not a runtime jail** (see Security).

## Security / trust model

Orca plugins are **trusted code** — like any npm dependency or VS Code
extension. The backend runs with your full user privileges (files, processes,
network). Trust is established **at install**, not enforced at runtime:

- Install shows a "**runs with full access to your computer**" consent with the
  source, version, and declared capabilities (which do not limit the plugin —
  they are the author's stated intentions).
- Dependency installs run with **lifecycle scripts disabled by default**
  (`--ignore-scripts`); sources are integrity-checked (HTTPS + digest / pinned
  commit SHA).
- The UI webview is sandboxed for **fault isolation**, not privilege — privileged
  work flows through the trusted backend.

Only install plugins you trust.
