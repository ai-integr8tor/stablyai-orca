// Hello Sidebar — example Orca plugin backend (trusted Node, runs in the
// per-plugin host child process). Demonstrates the async `context` API and the
// trusted runtime (free Node access — this reads host info; a real plugin could
// spawn a CLI / read files). The UI bundle (ui/index.html) renders the state
// this backend posts and can ask the host to open links.

const os = require('node:os')

/** @param {import('../../src/shared/plugin/api-contract').PluginContext} context */
async function activate(context) {
  const snapshot = await context.workspace.getSnapshot()
  const greeting = (await context.settings.get('greeting')) || 'Hello'

  // Handle messages from the plugin's UI webview.
  context.ui.onMessage(async (message) => {
    if (message && message.type === 'open' && typeof message.url === 'string') {
      // Allowlisted host command; the host validates the scheme (http/https).
      await context.commands.invokeHost('open-external-url', { url: message.url })
    }
    if (message && message.type === 'set-greeting' && typeof message.value === 'string') {
      await context.settings.set('greeting', message.value)
    }
  })

  // Re-render the UI whenever the workspace changes.
  const push = async () => {
    const current = await context.workspace.getSnapshot()
    context.ui.postMessage({
      type: 'state',
      greeting: (await context.settings.get('greeting')) || 'Hello',
      workspace: current.workspaceName,
      branch: current.currentBranch,
      dirty: current.isDirty,
      openFiles: current.openFileCount,
      host: os.hostname()
    })
  }
  context.subscriptions.push(context.workspace.onDidChange(() => void push()))

  await push()
  void snapshot
  void greeting
}

function deactivate() {}

module.exports = { activate, deactivate }
