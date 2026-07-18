import { AppUpdateBanner } from '../components/AppUpdateBanner'
import { useHomeUpdateCheck } from './use-home-update-check'

export function HomeUpdateSurface() {
  // Why: Home focus owns update polling; the banner subscribes separately so
  // index.tsx does not need update-specific state.
  useHomeUpdateCheck()

  return <AppUpdateBanner />
}
