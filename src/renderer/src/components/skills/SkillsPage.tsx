import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, Loader2, RefreshCw, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { useMountedRef } from '@/hooks/useMountedRef'
import type { DiscoveredSkill, SkillDiscoveryResult } from '../../../../shared/skills'
import { countSkillsBySource, filterSkills, type SkillsFilterState } from './skills-filter'
import { translate } from '@/i18n/i18n'
import { SkillsFilterBar } from './SkillsFilterBar'
import { SkillsGalleryGrid } from './SkillsGalleryGrid'

const EMPTY_SKILLS: DiscoveredSkill[] = []

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

function EmptyState({
  loading,
  hasSkills,
  onRefresh
}: {
  loading: boolean
  hasSkills: boolean
  onRefresh: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        {loading ? (
          <Loader2 className="size-7 animate-spin text-muted-foreground" />
        ) : (
          <BookOpen className="size-7 text-muted-foreground" />
        )}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            {loading
              ? translate('auto.components.skills.SkillsPage.cd7893fbc1', 'Scanning skills')
              : hasSkills
                ? translate('auto.components.skills.SkillsPage.6a62a0168c', 'No matches')
                : translate(
                    'auto.components.skills.SkillsPage.4acd6d68ec',
                    'No local skills found'
                  )}
          </h3>
          <p className="text-xs leading-5 text-muted-foreground">
            {hasSkills
              ? translate(
                  'auto.components.skills.SkillsPage.08a321a984',
                  'Adjust the search or filters.'
                )
              : translate(
                  'auto.components.skills.SkillsPage.ab5b777350',
                  'Checked local home, repository, bundled, and plugin skill folders.'
                )}
          </p>
        </div>
        {!loading ? (
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="size-4" />
            {translate('auto.components.skills.SkillsPage.cb142070b4', 'Refresh')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export default function SkillsPage(): React.JSX.Element {
  const closeSkillsPage = useAppStore((s) => s.closeSkillsPage)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const [result, setResult] = useState<SkillDiscoveryResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<SkillsFilterState>({
    query: '',
    sourceKind: 'all',
    provider: 'all'
  })
  const mountedRef = useMountedRef()

  const loadSkills = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const nextResult = await window.api.skills.discover()
      if (mountedRef.current) {
        setResult(nextResult)
      }
    } catch (error) {
      console.error('Failed to discover skills:', error)
      if (mountedRef.current) {
        toast.error(
          translate('auto.components.skills.SkillsPage.ea72d6185b', 'Could not scan local skills')
        )
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [mountedRef])

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  const openSkillManagement = useCallback((): void => {
    // Why: Settings already owns install/update terminals; the gallery stays read-only.
    openSettingsTarget({ pane: 'general', repoId: null, sectionId: 'cli' })
    openSettingsPage()
  }, [openSettingsPage, openSettingsTarget])

  useEffect(() => {
    const hasVisibleOverlay = (): boolean =>
      Array.from(
        document.querySelectorAll('[role="dialog"], [role="listbox"], [role="menu"]')
      ).some((element) => {
        if (!(element instanceof HTMLElement)) {
          return false
        }
        if (element.closest('[aria-hidden="true"]')) {
          return false
        }
        const style = window.getComputedStyle(element)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          element.getClientRects().length > 0
        )
      })

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }
      // Why: menus and dialogs own Escape before page-level navigation.
      if (hasVisibleOverlay()) {
        return
      }
      const target = event.target as HTMLElement | null
      if (
        target?.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
      ) {
        return
      }
      event.preventDefault()
      closeSkillsPage()
    }

    // Why: tooltips can consume Escape before bubble listeners see it. Capture
    // keeps page-level back navigation reliable when no overlay is active.
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [closeSkillsPage])

  const skills = result?.skills ?? EMPTY_SKILLS
  const visibleSkills = useMemo(() => filterSkills(skills, filters), [filters, skills])
  const sourceCounts = useMemo(() => countSkillsBySource(skills), [skills])
  const activeSourceCount = result?.sources.filter((source) => source.exists).length ?? 0

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <Button variant="outline" size="sm" onClick={closeSkillsPage} className="shrink-0 gap-1.5">
          <ArrowLeft className="size-3.5" />
          {translate('auto.components.skills.SkillsPage.7e828fb2c6', 'Back')}
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <BookOpen className="size-4 text-muted-foreground" />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-sm font-semibold">
                {translate('auto.components.skills.SkillsPage.f43ad6edf3', 'Skills')}
              </h1>
              <Badge variant="secondary">
                {translate('auto.components.skills.SkillsPage.b088e0785d', 'Beta')}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {pluralize(skills.length, 'skill')}{' '}
              {translate('auto.components.skills.SkillsPage.e46e162e2e', 'from')}{' '}
              {pluralize(activeSourceCount, 'source')}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={openSkillManagement} className="shrink-0">
          <Settings className="size-3.5" />
          {translate('auto.components.skills.SkillsPage.0f54d1b7f8', 'Manage')}
        </Button>
      </header>

      <SkillsFilterBar
        filters={filters}
        sourceCounts={sourceCounts}
        loading={loading}
        onFiltersChange={setFilters}
        onRefresh={() => void loadSkills()}
      />

      <section className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {visibleSkills.length > 0 ? (
          <SkillsGalleryGrid skills={visibleSkills} />
        ) : (
          <EmptyState
            loading={loading}
            hasSkills={skills.length > 0}
            onRefresh={() => void loadSkills()}
          />
        )}
      </section>
    </main>
  )
}
