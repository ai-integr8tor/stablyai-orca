import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '../../store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useMobilePairingDevicePolling } from './mobile-pairing-device-polling'
import {
  orderedAdvertiseAddressesEqual,
  refreshOrderedAdvertiseAddresses,
  type MobileNetworkInterface
} from './mobile-network-interface-selection'
import {
  deriveCustomAdvertiseAddresses,
  loadMobileAdvertiseAddressOrder,
  saveMobileAdvertiseAddressOrder
} from './mobile-advertise-address-order-store'
import { MobilePairingQrSection } from './MobilePairingQrSection'
import { MobilePairedDevicesSection, type PairedDevice } from './MobilePairedDevicesSection'
import { MobileAutoRestoreFitSection } from './MobileAutoRestoreFitSection'
import { MobilePairingConnectionOptions } from './MobilePairingConnectionOptions'
import { MobilePairingSetupSection } from './MobilePairingSetupSection'
import { WindowsFirewallNotice } from '../mobile/WindowsFirewallNotice'
import { translate } from '@/i18n/i18n'
import type { MobilePairingConnectionMode } from '../../../../shared/mobile-pairing-connection-mode'
export { getMobilePaneSearchEntries } from './mobile-pane-search'

function readInitialAdvertiseOrder(): {
  addresses: string[]
  customAddresses: Set<string>
} {
  const stored = loadMobileAdvertiseAddressOrder()
  if (!stored) {
    return { addresses: [], customAddresses: new Set() }
  }
  return {
    addresses: stored.addresses,
    customAddresses: new Set(stored.customAddresses)
  }
}

export function MobilePane(): React.JSX.Element {
  const autoRestoreFitMs = useAppStore((s) => s.settings?.mobileAutoRestoreFitMs ?? null)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [pairingUrl, setPairingUrl] = useState<string | null>(null)
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [devices, setDevices] = useState<PairedDevice[]>([])
  const [qrEnlarged, setQrEnlarged] = useState(false)
  const [networkInterfaces, setNetworkInterfaces] = useState<MobileNetworkInterface[]>([])
  const [selectedAddresses, setSelectedAddresses] = useState<string[]>(
    () => readInitialAdvertiseOrder().addresses
  )
  const [customAddresses, setCustomAddresses] = useState<Set<string>>(
    () => readInitialAdvertiseOrder().customAddresses
  )
  const [refreshingNetworkInterfaces, setRefreshingNetworkInterfaces] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [deviceCountAtQr, setDeviceCountAtQr] = useState<number | null>(null)
  const signedIn = useAppStore((state) => state.orcaProfileAuthStatus?.state === 'connected')
  // Why: Relay is opt-in while compatible mobile builds are limited to the
  // TestFlight preview and Android APK.
  const [connectionMode, setConnectionMode] = useState<MobilePairingConnectionMode>('local-only')
  const [rotateNextQr, setRotateNextQr] = useState(false)
  const devicesRef = useRef<PairedDevice[]>([])
  const wasSignedInRef = useRef(signedIn)
  const networkInterfacesRef = useRef<MobileNetworkInterface[]>([])
  const codeCopiedResetTimerRef = useRef<number | null>(null)
  const mountedRef = useMountedRef()

  const clearCodeCopiedResetTimer = useCallback((): void => {
    if (codeCopiedResetTimerRef.current !== null) {
      window.clearTimeout(codeCopiedResetTimerRef.current)
      codeCopiedResetTimerRef.current = null
    }
  }, [])

  const loadDevices = useCallback(async () => {
    try {
      const result = await window.api.mobile.listDevices()
      if (mountedRef.current) {
        devicesRef.current = result.devices
        setDevices(result.devices)
      }
    } catch {
      // Silently fail — device list is non-critical
    }
  }, [mountedRef])

  const loadNetworkInterfaces = useCallback(
    async (opts: { notifyOnError?: boolean } = {}) => {
      setRefreshingNetworkInterfaces(true)
      try {
        const result = await window.api.mobile.listNetworkInterfaces()
        if (mountedRef.current) {
          const previousInterfaces = networkInterfacesRef.current
          networkInterfacesRef.current = result.interfaces
          setNetworkInterfaces(result.interfaces)
          setSelectedAddresses((currentAddresses) => {
            const nextAddresses = refreshOrderedAdvertiseAddresses(
              currentAddresses,
              result.interfaces,
              previousInterfaces,
              { customAddresses }
            )
            if (orderedAdvertiseAddressesEqual(nextAddresses, currentAddresses)) {
              return currentAddresses
            }
            const nextCustoms = deriveCustomAdvertiseAddresses(
              nextAddresses,
              result.interfaces,
              customAddresses
            )
            setCustomAddresses(nextCustoms)
            saveMobileAdvertiseAddressOrder(nextAddresses, nextCustoms)
            return nextAddresses
          })
        }
      } catch {
        if (opts.notifyOnError && mountedRef.current) {
          toast.error(
            translate(
              'auto.components.settings.MobilePane.d714614dbf',
              'Failed to refresh network interfaces'
            )
          )
        }
      } finally {
        if (mountedRef.current) {
          setRefreshingNetworkInterfaces(false)
        }
      }
    },
    [customAddresses, mountedRef]
  )

  const generateQR = useCallback(
    async (opts: { rotate?: boolean } = {}) => {
      setLoading(true)
      try {
        const result = await window.api.mobile.getPairingQR({
          ...(selectedAddresses.length > 0 ? { addresses: selectedAddresses } : {}),
          connectionMode,
          ...(opts.rotate || rotateNextQr ? { rotate: true } : {})
        })
        if (result.available) {
          useAppStore.getState().recordFeatureInteraction('mobile-pairing')
          if (mountedRef.current) {
            setQrDataUrl(result.qrDataUrl)
            setPairingUrl(result.pairingUrl)
            setEndpoint(result.endpoint)
            setDeviceCountAtQr(devicesRef.current.length)
            clearCodeCopiedResetTimer()
            setCodeCopied(false)
            setRotateNextQr(false)
            void loadDevices()
          }
        } else {
          if (mountedRef.current) {
            toast.error(
              translate(
                'auto.components.settings.MobilePane.cb9067c1c1',
                'WebSocket transport is not running'
              )
            )
          }
        }
      } catch {
        if (mountedRef.current) {
          toast.error(
            translate(
              'auto.components.settings.MobilePane.e3c427e020',
              'Failed to generate QR code'
            )
          )
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    },
    [
      clearCodeCopiedResetTimer,
      connectionMode,
      loadDevices,
      mountedRef,
      rotateNextQr,
      selectedAddresses
    ]
  )

  const changeConnectionMode = useCallback(
    (nextMode: MobilePairingConnectionMode) => {
      if (nextMode === connectionMode) {
        return
      }
      setConnectionMode(nextMode)
      if (qrDataUrl) {
        // Why: a displayed code encodes the old connection policy. Hide it and
        // rotate its pending credential before showing a code for the new mode.
        setQrDataUrl(null)
        setPairingUrl(null)
        setEndpoint(null)
        setRotateNextQr(true)
      }
    },
    [connectionMode, qrDataUrl]
  )

  useEffect(() => {
    void loadDevices()
    void loadNetworkInterfaces()
  }, [loadDevices, loadNetworkInterfaces])

  useEffect(() => {
    const wasSignedIn = wasSignedInRef.current
    wasSignedInRef.current = signedIn
    if (wasSignedIn && !signedIn) {
      changeConnectionMode('local-only')
    }
  }, [changeConnectionMode, signedIn])

  useMobilePairingDevicePolling({
    deviceCountAtQr,
    currentDeviceCount: devices.length,
    loadDevices
  })

  async function revokeDevice(deviceId: string) {
    try {
      await window.api.mobile.revokeDevice({ deviceId })
      if (mountedRef.current) {
        setDevices((prev) => {
          const nextDevices = prev.filter((d) => d.deviceId !== deviceId)
          devicesRef.current = nextDevices
          return nextDevices
        })
        toast.success(translate('auto.components.settings.MobilePane.2e3dd0bc29', 'Device revoked'))
      }
    } catch {
      if (mountedRef.current) {
        toast.error(
          translate('auto.components.settings.MobilePane.870e1b5ca5', 'Failed to revoke device')
        )
      }
    }
  }

  const handleAddressesChange = (addresses: string[]): void => {
    const nextCustoms = deriveCustomAdvertiseAddresses(
      addresses,
      networkInterfacesRef.current,
      customAddresses
    )
    setSelectedAddresses(addresses)
    setCustomAddresses(nextCustoms)
    saveMobileAdvertiseAddressOrder(addresses, nextCustoms)
  }

  return (
    <div className="space-y-6">
      <MobilePairingSetupSection
        connectionMode={connectionMode}
        relayConnectionControl={
          <MobilePairingConnectionOptions value={connectionMode} onChange={changeConnectionMode} />
        }
        networkInterfaces={networkInterfaces}
        selectedAddresses={selectedAddresses}
        onSelectedAddressesChange={handleAddressesChange}
        refreshingNetworkInterfaces={refreshingNetworkInterfaces}
        onRefreshNetworkInterfaces={() => void loadNetworkInterfaces({ notifyOnError: true })}
        loading={loading}
        hasQrCode={qrDataUrl != null}
        onGenerateQr={() => void generateQR({ rotate: qrDataUrl != null })}
      />

      <MobilePairingQrSection
        qrDataUrl={qrDataUrl}
        pairingUrl={pairingUrl}
        endpoint={endpoint}
        qrEnlarged={qrEnlarged}
        codeCopied={codeCopied}
        onQrEnlargedChange={setQrEnlarged}
        onCodeCopiedChange={setCodeCopied}
        onClearCodeCopiedTimer={clearCodeCopiedResetTimer}
      />

      <WindowsFirewallNotice pairingReady={qrDataUrl != null} address={selectedAddresses[0]} />

      <MobilePairedDevicesSection
        devices={devices}
        hasQrCode={qrDataUrl != null}
        onRevokeDevice={(deviceId) => void revokeDevice(deviceId)}
      />

      <MobileAutoRestoreFitSection
        autoRestoreFitMs={autoRestoreFitMs}
        onAutoRestoreFitChange={(ms) => void updateSettings({ mobileAutoRestoreFitMs: ms })}
      />
    </div>
  )
}
