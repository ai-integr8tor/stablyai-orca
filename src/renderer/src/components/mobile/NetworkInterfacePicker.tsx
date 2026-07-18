import React from 'react'
import { OrderedNetworkAddressPicker } from './OrderedNetworkAddressPicker'
import type { MobileNetworkInterface } from '../settings/mobile-network-interface-selection'

// Why: MobileHero and MobilePairingSetupSection share one advertise picker.
// Ordered multi-select is Mobile-setup only — runtime pairing keeps AddressPicker.

export type NetworkInterfacePickerProps = {
  networkInterfaces: readonly MobileNetworkInterface[]
  selectedAddresses: readonly string[]
  onSelectedAddressesChange: (addresses: string[]) => void
  disabled?: boolean
  className?: string
  id?: string
}

export function NetworkInterfacePicker({
  networkInterfaces,
  selectedAddresses,
  onSelectedAddressesChange,
  disabled = false,
  className,
  id
}: NetworkInterfacePickerProps): React.JSX.Element {
  return (
    <OrderedNetworkAddressPicker
      networkInterfaces={networkInterfaces}
      selectedAddresses={selectedAddresses}
      onSelectedAddressesChange={onSelectedAddressesChange}
      disabled={disabled}
      className={className}
      id={id}
    />
  )
}
