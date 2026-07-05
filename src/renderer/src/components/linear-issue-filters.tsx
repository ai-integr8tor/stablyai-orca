// Why: mirrors the GitHub PR toolbar's collapsed "Filters" popover + closeable
// pill model so the Linear issue toolbar stays visually congruent with the
// other task providers instead of growing bespoke inline controls.
import React, { useState } from 'react'
import { ListFilter, UserRound } from 'lucide-react'
import type { LinearTeam } from '../../../shared/types'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MultiSelectList, type PickerOption } from '@/components/task-filter-pickers'
import { TaskFilterPill } from '@/components/task-filter-pill'
import {
  FilterSectionBackButton,
  FilterSectionMenu,
  type FilterSectionRow
} from '@/components/task-filter-section-menu'
import { summarizeFilterSelection } from '@/components/task-filter-selection'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  getLinearAssigneeTriggerLabel,
  type LinearAssigneeOption
} from '@/components/linear-assignee-filter'
import type { LinearStatusOption } from '@/components/linear-status-filter'

type SectionKey = 'status' | 'team' | 'assignee' | 'label'

type LinearIssueFiltersProps = {
  // Why: status filters on workflow-state names from fetched rows (the STATUS
  // column), not the server-side presets — those stay as the toolbar radio.
  statusOptions: LinearStatusOption[]
  statusSelection: ReadonlySet<string>
  onStatusSelectionChange: (next: ReadonlySet<string>) => void
  teamOptions: LinearTeam[]
  teamSelection: ReadonlySet<string>
  onTeamSelectionChange: (next: ReadonlySet<string>) => void
  assigneeOptions: LinearAssigneeOption[]
  assigneeSelection: ReadonlySet<string>
  onAssigneeSelectionChange: (next: ReadonlySet<string>) => void
  // Why: pins the viewer at the top of the assignee picker (like GitHub's
  // @me). Matched by display name because issue rows don't carry viewer ids.
  viewerDisplayName: string | null
  labelOptions: string[]
  labelSelection: ReadonlySet<string>
  onLabelSelectionChange: (next: ReadonlySet<string>) => void
}

type StatusPickerOption = PickerOption & { color: string }
type AssigneePickerOption = PickerOption & { avatarUrl?: string }

function assigneePickerOptions(
  options: LinearAssigneeOption[],
  viewerDisplayName: string | null
): AssigneePickerOption[] {
  const isViewer = (option: LinearAssigneeOption): boolean =>
    viewerDisplayName !== null && option.displayName === viewerDisplayName
  const toPickerOption = (option: LinearAssigneeOption): AssigneePickerOption => ({
    key: option.id,
    primary: option.displayName,
    secondary: isViewer(option)
      ? translate('auto.components.linear.issue.filters.57858b245f', 'Me')
      : undefined,
    avatarUrl: option.avatarUrl
  })
  return [
    ...options.filter(isViewer).map(toPickerOption),
    ...options.filter((option) => !isViewer(option)).map(toPickerOption)
  ]
}

function getTeamFilterValueLabel(
  teamOptions: LinearTeam[],
  teamSelection: ReadonlySet<string>
): string {
  return summarizeFilterSelection(
    teamOptions.filter((team) => teamSelection.has(team.id)).map((team) => team.name),
    (count) =>
      translate('auto.components.linear.issue.filters.1304128487', '{{value0}} teams', {
        value0: count
      })
  )
}

function getLabelFilterValueLabel(labelSelection: ReadonlySet<string>): string {
  return summarizeFilterSelection([...labelSelection], (count) =>
    translate('auto.components.linear.issue.filters.7f0c79f67e', '{{value0}} labels', {
      value0: count
    })
  )
}

function getStatusFilterValueLabel(statusSelection: ReadonlySet<string>): string {
  return summarizeFilterSelection([...statusSelection], (count) =>
    translate('auto.components.linear.issue.filters.dc73d35dfb', '{{value0}} statuses', {
      value0: count
    })
  )
}

function StatusOptionRow({ option }: { option: StatusPickerOption }): React.JSX.Element {
  return (
    <>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: option.color }}
      />
      <span className="min-w-0 truncate">{option.primary}</span>
    </>
  )
}

function AssigneeOptionRow({ option }: { option: AssigneePickerOption }): React.JSX.Element {
  return (
    <>
      {option.avatarUrl ? (
        <img src={option.avatarUrl} alt="" className="size-4 shrink-0 rounded-full" />
      ) : (
        <UserRound className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 truncate">{option.primary}</span>
      {option.secondary ? (
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          {option.secondary}
        </span>
      ) : null}
    </>
  )
}

export function LinearIssueFilters({
  statusOptions,
  statusSelection,
  onStatusSelectionChange,
  teamOptions,
  teamSelection,
  onTeamSelectionChange,
  assigneeOptions,
  assigneeSelection,
  onAssigneeSelectionChange,
  viewerDisplayName,
  labelOptions,
  labelSelection,
  onLabelSelectionChange
}: LinearIssueFiltersProps): React.JSX.Element {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [openSection, setOpenSection] = useState<SectionKey | null>(null)

  const statusActive = statusSelection.size > 0
  // Why: the scope selector treats "every team selected" as the sticky-all
  // default, so only a proper subset counts as an active team filter.
  const teamActive = teamSelection.size > 0 && teamSelection.size < teamOptions.length
  const assigneeActive = assigneeSelection.size > 0
  const labelActive = labelSelection.size > 0
  const activeCount =
    (statusActive ? 1 : 0) + (teamActive ? 1 : 0) + (assigneeActive ? 1 : 0) + (labelActive ? 1 : 0)

  const statusValueLabel = statusActive ? getStatusFilterValueLabel(statusSelection) : null
  const teamValueLabel = teamActive ? getTeamFilterValueLabel(teamOptions, teamSelection) : null
  const assigneeValueLabel = assigneeActive
    ? getLinearAssigneeTriggerLabel(assigneeOptions, assigneeSelection)
    : null
  const labelValueLabel = labelActive ? getLabelFilterValueLabel(labelSelection) : null

  const sectionRows: FilterSectionRow<SectionKey>[] = [
    {
      key: 'status',
      label: translate('auto.components.linear.issue.filters.258800a4a9', 'Status'),
      value: statusValueLabel
    },
    {
      key: 'team',
      label: translate('auto.components.linear.issue.filters.773151423c', 'Team'),
      value: teamValueLabel
    },
    {
      key: 'assignee',
      label: translate('auto.components.linear.issue.filters.44cd07445c', 'Assignee'),
      value: assigneeValueLabel
    },
    {
      key: 'label',
      label: translate('auto.components.linear.issue.filters.70c5e644e0', 'Label'),
      value: labelValueLabel
    }
  ]

  const clearTeams = (): void => {
    // Why: "no team filter" means every team selected, mirroring the scope
    // selector's sticky-all default rather than an empty set.
    onTeamSelectionChange(new Set(teamOptions.map((team) => team.id)))
  }

  const clearAll = (): void => {
    onStatusSelectionChange(new Set())
    clearTeams()
    onAssigneeSelectionChange(new Set())
    onLabelSelectionChange(new Set())
    setOpenSection(null)
    setPopoverOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {statusValueLabel ? (
        <TaskFilterPill
          label={translate('auto.components.linear.issue.filters.258800a4a9', 'Status')}
          value={statusValueLabel}
          onClear={() => onStatusSelectionChange(new Set())}
        />
      ) : null}
      {teamValueLabel ? (
        <TaskFilterPill
          label={translate('auto.components.linear.issue.filters.773151423c', 'Team')}
          value={teamValueLabel}
          onClear={clearTeams}
        />
      ) : null}
      {assigneeValueLabel ? (
        <TaskFilterPill
          label={translate('auto.components.linear.issue.filters.44cd07445c', 'Assignee')}
          value={assigneeValueLabel}
          onClear={() => onAssigneeSelectionChange(new Set())}
        />
      ) : null}
      {labelValueLabel ? (
        <TaskFilterPill
          label={translate('auto.components.linear.issue.filters.70c5e644e0', 'Label')}
          value={labelValueLabel}
          onClear={() => onLabelSelectionChange(new Set())}
        />
      ) : null}
      <Popover
        open={popoverOpen}
        onOpenChange={(next) => {
          setPopoverOpen(next)
          if (!next) {
            setOpenSection(null)
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className={cn(
              'gap-1 border-border/50 bg-background/70 text-[11px]',
              activeCount > 0 && 'border-border'
            )}
          >
            <ListFilter className="size-3.5" />
            {translate('auto.components.linear.issue.filters.37f757fa33', 'Filters')}
            {activeCount > 0 ? (
              <span className="ml-0.5 rounded-full bg-muted px-1.5 text-[10px] font-medium text-foreground">
                {activeCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          {openSection === null ? (
            <FilterSectionMenu
              heading={translate(
                'auto.components.linear.issue.filters.8c1ea16bb6',
                'Filter issues'
              )}
              rows={sectionRows}
              onPick={setOpenSection}
              onClearAll={activeCount > 0 ? clearAll : null}
            />
          ) : (
            <div>
              <FilterSectionBackButton onBack={() => setOpenSection(null)} />
              {openSection === 'status' ? (
                <MultiSelectList
                  options={statusOptions.map((status) => ({
                    key: status.name,
                    primary: status.name,
                    color: status.color
                  }))}
                  selected={[...statusSelection]}
                  loading={false}
                  error={null}
                  searchPlaceholder={translate(
                    'auto.components.linear.issue.filters.e732c0e0eb',
                    'Filter statuses...'
                  )}
                  emptyText={translate(
                    'auto.components.linear.issue.filters.078dab8258',
                    'No statuses match.'
                  )}
                  renderOption={(opt) => <StatusOptionRow option={opt} />}
                  onChange={(next) => onStatusSelectionChange(new Set(next))}
                />
              ) : null}
              {openSection === 'team' ? (
                <MultiSelectList
                  options={teamOptions.map((team) => ({
                    key: team.id,
                    primary: team.name,
                    secondary: team.key
                  }))}
                  selected={[...teamSelection]}
                  loading={false}
                  error={null}
                  searchPlaceholder={translate(
                    'auto.components.linear.issue.filters.80dcc3a844',
                    'Search teams...'
                  )}
                  emptyText={translate(
                    'auto.components.linear.issue.filters.03934a1370',
                    'No teams found.'
                  )}
                  onChange={(next) => onTeamSelectionChange(new Set(next))}
                />
              ) : null}
              {openSection === 'assignee' ? (
                <MultiSelectList
                  options={assigneePickerOptions(assigneeOptions, viewerDisplayName)}
                  selected={[...assigneeSelection]}
                  loading={false}
                  error={null}
                  searchPlaceholder={translate(
                    'auto.components.linear.issue.filters.4c7efbb621',
                    'Search assignees...'
                  )}
                  emptyText={translate(
                    'auto.components.linear.issue.filters.f310257a06',
                    'No assignees found.'
                  )}
                  renderOption={(opt) => <AssigneeOptionRow option={opt} />}
                  onChange={(next) => onAssigneeSelectionChange(new Set(next))}
                />
              ) : null}
              {openSection === 'label' ? (
                <MultiSelectList
                  options={labelOptions.map((label) => ({ key: label, primary: label }))}
                  selected={[...labelSelection]}
                  loading={false}
                  error={null}
                  searchPlaceholder={translate(
                    'auto.components.linear.issue.filters.5f1366aaa2',
                    'Filter labels...'
                  )}
                  emptyText={translate(
                    'auto.components.linear.issue.filters.a0ac8ba2b5',
                    'No labels match.'
                  )}
                  onChange={(next) => onLabelSelectionChange(new Set(next))}
                />
              ) : null}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
