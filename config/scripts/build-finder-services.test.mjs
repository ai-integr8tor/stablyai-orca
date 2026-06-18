import { describe, expect, it } from 'vitest'

const terminalLabel = 'New Orca Terminal Here'
const workspaceLabel = 'New Orca Workspace Here'
const selectedFolder = `/Users/wolfie/Orca Projects/it's "quoted" 🐋`
const packagedCliPath = '/Applications/Orca.app/Contents/Resources/bin/orca'

async function loadBuilder() {
  try {
    return await import('./build-finder-services.mjs')
  } catch (error) {
    throw new Error(
      `Expected config/scripts/build-finder-services.mjs to export Finder Service metadata/rendering helpers: ${error.message}`
    )
  }
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

describe('Finder Service resource builder', () => {
  it('declares the selected-folder services with stable Finder menu labels', async () => {
    const { finderServices } = await loadBuilder()

    expect(finderServices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'terminal',
          menuLabel: terminalLabel,
          inputTypes: ['public.folder'],
          cliArgs: ['finder', 'terminal']
        }),
        expect.objectContaining({
          id: 'workspace',
          menuLabel: workspaceLabel,
          inputTypes: ['public.folder'],
          cliArgs: ['finder', 'workspace']
        })
      ])
    )
  })

  it('renders shell-safe CLI invocations for selected folder paths', async () => {
    const { finderServices, renderFinderServiceScript } = await loadBuilder()
    const terminalService = finderServices.find((service) => service.id === 'terminal')
    const workspaceService = finderServices.find((service) => service.id === 'workspace')

    const terminalScript = renderFinderServiceScript(terminalService, {
      orcaCliPath: packagedCliPath,
      selectedFolderPath: selectedFolder
    })
    const workspaceScript = renderFinderServiceScript(workspaceService, {
      orcaCliPath: packagedCliPath,
      selectedFolderPath: selectedFolder
    })

    expect(terminalScript).toContain(
      `${shellQuote(packagedCliPath)} finder terminal --path ${shellQuote(selectedFolder)}`
    )
    expect(workspaceScript).toContain(
      `${shellQuote(packagedCliPath)} finder workspace --path ${shellQuote(selectedFolder)}`
    )
    expect(terminalScript).not.toContain(`--path ${selectedFolder}`)
    expect(workspaceScript).not.toContain(`--path ${selectedFolder}`)
  })
})
