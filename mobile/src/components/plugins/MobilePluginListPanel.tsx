import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ChevronLeft, Plug } from 'lucide-react-native'
import type { RpcClient } from '../../transport/rpc-client'
import { colors, radii, spacing, typography } from '../../theme/mobile-theme'
import { MobilePluginPanel } from './MobilePluginPanel'
import { parsePluginListResult, type MobilePluginRow } from './mobile-plugin-list'

// NEEDS-RUNTIME-VERIFY: follows MobilePrViewPanel's embedded-panel contract; the
// JSX/navigation wiring can't run here (Expo deps absent), only the pure parser is tested.

type Props = { client: RpcClient | null; embedded?: boolean; onRequestClose?: () => void }

export function MobilePluginListPanel({
  client,
  embedded = false,
  onRequestClose
}: Props): React.JSX.Element {
  const [rows, setRows] = useState<MobilePluginRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  // Track the in-flight request so a late response from a replaced client (or
  // after unmount) can't overwrite fresh state. Mirrors MobilePluginPanel.
  const requestSeq = useRef(0)

  const load = useCallback(() => {
    if (!client) {
      return
    }
    const seq = ++requestSeq.current
    setRows(null)
    setFailed(false)
    client
      .sendRequest('plugin.list')
      .then((response) => {
        if (seq === requestSeq.current) {
          setRows(parsePluginListResult(response))
        }
      })
      .catch(() => {
        if (seq === requestSeq.current) {
          setFailed(true)
        }
      })
  }, [client])

  useEffect(() => {
    load()
    return () => {
      // Invalidate any in-flight request on client change / unmount.
      requestSeq.current++
    }
  }, [load])

  // A selected plugin takes over the panel; back returns to the list.
  if (selected && client) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            style={styles.headerButton}
            onPress={() => setSelected(null)}
            hitSlop={8}
            accessibilityLabel="Back to plugins"
          >
            <ChevronLeft size={20} color={colors.textSecondary} strokeWidth={2.1} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {selected}
          </Text>
        </View>
        <MobilePluginPanel client={client} pluginId={selected} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Plugins</Text>
        {embedded && onRequestClose ? (
          <Pressable
            style={styles.headerButton}
            onPress={onRequestClose}
            hitSlop={8}
            accessibilityLabel="Close plugins"
          >
            <ChevronLeft size={20} color={colors.textSecondary} strokeWidth={2.1} />
          </Pressable>
        ) : null}
      </View>
      {renderBody(rows, failed, (id) => setSelected(id), load)}
    </View>
  )
}

function renderBody(
  rows: MobilePluginRow[] | null,
  failed: boolean,
  onSelect: (id: string) => void,
  onRetry: () => void
): React.JSX.Element {
  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.stateText}>Couldn’t load plugins.</Text>
        <Pressable style={styles.retryButton} onPress={onRetry} hitSlop={8}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    )
  }
  if (rows === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }
  if (rows.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.stateText}>No plugins installed.</Text>
      </View>
    )
  }
  return (
    <ScrollView contentContainerStyle={styles.list}>
      {rows.map((row) => (
        <Pressable
          key={row.id}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onSelect(row.id)}
          accessibilityLabel={`Open ${row.title}`}
        >
          <Plug size={16} color={colors.textSecondary} strokeWidth={2.1} />
          <Text style={styles.rowTitle} numberOfLines={1}>
            {row.title}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPanel },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle
  },
  headerTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.titleSize,
    fontWeight: '600'
  },
  headerButton: { padding: spacing.xs },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md
  },
  stateText: { color: colors.textSecondary, fontSize: typography.bodySize },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.button,
    backgroundColor: colors.bgRaised
  },
  retryText: { color: colors.textPrimary, fontSize: typography.bodySize },
  list: { padding: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.row
  },
  rowPressed: { backgroundColor: colors.bgRaised },
  rowTitle: { flex: 1, color: colors.textPrimary, fontSize: typography.bodySize }
})
