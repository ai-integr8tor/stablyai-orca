import type { GlobalSettings, Repo } from '../../../../shared/types'
import { resolveWorktreeLocationMode } from '../../../../shared/worktree-location-mode'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { BaseRefPicker } from './BaseRefPicker'
import { RepoSettingsDraftInput } from './RepositorySettingsDraftInput'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSegmentedControl, SettingsSwitchRow } from './SettingsFormControls'
import { translate } from '@/i18n/i18n'

type WorktreeLocationControlValue = 'global' | 'sibling' | 'nested'

type RepositoryWorktreeDefaultsUpdate = Pick<
  Repo,
  'worktreeBasePath' | 'worktreeBaseRef' | 'worktreeLocationMode'
>

type RepositoryWorktreeDefaultsSectionProps = {
  repo: Repo
  settings: Pick<GlobalSettings, 'workspaceDir' | 'defaultWorktreeLocationMode'> | null
  updateRepo: (repoId: string, updates: Partial<RepositoryWorktreeDefaultsUpdate>) => void
  forceVisible: boolean
}

export function RepositoryWorktreeDefaultsSection({
  repo,
  settings,
  updateRepo,
  forceVisible
}: RepositoryWorktreeDefaultsSectionProps): React.JSX.Element {
  const globalWorktreeLocationMode = settings?.defaultWorktreeLocationMode ?? 'sibling'
  const effectiveWorktreeLocationMode = resolveWorktreeLocationMode(repo, {
    defaultWorktreeLocationMode: globalWorktreeLocationMode
  })
  const worktreeLocationControlValue: WorktreeLocationControlValue =
    repo.worktreeLocationMode ?? 'global'
  const nestedWorktrees = effectiveWorktreeLocationMode === 'nested'
  const followsGlobalWorktreeLocation = repo.worktreeLocationMode === undefined
  const worktreeLocationModeSummary = followsGlobalWorktreeLocation
    ? globalWorktreeLocationMode === 'nested'
      ? translate(
          'auto.components.settings.RepositoryPane.worktreeLocationFollowingGlobalNested',
          'Following global default (nested)'
        )
      : translate(
          'auto.components.settings.RepositoryPane.worktreeLocationFollowingGlobalSibling',
          'Following global default (sibling)'
        )
    : repo.worktreeLocationMode === 'nested'
      ? translate(
          'auto.components.settings.RepositoryPane.worktreeLocationExplicitNested',
          'Project override (nested)'
        )
      : translate(
          'auto.components.settings.RepositoryPane.worktreeLocationExplicitSibling',
          'Project override (sibling)'
        )

  return (
    <>
      <SearchableSetting
        title={translate(
          'auto.components.settings.RepositoryPane.f88db4fece',
          'Default Worktree Base'
        )}
        description={translate(
          'auto.components.settings.RepositoryPane.8984d06520',
          'Default base branch or ref when creating worktrees.'
        )}
        keywords={[repo.displayName, 'base ref', 'branch']}
        className="space-y-3"
        forceVisible={forceVisible}
      >
        <Label className="text-sm font-semibold">
          {translate('auto.components.settings.RepositoryPane.f88db4fece', 'Default Worktree Base')}
        </Label>
        <BaseRefPicker
          repoId={repo.id}
          currentBaseRef={repo.worktreeBaseRef}
          onSelect={(ref) => updateRepo(repo.id, { worktreeBaseRef: ref })}
          onUsePrimary={() => updateRepo(repo.id, { worktreeBaseRef: undefined })}
        />
      </SearchableSetting>

      <SearchableSetting
        title={translate('auto.components.settings.RepositoryPane.e9bd57a336', 'Worktree Location')}
        description={translate(
          'auto.components.settings.RepositoryPane.e63bb96a9b',
          'Project-specific directory for new worktrees.'
        )}
        keywords={[
          repo.displayName,
          'worktree path',
          'workspace path',
          'directory',
          'relative',
          '../worktrees',
          'global default',
          'follow global'
        ]}
        className="space-y-2"
        forceVisible={forceVisible}
      >
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm font-semibold">
            {translate('auto.components.settings.RepositoryPane.e9bd57a336', 'Worktree Location')}
          </Label>
          {repo.worktreeBasePath ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => updateRepo(repo.id, { worktreeBasePath: undefined })}
            >
              {translate('auto.components.settings.RepositoryPane.8ccacbeb5a', 'Use Global')}
            </Button>
          ) : null}
        </div>
        <RepoSettingsDraftInput
          repoId={repo.id}
          storeValue={repo.worktreeBasePath ?? ''}
          placeholder={
            nestedWorktrees
              ? translate(
                  'auto.components.settings.RepositoryPane.nestedWorktreesPlaceholder',
                  '.worktrees'
                )
              : (settings?.workspaceDir ?? '')
          }
          disabled={nestedWorktrees}
          onTextChange={() => {}}
          onBlur={(e) => {
            const worktreeBasePath = e.currentTarget.value.trim() || undefined
            // Why: even an unchanged worktreeBasePath update asks main to
            // prepare the root, which can touch the filesystem.
            if (worktreeBasePath === (repo.worktreeBasePath?.trim() || undefined)) {
              return
            }
            updateRepo(repo.id, { worktreeBasePath })
          }}
          className="h-9 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.RepositoryPane.15a99d9b9f',
            'Relative paths resolve from this project root.'
          )}
        </p>
        <SettingsSwitchRow
          label={translate(
            'auto.components.settings.RepositoryPane.nestedWorktreesLabel',
            'Store worktrees inside this project'
          )}
          description={translate(
            'auto.components.settings.RepositoryPane.nestedWorktreesDescription',
            'Create new worktrees in .worktrees inside the project root and keep that folder ignored.'
          )}
          checked={nestedWorktrees}
          onChange={() =>
            updateRepo(repo.id, {
              worktreeLocationMode: nestedWorktrees ? 'sibling' : 'nested'
            })
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SettingsSegmentedControl
            value={worktreeLocationControlValue}
            ariaLabel={translate(
              'auto.components.settings.RepositoryPane.worktreeLocationModeScope',
              'Worktree location mode'
            )}
            size="sm"
            options={[
              {
                value: 'global',
                label: translate('auto.components.settings.RepositoryPane.useGlobal', 'Global')
              },
              {
                value: 'sibling',
                label: translate('auto.components.settings.RepositoryPane.siblingMode', 'Sibling')
              },
              {
                value: 'nested',
                label: translate('auto.components.settings.RepositoryPane.nestedMode', 'Nested')
              }
            ]}
            onChange={(value) =>
              updateRepo(repo.id, {
                worktreeLocationMode: value === 'global' ? undefined : value
              })
            }
          />
          <span className="text-xs text-muted-foreground">{worktreeLocationModeSummary}</span>
        </div>
        {nestedWorktrees ? (
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.RepositoryPane.nestedWorktreesPath',
              'New worktrees will be created under .worktrees in this project.'
            )}
          </p>
        ) : null}
      </SearchableSetting>
    </>
  )
}
