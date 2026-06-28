import { useLocalSearchParams } from 'expo-router'
import { useHostClient } from '../../../../src/transport/client-context'
import { MobilePluginListPanel } from '../../../../src/components/plugins/MobilePluginListPanel'

// Narrow-layout full-screen plugins route. Resolves the active host client from
// the route's hostId, mirroring the standalone PR route.
export default function MobilePluginsScreen() {
  const { hostId } = useLocalSearchParams<{ hostId: string; worktreeId: string }>()
  const { client } = useHostClient(hostId)
  return <MobilePluginListPanel client={client} embedded={false} />
}
