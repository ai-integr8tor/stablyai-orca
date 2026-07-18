import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native'
import { Download, X } from 'lucide-react-native'

import { colors, spacing, radii, typography } from '../theme/mobile-theme'
import { useAppUpdateStore } from '../app-update/app-update-store'

// Inline "new version available" banner shown on the Home screen.
//
// Why accentBlue (not statusRed): this is informational, not an error — mirrors
// the visual language of AuthFailedBanner but recolored so users can tell an
// update nudge apart from an auth/connection problem at a glance.
//
// Update handoff: when a platform-specific URL exists, open it via the system.
// Android uses the GitHub Releases APK URL, which the browser downloads and the
// system installer then prompts to install. TestFlight manifests may omit a URL
// until a real invite link exists, so the banner can show without a CTA.

export function AppUpdateBanner() {
  const status = useAppUpdateStore((s) => s.status)
  const latestVersion = useAppUpdateStore((s) => s.latestVersion)
  const latestBuildNumber = useAppUpdateStore((s) => s.latestBuildNumber)
  const releaseNotes = useAppUpdateStore((s) => s.releaseNotes)
  const updateUrl = useAppUpdateStore((s) => s.updateUrl)
  const dismiss = useAppUpdateStore((s) => s.dismiss)

  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status !== 'available' || !latestVersion) {
    return null
  }
  const versionLabel = latestBuildNumber ? `${latestVersion} (${latestBuildNumber})` : latestVersion

  async function handleUpdate() {
    if (!updateUrl) {
      return
    }
    setError(null)
    setOpening(true)
    try {
      await Linking.openURL(updateUrl)
    } catch {
      setError('Could not open the update. Try again later.')
    } finally {
      setOpening(false)
    }
  }

  return (
    <View style={styles.banner}>
      <View style={styles.headerRow}>
        <Download size={15} color={colors.accentBlue} />
        <Text style={styles.title}>Orca {versionLabel} is available</Text>
        {!opening ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss update notification"
            hitSlop={8}
            style={styles.closeButton}
            onPress={() => void dismiss()}
          >
            <X size={15} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {releaseNotes ? (
        <Text style={styles.notes} numberOfLines={2}>
          {releaseNotes}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        {updateUrl ? (
          <Pressable
            style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
            disabled={opening}
            onPress={() => void handleUpdate()}
          >
            <Text style={styles.primaryActionText}>{opening ? 'Opening...' : 'Update'}</Text>
          </Pressable>
        ) : null}
        {!opening ? (
          <Pressable style={styles.secondaryAction} onPress={() => void dismiss()}>
            <Text style={styles.secondaryActionText}>Later</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.bgPanel,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  title: {
    flex: 1,
    color: colors.accentBlue,
    fontSize: typography.bodySize,
    fontWeight: '600'
  },
  closeButton: {
    padding: spacing.xs
  },
  notes: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    lineHeight: 16,
    marginTop: spacing.xs,
    marginLeft: spacing.sm + 15 + spacing.sm
  },
  error: {
    color: colors.statusRed,
    fontSize: typography.metaSize,
    marginTop: spacing.xs
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
    marginLeft: spacing.sm + 15 + spacing.sm
  },
  primaryAction: {
    backgroundColor: colors.accentBlue,
    paddingVertical: spacing.xs + 1,
    paddingHorizontal: spacing.md,
    borderRadius: radii.button,
    alignItems: 'center'
  },
  primaryActionText: {
    color: colors.bgBase,
    fontSize: typography.metaSize,
    fontWeight: '700'
  },
  secondaryAction: {
    paddingVertical: spacing.xs + 1,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryActionText: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontWeight: '600'
  },
  pressed: {
    opacity: 0.7
  }
})
