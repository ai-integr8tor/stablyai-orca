import type { SettingsSearchEntry } from './settings-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import { isWebClientLocation } from '@/lib/web-client-location'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

const getSystemTrayEntryCatalog = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate(
      'auto.components.settings.AppearancePane.keepServingOnClose.title',
      'Keep Serving on Close'
    ),
    description: translate(
      'auto.components.settings.AppearancePane.keepServingOnClose.description',
      'When enabled, closing the window keeps Orca running so remote, mobile, and SSH clients stay served, instead of quitting.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.tray.serving',
        'keep serving remote',
        { englishOnly: true }
      ),
      ...translateSearchKeyword('auto.components.settings.appearance.search.tray.tray', 'tray', {
        englishOnly: true
      }),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.tray.system',
        'system tray',
        { englishOnly: true }
      ),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.tray.minimize',
        'minimize',
        { englishOnly: true }
      ),
      ...translateSearchKeyword('auto.components.settings.appearance.search.tray.close', 'close', {
        englishOnly: true
      }),
      ...translateSearchKeyword('auto.components.settings.appearance.search.e5bc35d59e', 'window'),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.tray.notification',
        'notification area',
        { englishOnly: true }
      ),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.tray.background',
        'background',
        { englishOnly: true }
      )
    ]
  }
])

const getMacMenuBarIconEntryCatalog = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate(
      'auto.components.settings.AppearancePane.showTrayIconWhileClosed.title',
      'Show Menu Bar Icon While Closed'
    ),
    description: translate(
      'auto.components.settings.AppearancePane.showTrayIconWhileClosed.description',
      'Show a menu bar icon while the window is closed so you can reopen or quit Orca from it.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.tray.menuBar',
        'menu bar',
        { englishOnly: true }
      ),
      ...translateSearchKeyword('auto.components.settings.appearance.search.tray.tray', 'tray', {
        englishOnly: true
      }),
      ...translateSearchKeyword('auto.components.settings.appearance.search.tray.icon', 'icon', {
        englishOnly: true
      }),
      ...translateSearchKeyword('auto.components.settings.appearance.search.tray.macos', 'macos', {
        englishOnly: true
      })
    ]
  }
])

type SystemTraySearchOptions = {
  showSystemTray?: boolean
}

function shouldShowSystemTrayEntries(options: SystemTraySearchOptions): boolean {
  return (
    options.showSystemTray ??
    // Why: keepServingOnClose applies to every desktop platform; a web client has
    // no local window to keep serving.
    !isWebClientLocation()
  )
}

export function getSystemTrayEntries(options: SystemTraySearchOptions = {}): SettingsSearchEntry[] {
  if (!shouldShowSystemTrayEntries(options)) {
    return []
  }
  // Why: the menu-bar icon sub-setting is darwin-only (Windows always shows a
  // tray, Linux has none), mirroring the AppearanceInterfaceSection gate.
  return getRendererAppPlatform() === 'darwin' && !isWebClientLocation()
    ? [...getSystemTrayEntryCatalog(), ...getMacMenuBarIconEntryCatalog()]
    : getSystemTrayEntryCatalog()
}
