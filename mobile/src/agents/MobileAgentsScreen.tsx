import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Bot, ChevronLeft } from 'lucide-react-native'
import { StatusDot } from '../components/StatusDot'
import { useNow } from '../hooks/use-now'
import { colors } from '../theme/mobile-theme'
import {
  useForceReconnect,
  useHostClient,
  useLastConnectedAt,
  useReconnectAttempt
} from '../transport/client-context'
import { classifyConnection, type ConnectionVerdict } from '../transport/connection-health'
import { loadHosts } from '../transport/host-store'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'
import type { Worktree } from '../worktree/workspace-list-sections'
import {
  buildMobileAgentThreads,
  filterMobileAgentThreads,
  groupMobileAgentThreads,
  type MobileAgentGroupBy,
  type MobileAgentThread,
  type MobileAgentVisibilityFilter
} from './mobile-agent-list'
import {
  getMobileAgentsCenterState,
  MOBILE_AGENTS_POLL_INTERVAL_MS,
  MOBILE_AGENTS_WORKTREE_PS_LIMIT
} from './mobile-agents-screen-state'
import { MobileAgentThreadRow } from './MobileAgentThreadRow'
import { styles } from './mobile-agents-screen-styles'

export type MobileAgentsScreenProps = {
  hostId: string
}

const GROUP_OPTIONS: ReadonlyArray<{ label: string; value: MobileAgentGroupBy }> = [
  { label: 'Status', value: 'status' },
  { label: 'Worktree', value: 'worktree' },
  { label: 'Repo', value: 'repo' },
  { label: 'Agent', value: 'agent' }
]

function isErrorVerdict(verdict: ConnectionVerdict): boolean {
  return (
    verdict.kind === 'warning' || verdict.kind === 'unreachable' || verdict.kind === 'auth-failed'
  )
}

export function MobileAgentsScreen({ hostId }: MobileAgentsScreenProps): React.JSX.Element {
  const router = useRouter()
  const { client, state: connState } = useHostClient(hostId)
  const forceReconnect = useForceReconnect()
  const reconnectAttempts = useReconnectAttempt(hostId)
  const lastConnectedAt = useLastConnectedAt(hostId)
  const now = useNow()

  const [hostName, setHostName] = useState('Host')
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [groupBy, setGroupBy] = useState<MobileAgentGroupBy>('status')
  const [visibility, setVisibility] = useState<MobileAgentVisibilityFilter>('all')

  const clientRef = useRef<RpcClient | null>(null)
  const loadedRef = useRef(false)
  const fetchInFlightRef = useRef(false)

  useEffect(() => {
    clientRef.current = client
  }, [client])

  useEffect(() => {
    loadedRef.current = loaded
  }, [loaded])

  useEffect(() => {
    let cancelled = false
    void loadHosts()
      .then((hosts) => {
        if (cancelled) {
          return
        }
        setHostName(hosts.find((host) => host.id === hostId)?.name ?? 'Host')
      })
      .catch(() => {
        if (!cancelled) {
          setHostName('Host')
        }
      })
    return () => {
      cancelled = true
    }
  }, [hostId])

  const verdict = useMemo(
    () => classifyConnection({ state: connState, reconnectAttempts, lastConnectedAt, nowMs: now }),
    [connState, lastConnectedAt, now, reconnectAttempts]
  )

  const fetchAgents = useCallback(async () => {
    if (!client || connState !== 'connected' || fetchInFlightRef.current) {
      return
    }
    fetchInFlightRef.current = true
    const requestClient = client
    const requestHostId = hostId
    try {
      const response = await requestClient.sendRequest('worktree.ps', {
        limit: MOBILE_AGENTS_WORKTREE_PS_LIMIT
      })
      if (clientRef.current !== requestClient || hostId !== requestHostId) {
        return
      }
      if (response.ok) {
        const result = (response as RpcSuccess).result as { worktrees: Worktree[] }
        setWorktrees(result.worktrees)
        setLoaded(true)
        setError(null)
      } else {
        setError(response.error.message)
        setLoaded(true)
      }
    } catch (err) {
      if (!loadedRef.current) {
        setError(err instanceof Error ? err.message : 'Unable to load agents')
      }
    } finally {
      fetchInFlightRef.current = false
    }
  }, [client, connState, hostId])

  useFocusEffect(
    useCallback(() => {
      if (connState !== 'connected') {
        return undefined
      }
      void fetchAgents()
      const timer = setInterval(() => void fetchAgents(), MOBILE_AGENTS_POLL_INTERVAL_MS)
      return () => clearInterval(timer)
    }, [connState, fetchAgents])
  )

  const threads = useMemo(() => buildMobileAgentThreads(worktrees, now), [now, worktrees])
  const filteredThreads = useMemo(
    () => filterMobileAgentThreads(threads, { query, visibility }),
    [query, threads, visibility]
  )
  const groups = useMemo(
    () => groupMobileAgentThreads(filteredThreads, groupBy),
    [filteredThreads, groupBy]
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchAgents()
    } finally {
      setRefreshing(false)
    }
  }, [fetchAgents])

  const openThread = useCallback(
    (thread: MobileAgentThread) => {
      if (client && connState === 'connected') {
        void client
          .sendRequest('worktree.activate', { worktree: `id:${thread.worktreeId}` })
          .catch(() => null)
      }
      router.push(
        `/h/${hostId}/session/${encodeURIComponent(thread.worktreeId)}?name=${encodeURIComponent(thread.worktreeName || thread.repo)}`
      )
    },
    [client, connState, hostId, router]
  )

  const showConnecting = connState !== 'connected' && !isErrorVerdict(verdict)
  const hasActiveFilter = query.trim().length > 0 || visibility === 'attention'
  const centerState = getMobileAgentsCenterState({
    loaded,
    connectionState: connState,
    isErrorVerdict: isErrorVerdict(verdict),
    showConnecting,
    visibleGroupCount: groups.length,
    hasActiveFilter,
    error,
    verdictLabel: verdict.label
  })
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to previous screen"
        >
          <ChevronLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerIcon}>
          <Bot size={18} color={colors.textPrimary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Agents</Text>
          <View style={styles.hostLine}>
            <StatusDot state={connState} verdict={verdict} />
            <Text style={styles.subtitle} numberOfLines={1}>
              {hostName}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.controls}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Filter agents..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Filter agents"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {GROUP_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[styles.chip, groupBy === option.value && styles.chipActive]}
              onPress={() => setGroupBy(option.value)}
              accessibilityRole="button"
              accessibilityLabel={`Group agents by ${option.label}`}
              accessibilityState={{ selected: groupBy === option.value }}
            >
              <Text style={[styles.chipText, groupBy === option.value && styles.chipTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.chip, visibility === 'attention' && styles.chipActive]}
            onPress={() =>
              setVisibility((current) => (current === 'attention' ? 'all' : 'attention'))
            }
            accessibilityRole="button"
            accessibilityLabel="Show agents needing attention"
            accessibilityState={{ selected: visibility === 'attention' }}
          >
            <Text style={[styles.chipText, visibility === 'attention' && styles.chipTextActive]}>
              Needs attention
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {error && loaded && groups.length > 0 ? (
        <Text style={styles.inlineError}>{error}</Text>
      ) : null}

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textSecondary}
            colors={[colors.textSecondary]}
          />
        }
      >
        {centerState ? (
          <View style={styles.centerState}>
            {centerState.kind === 'loading' || centerState.kind === 'connecting' ? (
              <ActivityIndicator color={colors.textSecondary} />
            ) : null}
            <Text style={styles.centerText}>{centerState.message}</Text>
            {centerState.kind === 'error' && centerState.showReconnect ? (
              <Pressable style={styles.reconnectButton} onPress={() => void forceReconnect(hostId)}>
                <Text style={styles.reconnectText}>Reconnect</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.key} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              <View style={styles.groupRows}>
                {group.threads.map((thread) => (
                  <MobileAgentThreadRow
                    key={`${thread.worktreeId}:${thread.agent.paneKey}`}
                    thread={thread}
                    now={now}
                    onPress={() => openThread(thread)}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
