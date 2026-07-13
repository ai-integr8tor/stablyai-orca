import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import type { SettingsSearchEntry } from './settings-search'

export const getPluginsPaneSearchEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate('auto.components.settings.plugins.search.title', 'Plugins'),
    description: translate(
      'auto.components.settings.plugins.search.description',
      'Install and manage experimental Orca plugins.'
    ),
    keywords: [
      translate('auto.components.settings.plugins.search.install', 'install plugin'),
      translate('auto.components.settings.plugins.search.permissions', 'plugin permissions'),
      translate('auto.components.settings.plugins.search.logs', 'plugin logs'),
      translate('auto.components.settings.plugins.search.development', 'development plugins')
    ]
  }
])
