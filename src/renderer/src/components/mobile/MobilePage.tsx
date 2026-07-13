import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '@/store'
import type { PairedDevice, Platform, StepIndex } from './MobileHero'
import { getInstallCopy, type IosChannel } from './mobile-platform-copy'
import { useMobilePairingDevicePolling } from '../settings/mobile-pairing-device-polling'
import {
  shouldShowPairedAfterDeviceRefresh,
  type MobilePageStage as FlowStage
} from './mobile-page-stage'
import { translate } from '@/i18n/i18n'
import { useMobilePageEscape } from './use-mobile-page-escape'
import { MobilePageContent } from './MobilePageContent'
import { useMobileInstallQr } from './use-mobile-install-qr'
import type { MobilePairingConnectionMode } from '../../../../shared/mobile-pairing-connection-mode'
import { useMobileInstallActions } from './use-mobile-install-actions'
import { useMobileAdvertiseAddresses } from './use-mobile-advertise-addresses'

export default function MobilePage(): React.JSX.Element {
  const [stage, setStage] = useState<FlowStage | null>(null)
  const [stepIdx, setStepIdx] = useState<StepIndex>(0)

  const [platform, setPlatform] = useState<Platform>('ios')
  // Default iOS users to the preview track — it ships daily, so newcomers land
  // on the freshest build unless they deliberately pick the public release.
  const [iosChannel, setIosChannel] = useState<IosChannel>('preview')

  const signedIn = useAppStore((state) => state.orcaProfileAuthStatus?.state === 'connected')
  // Why: Relay is opt-in while compatible mobile builds are limited to the
  // TestFlight preview and Android APK.
  const [connectionMode, setConnectionMode] = useState<MobilePairingConnectionMode>('local-only')
  const wasSignedInRef = useRef(signedIn)

  const [devices, setDevices] = useState<PairedDevice[]>([])
  const [revokingDeviceIds, setRevokingDeviceIds] = useState<string[]>([])
  const [deviceCountAtPairStart, setDeviceCountAtPairStart] = useState<number | null>(null)
  const mountedRef = useMountedRef()
  const stageRef = useRef<FlowStage | null>(null)
  const deviceCountAtPairStartRef = useRef<number | null>(null)
  const closeMobilePage = useAppStore((s) => s.closeMobilePage)
  const showMobileButton = useAppStore((s) => s.settings?.showMobileButton !== false)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const installQrUrl = useMobileInstallQr(stage, platform, iosChannel)
  const { copyInstallUrl, openInstallUrl } = useMobileInstallActions(platform, iosChannel)

  const {
    networkInterfaces,
    selectedAddresses,
    refreshingNetworkInterfaces,
    pairQrDataUrl,
    pairingUrl,
    pairLoading,
    loadNetworkInterfaces,
    handleAddressesChange,
    generatePairing,
    copyPairingCode,
    resetPairingOffer
  } = useMobileAdvertiseAddresses({
    mountedRef,
    interfacesActive: stage === 'flow',
    shouldAutoGenerate: stage === 'flow' && stepIdx === 1
  })

  const handleConnectionModeChange = useCallback(
    (nextMode: MobilePairingConnectionMode): void => {
      if (nextMode === connectionMode) {
        return
      }
      setConnectionMode(nextMode)
    },
    [connectionMode]
  )

  useEffect(() => {
    const wasSignedIn = wasSignedInRef.current
    wasSignedInRef.current = signedIn
    if (wasSignedIn && !signedIn) {
      handleConnectionModeChange('local-only')
    }
  }, [handleConnectionModeChange, signedIn])

  const setPairingDeviceBaseline = useCallback(
    (count: number | null): void => {
      deviceCountAtPairStartRef.current = count
      if (mountedRef.current) {
        setDeviceCountAtPairStart(count)
      }
    },
    [mountedRef]
  )

  const showStage = useCallback(
    (nextStage: FlowStage | null): void => {
      stageRef.current = nextStage
      if (mountedRef.current) {
        setStage(nextStage)
      }
    },
    [mountedRef]
  )

  const showPairedDevices = useCallback(
    (deviceCount: number): void => {
      // Why: paired-view polling uses this baseline; setting it with the
      // transition avoids the render-plus-Effect gap where polling stops.
      setPairingDeviceBaseline(deviceCount)
      showStage('paired')
    },
    [setPairingDeviceBaseline, showStage]
  )

  const loadDevices = useCallback(async (): Promise<PairedDevice[]> => {
    try {
      const result = await window.api.mobile.listDevices()
      if (mountedRef.current) {
        setDevices(result.devices)
        if (
          shouldShowPairedAfterDeviceRefresh({
            stage: stageRef.current,
            deviceCountAtPairStart: deviceCountAtPairStartRef.current,
            nextDeviceCount: result.devices.length
          })
        ) {
          showPairedDevices(result.devices.length)
        }
      }
      return result.devices
    } catch (err) {
      // Log so a transient IPC failure (which routes the user to 'intro') is
      // observable; keep returning [] so callers' behavior is unchanged.
      console.error('listDevices failed', err)
      return []
    }
  }, [mountedRef, showPairedDevices])

  // Why: pick the initial stage based on whether any devices are already
  // paired so returning users don't see the marketing intro every time.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const initialDevices = await loadDevices()
      if (cancelled) {
        return
      }
      if (initialDevices.length > 0) {
        showPairedDevices(initialDevices.length)
      } else {
        showStage('intro')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadDevices, showPairedDevices, showStage])

  const revokeDevice = useCallback(
    async (deviceId: string) => {
      // Why: if the user double-clicks revoke while a previous revoke is in
      // flight, bail before issuing a second IPC call.
      let alreadyRevoking = false
      setRevokingDeviceIds((prev) => {
        if (prev.includes(deviceId)) {
          alreadyRevoking = true
          return prev
        }
        return [...prev, deviceId]
      })
      if (alreadyRevoking) {
        return
      }
      try {
        await window.api.mobile.revokeDevice({ deviceId })
        const remaining = await loadDevices()
        if (mountedRef.current) {
          toast.success(translate('auto.components.mobile.MobilePage.255372e6e8', 'Device revoked'))
        }
        if (remaining.length === 0 && mountedRef.current) {
          showStage('intro')
        }
      } catch {
        if (mountedRef.current) {
          toast.error(
            translate('auto.components.mobile.MobilePage.4e1eb5d55c', 'Failed to revoke device')
          )
        }
      } finally {
        if (mountedRef.current) {
          setRevokingDeviceIds((prev) => prev.filter((id) => id !== deviceId))
        }
      }
    },
    [loadDevices, mountedRef, showStage]
  )

  // Why: poll for new pairings while the user is on Step 2 so we can
  // auto-transition to the paired summary the moment their phone connects.
  const polledLoadDevices = useCallback(async () => {
    await loadDevices()
  }, [loadDevices])

  useMobilePairingDevicePolling({
    deviceCountAtQr:
      (stage === 'flow' && stepIdx === 1) || stage === 'paired' ? deviceCountAtPairStart : null,
    currentDeviceCount: devices.length,
    loadDevices: polledLoadDevices
  })

  const enterFlow = (): void => {
    setStepIdx(0)
    setPairingDeviceBaseline(devices.length)
    resetPairingOffer()
    showStage('flow')
  }

  // Why: from the paired summary, "Pair another device" jumps straight to
  // Step 2 since the app is presumably already installed on the user's phone.
  const pairAnotherDevice = (): void => {
    setStepIdx(1)
    setPairingDeviceBaseline(devices.length)
    resetPairingOffer()
    showStage('flow')
  }

  const handleBack = (): void => {
    if (stepIdx === 1) {
      setStepIdx(0)
    } else {
      showStage('intro')
    }
  }

  const handleContinue = (): void => {
    if (stepIdx === 0) {
      setStepIdx(1)
    }
  }

  const toggleMobileSidebarButton = useCallback(() => {
    const nextShowMobileButton = !showMobileButton
    void updateSettings({ showMobileButton: nextShowMobileButton })
    if (!nextShowMobileButton) {
      toast.message(
        translate(
          'auto.components.mobile.MobilePageToolbar.e1c7b4a92d',
          'Configure in Settings > Mobile.'
        )
      )
    }
  }, [showMobileButton, updateSettings])

  useMobilePageEscape(closeMobilePage)

  return (
    <MobilePageContent
      closeMobilePage={closeMobilePage}
      copyInstallUrl={() => void copyInstallUrl()}
      copyPairingCode={() => void copyPairingCode()}
      devices={devices}
      enterFlow={enterFlow}
      generatePairing={(rotate) => void generatePairing(rotate)}
      handleAddressesChange={handleAddressesChange}
      handleBack={handleBack}
      handleContinue={handleContinue}
      installQrUrl={installQrUrl}
      iosChannel={iosChannel}
      setIosChannel={setIosChannel}
      loadNetworkInterfaces={() => void loadNetworkInterfaces()}
      networkInterfaces={networkInterfaces}
      openInstallUrl={openInstallUrl}
      pairAnotherDevice={pairAnotherDevice}
      pairLoading={pairLoading}
      connectionMode={connectionMode}
      handleConnectionModeChange={handleConnectionModeChange}
      pairQrDataUrl={pairQrDataUrl}
      pairingUrl={pairingUrl}
      platform={platform}
      refreshingNetworkInterfaces={refreshingNetworkInterfaces}
      revokeDevice={(id) => void revokeDevice(id)}
      revokingDeviceIds={revokingDeviceIds}
      selectedAddresses={selectedAddresses}
      setPlatform={setPlatform}
      showMobileButton={showMobileButton}
      showPairedDevices={showPairedDevices}
      stage={stage}
      stepIdx={stepIdx}
      toggleMobileSidebarButton={toggleMobileSidebarButton}
    />
  )
}
