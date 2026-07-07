import { useRef, useState } from 'react'
import type React from 'react'

import type { GlobalSettings } from '../../../../shared/types'
import { parseTheme } from '../../../../shared/custom-ui-themes'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Input } from '../ui/input'
import { Trash2 } from 'lucide-react'
import { UIZoomControl } from './UIZoomControl'
import { SearchableSetting } from './SearchableSetting'
import { AppearanceAdvancedDisclosure } from './AppearanceAdvancedDisclosure'
import { useAppStore } from '../../store'
import { useShortcutKeyComboDetails } from '@/hooks/useShortcutLabel'
import { ShortcutHintList } from './AppearanceShortcutHintList'
import {
  FontAutocomplete,
  SettingsRow,
  SettingsSegmentedControl,
  SettingsSwitchRow
} from './SettingsFormControls'
import { DEFAULT_APP_FONT_FAMILY } from '../../../../shared/constants'
import {
  getLanguageEntries,
  getSystemTrayEntries,
  getThemeEntries,
  getTitlebarEntries,
  getTypographyEntries,
  getZoomEntries
} from './appearance-search'
import {
  getUiLanguageChoiceLabel,
  SHOW_UI_LANGUAGE_SETTING,
  UI_LANGUAGE_CHOICES
} from '@/i18n/supported-languages'
import { translate } from '@/i18n/i18n'
import type { UiLanguage } from '../../../../shared/ui-language'
import { matchesSettingsSearch, normalizeSettingsSearchQuery } from './settings-search'

type AppearanceInterfaceSectionProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  applyTheme: (theme: 'system' | 'dark' | 'light') => void
  fontSuggestions: string[]
  isDesktopWindows: boolean
  forceVisiblePrimary?: boolean
}

export function AppearanceInterfaceSection({
  settings,
  updateSettings,
  applyTheme,
  fontSuggestions,
  isDesktopWindows,
  forceVisiblePrimary = false
}: AppearanceInterfaceSectionProps): React.JSX.Element {
  const nameRef = useRef<HTMLInputElement>(null)
  const cssRef = useRef<HTMLTextAreaElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const searchQuery = useAppStore((state) => state.settingsSearchQuery)
  const isSearching = normalizeSettingsSearchQuery(searchQuery).length > 0
  const zoomInKeyCombos = useShortcutKeyComboDetails('zoom.in')
  const zoomOutKeyCombos = useShortcutKeyComboDetails('zoom.out')
  const languageEntry = getLanguageEntries()[0]
  const systemTrayEntry = getSystemTrayEntries({ showSystemTray: true })[0]
  const themeEntry = getThemeEntries()[0]
  const themeLabel = translate('auto.components.settings.AppearancePane.932ff1fbff', 'Theme')
  const titlebarEntry = getTitlebarEntries()[0]
  const typographyEntry = getTypographyEntries()[0]
  const zoomEntry = getZoomEntries()[0]
  const advancedEntries = [
    ...(SHOW_UI_LANGUAGE_SETTING ? getLanguageEntries() : []),
    ...getTitlebarEntries(),
    ...getSystemTrayEntries({ showSystemTray: isDesktopWindows })
  ]
  const showAdvanced = !isSearching || matchesSettingsSearch(searchQuery, advancedEntries)

  return (
    <div className="divide-y divide-border/40">
      <SearchableSetting
        title={themeLabel}
        description={themeEntry?.description}
        keywords={themeEntry?.keywords ?? ['dark', 'light', 'system']}
        forceVisible={forceVisiblePrimary}
      >
        <SettingsRow
          label={themeLabel}
          control={
            <SettingsSegmentedControl
              ariaLabel={themeLabel}
              value={settings.theme}
              onChange={(option) => {
                updateSettings({ theme: option })
                applyTheme(option)
              }}
              options={[
                {
                  value: 'system',
                  label: translate('auto.components.settings.AppearancePane.fb0e0b4453', 'System')
                },
                {
                  value: 'dark',
                  label: translate('auto.components.settings.AppearancePane.7d26ccabe8', 'Dark')
                },
                {
                  value: 'light',
                  label: translate('auto.components.settings.AppearancePane.fd89b5487c', 'Light')
                }
              ]}
            />
          }
        />
      </SearchableSetting>

      <SearchableSetting
        title={translate('settings.appearance.customUiTheme.title', 'Custom UI Theme')}
        description={translate(
          'settings.appearance.customUiTheme.description',
          'Customize the shell theme beyond light/dark presets'
        )}
        keywords={['custom', 'theme', 'color', 'tweakcn', 'shadcn', 'import']}
        forceVisible={forceVisiblePrimary}
      >
        <div className="space-y-3 py-2">
          {/* Active Theme Selector */}
          <SettingsRow
            label={translate('settings.appearance.customUiTheme.activeLabel', 'Active Theme')}
            control={
              <Select
                value={settings.activeUiTheme || 'default'}
                onValueChange={(val) => updateSettings({ activeUiTheme: val })}
              >
                <SelectTrigger size="sm" className="min-w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  {(settings.customUiThemes || []).map((t) => (
                    <SelectItem key={t.id} value={t.id} className="relative pr-12">
                      <span>{t.name}</span>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          const remaining = (settings.customUiThemes || []).filter(
                            (theme) => theme.id !== t.id
                          )
                          const activeIsDeleted = settings.activeUiTheme === t.id
                          updateSettings({
                            activeUiTheme: activeIsDeleted ? 'default' : settings.activeUiTheme,
                            customUiThemes: remaining
                          })
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive p-0.5 rounded-sm hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                        title="Delete theme"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />

          {/* Import New Theme Form */}
          <div className="mt-3 border-t border-border/40 pt-3 space-y-2">
            <h4 className="text-xs font-semibold">Import Theme</h4>
            <div className="flex gap-2">
              <Input
                ref={nameRef}
                type="text"
                placeholder="Theme Name (e.g. Claude)"
                className="flex-1 h-8 text-xs bg-transparent dark:bg-input/30"
              />
              <button
                type="button"
                onClick={() => {
                  const name = nameRef.current?.value?.trim() || 'Custom Theme'
                  const content = cssRef.current?.value?.trim() || ''

                  if (!content) {
                    return
                  }

                  setImportError(null)
                  const importedThemes = parseTheme(name, content)

                  if (importedThemes.length === 0) {
                    setImportError(
                      'Could not parse any variables. Make sure it has :root or .dark blocks, or matches Shadcn theme JSON.'
                    )
                    return
                  }

                  const prevThemes = settings.customUiThemes || []
                  const filtered = prevThemes.filter(
                    (pt) => !importedThemes.some((it) => it.id === pt.id)
                  )
                  const nextThemes = [...filtered, ...importedThemes]

                  const isCurrentlyDark =
                    settings.theme === 'dark' ||
                    (settings.theme === 'system' &&
                      window.matchMedia('(prefers-color-scheme: dark)').matches)
                  const matchingFlavor = importedThemes.find((t) =>
                    isCurrentlyDark ? t.mode === 'dark' : t.mode === 'light'
                  )
                  const toSelect = matchingFlavor || importedThemes[0]

                  updateSettings({
                    customUiThemes: nextThemes,
                    activeUiTheme: toSelect.id
                  })

                  if (nameRef.current) {
                    nameRef.current.value = ''
                  }
                  if (cssRef.current) {
                    cssRef.current.value = ''
                  }
                }}
                className="bg-primary text-primary-foreground px-3 py-1 rounded text-xs font-medium h-8 cursor-pointer"
              >
                Import
              </button>
            </div>
            {importError ? <p className="text-xs text-destructive">{importError}</p> : null}
            <textarea
              ref={cssRef}
              placeholder="Paste CSS theme code (Tweakcn output) or Shadcn theme JSON..."
              className="w-full min-w-0 appearance-none rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm transition-[color,box-shadow] outline-hidden placeholder:text-muted-foreground/60 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 h-16 font-mono resize-none"
              onChange={() => setImportError(null)}
            />
          </div>
        </div>
      </SearchableSetting>

      <SearchableSetting
        title={translate('auto.components.settings.AppearancePane.5e6d7aba8d', 'UI Zoom')}
        description={zoomEntry?.description}
        keywords={zoomEntry?.keywords ?? ['zoom', 'scale', 'shortcut']}
        forceVisible={forceVisiblePrimary}
      >
        <SettingsRow
          label={translate('auto.components.settings.AppearancePane.5e6d7aba8d', 'UI Zoom')}
          // Why: keep only the shortcut hint — the control itself makes "scale the
          // interface" obvious, but the keyboard gesture and its terminal-pane
          // exception are not discoverable from the buttons alone.
          description={
            <>
              <ShortcutHintList combos={zoomInKeyCombos} /> /{' '}
              <ShortcutHintList combos={zoomOutKeyCombos} />{' '}
              {translate(
                'auto.components.settings.AppearancePane.ef89200c1f',
                'when not in a terminal pane.'
              )}
            </>
          }
          control={<UIZoomControl />}
        />
      </SearchableSetting>

      <SearchableSetting
        title={translate('auto.components.settings.AppearancePane.102d6b5f9b', 'IDE Font')}
        description={typographyEntry?.description}
        keywords={typographyEntry?.keywords ?? ['font', 'typeface', 'typography']}
        forceVisible={forceVisiblePrimary}
      >
        <SettingsRow
          label={translate('auto.components.settings.AppearancePane.102d6b5f9b', 'IDE Font')}
          control={
            <FontAutocomplete
              value={settings.appFontFamily}
              suggestions={fontSuggestions}
              placeholder={DEFAULT_APP_FONT_FAMILY}
              onChange={(value) =>
                updateSettings({ appFontFamily: value.trim() || DEFAULT_APP_FONT_FAMILY })
              }
            />
          }
        />
      </SearchableSetting>

      {showAdvanced ? (
        <AppearanceAdvancedDisclosure showTopBorder={false}>
          <div className="divide-y divide-border/40">
            {SHOW_UI_LANGUAGE_SETTING ? (
              <SearchableSetting
                title={translate('settings.appearance.language.title', 'Language')}
                description={languageEntry?.description}
                keywords={languageEntry?.keywords ?? []}
              >
                <SettingsRow
                  label={translate('settings.appearance.language.title', 'Language')}
                  control={
                    <Select
                      value={settings.uiLanguage}
                      onValueChange={(value) => updateSettings({ uiLanguage: value as UiLanguage })}
                    >
                      <SelectTrigger
                        size="sm"
                        className="min-w-[220px]"
                        aria-label={translate('settings.appearance.language.title', 'Language')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UI_LANGUAGE_CHOICES.map((choice) => (
                          <SelectItem key={choice.value} value={choice.value}>
                            {getUiLanguageChoiceLabel(choice, translate)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
              </SearchableSetting>
            ) : null}

            <SearchableSetting
              title={translate(
                'auto.components.settings.AppearancePane.9868f39007',
                'Titlebar App Name'
              )}
              description={titlebarEntry?.description}
              keywords={titlebarEntry?.keywords ?? ['titlebar', 'orca', 'app', 'name']}
            >
              <SettingsSwitchRow
                label={translate(
                  'auto.components.settings.AppearancePane.9868f39007',
                  'Titlebar App Name'
                )}
                checked={settings.showTitlebarAppName}
                onChange={() =>
                  updateSettings({ showTitlebarAppName: !settings.showTitlebarAppName })
                }
              />
            </SearchableSetting>

            {isDesktopWindows ? (
              <SearchableSetting
                title={translate(
                  'auto.components.settings.AppearancePane.2edf606c46',
                  'Minimize to Tray on Close'
                )}
                description={systemTrayEntry?.description}
                keywords={systemTrayEntry?.keywords ?? ['tray', 'minimize', 'close']}
              >
                <SettingsSwitchRow
                  label={translate(
                    'auto.components.settings.AppearancePane.2edf606c46',
                    'Minimize to Tray on Close'
                  )}
                  // Why: platform constraint + "close keeps Orca running" consequence are
                  // both non-obvious from the label alone.
                  description={translate(
                    'auto.components.settings.AppearancePane.b707773a0d',
                    'When enabled, closing the window keeps Orca running in the system tray instead of quitting.'
                  )}
                  checked={settings.minimizeToTrayOnClose === true}
                  onChange={() =>
                    updateSettings({ minimizeToTrayOnClose: !settings.minimizeToTrayOnClose })
                  }
                />
              </SearchableSetting>
            ) : null}
          </div>
        </AppearanceAdvancedDisclosure>
      ) : null}
    </div>
  )
}
