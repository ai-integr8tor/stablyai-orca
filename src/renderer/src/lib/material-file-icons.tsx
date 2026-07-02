import type React from 'react'
import { basename } from './path'
import { cn } from './utils'
import manifest from './material-file-icons-manifest.json'

type MaterialFileIconManifest = {
  fileNames: Record<string, string>
  fileExtensions: Record<string, string>
  defaultIcon: string
}

const materialFileIconManifest = manifest as MaterialFileIconManifest

function resolveMaterialFileIconAssetUrl(
  iconName: string,
  baseHref = globalThis.location?.href ?? 'http://localhost/'
): string {
  return new URL(`file-icons/${iconName}.svg`, baseHref).toString()
}

function getMaterialFileIconName(filePath: string | undefined | null): string | null {
  const name = basename(filePath ?? '')
  const lowerName = name.toLowerCase()

  const exactIcon = materialFileIconManifest.fileNames[name]
  if (exactIcon) {
    return exactIcon
  }

  const lowerIcon = materialFileIconManifest.fileNames[lowerName]
  if (lowerIcon) {
    return lowerIcon
  }

  const firstDotIndex = name.indexOf('.')
  if (firstDotIndex >= 0) {
    const extensionSegments = name
      .slice(firstDotIndex + 1)
      .toLowerCase()
      .split('.')
    for (let index = 0; index < extensionSegments.length; index += 1) {
      const extension = extensionSegments.slice(index).join('.')
      const icon = materialFileIconManifest.fileExtensions[extension]
      if (icon) {
        return icon
      }
    }
  }

  return null
}

export function getKnownMaterialFileIconAssetUrl(
  filePath: string | undefined | null
): string | null {
  const iconName = getMaterialFileIconName(filePath)
  return iconName ? resolveMaterialFileIconAssetUrl(iconName) : null
}

export function getMaterialFileIconAssetUrl(
  filePath: string | undefined | null,
  _isDirectory = false
): string {
  return (
    getKnownMaterialFileIconAssetUrl(filePath) ??
    resolveMaterialFileIconAssetUrl(materialFileIconManifest.defaultIcon)
  )
}

export function MaterialFileIcon({
  className,
  fallbackIcon,
  filePath,
  isMuted = false
}: {
  className?: string
  fallbackIcon?: React.ReactElement
  filePath: string | undefined | null
  isMuted?: boolean
}): React.JSX.Element {
  const src = getKnownMaterialFileIconAssetUrl(filePath)

  if (!src && fallbackIcon) {
    return fallbackIcon
  }

  return (
    <img
      alt=""
      className={cn(className, isMuted && 'grayscale opacity-55')}
      draggable={false}
      src={src ?? getMaterialFileIconAssetUrl(filePath)}
    />
  )
}
