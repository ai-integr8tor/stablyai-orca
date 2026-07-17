import { useMemo, useState } from 'react'
import { Image as ImageIcon, Loader2, X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { basename } from '@/lib/path'
import { useLocalImageSrc } from '@/components/editor/useLocalImageSrc'
import { isNativeChatPastedImagePath } from '@/components/native-chat/native-chat-image-paste'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { IMAGE_FILE_MIME_TYPES } from '../../../../shared/image-file-extensions'
import type { TerminalRichInputImageAttachment } from './terminal-rich-input-attachment-cache'

export function TerminalRichInputAttachments({
  attachments,
  pending,
  connectionId,
  runtimeEnvironmentId,
  worktreeId,
  onRemove
}: {
  attachments: readonly TerminalRichInputImageAttachment[]
  pending: boolean
  connectionId: string | null
  runtimeEnvironmentId: string | null
  worktreeId: string
  onRemove: (id: string) => void
}): React.JSX.Element | null {
  if (attachments.length === 0 && !pending) {
    return null
  }
  return (
    <div className="mb-1.5 flex flex-wrap gap-1.5 px-1">
      {pending ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {translate('components.terminal.richInput.addingImage', 'Adding image…')}
        </div>
      ) : null}
      {attachments.map((attachment) => (
        <TerminalRichInputAttachment
          key={attachment.id}
          attachment={attachment}
          connectionId={connectionId}
          runtimeEnvironmentId={runtimeEnvironmentId}
          worktreeId={worktreeId}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}

type AttachmentImageProps = {
  attachment: TerminalRichInputImageAttachment
  connectionId: string | null
  runtimeEnvironmentId: string | null
  worktreeId: string
}

function useAttachmentImageSrc(
  { attachment, connectionId, runtimeEnvironmentId, worktreeId }: AttachmentImageProps,
  load = true
): string | undefined {
  const runtimeContext = useMemo(
    () =>
      runtimeEnvironmentId
        ? {
            settings: { activeRuntimeEnvironmentId: runtimeEnvironmentId },
            worktreeId,
            worktreePath: undefined,
            connectionId: connectionId ?? undefined
          }
        : undefined,
    [connectionId, runtimeEnvironmentId, worktreeId]
  )
  return useLocalImageSrc(
    load ? attachment.path : undefined,
    attachment.path,
    connectionId,
    runtimeContext
  )
}

function TerminalRichInputAttachment({
  attachment,
  connectionId,
  runtimeEnvironmentId,
  worktreeId,
  onRemove
}: AttachmentImageProps & { onRemove: (id: string) => void }): React.JSX.Element {
  const [previewOpen, setPreviewOpen] = useState(false)
  const loadedImageSrc = useAttachmentImageSrc(
    { attachment, connectionId, runtimeEnvironmentId, worktreeId },
    !attachment.previewSrc
  )
  const imageSrc = attachment.previewSrc ?? loadedImageSrc
  const label = isNativeChatPastedImagePath(attachment.path)
    ? 'image.png'
    : basename(attachment.path)
  const mediaType = getImageMediaType(attachment.path)
  return (
    <HoverCard open={previewOpen} onOpenChange={setPreviewOpen} openDelay={250} closeDelay={120}>
      <HoverCardTrigger asChild>
        <div
          className="flex max-w-full cursor-default items-center gap-2 rounded-md border border-input bg-background p-1 pr-1.5 text-sm text-foreground"
          title={attachment.path}
          data-terminal-rich-input-attachment=""
        >
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted">
            {imageSrc ? (
              <img src={imageSrc} alt={label} className="size-full object-cover opacity-100" />
            ) : (
              <ImageIcon className="size-4 text-muted-foreground" />
            )}
          </div>
          <span className="max-w-56 truncate font-medium">{label}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => onRemove(attachment.id)}
            aria-label={translate(
              'components.terminal.richInput.removeAttachment',
              'Remove attachment'
            )}
            className="shrink-0 rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </HoverCardTrigger>
      {previewOpen ? (
        <HoverCardContent side="top" align="start" sideOffset={8} className="w-auto p-2">
          <TerminalRichInputAttachmentPreview
            attachment={attachment}
            connectionId={connectionId}
            runtimeEnvironmentId={runtimeEnvironmentId}
            worktreeId={worktreeId}
            label={label}
            mediaType={mediaType}
          />
        </HoverCardContent>
      ) : null}
    </HoverCard>
  )
}

function getImageMediaType(path: string): string {
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase()
  return IMAGE_FILE_MIME_TYPES[extension] ?? 'image'
}

function TerminalRichInputAttachmentPreview({
  label,
  mediaType,
  ...imageProps
}: AttachmentImageProps & { label: string; mediaType: string }): React.JSX.Element {
  const fullImageSrc = useAttachmentImageSrc(imageProps)
  const imageSrc = fullImageSrc ?? imageProps.attachment.previewSrc
  return (
    <div className="w-80 space-y-2">
      <div className="flex max-h-80 min-h-32 w-full items-center justify-center overflow-hidden rounded-md border border-border bg-background">
        {imageSrc ? (
          <img src={imageSrc} alt={label} className="max-h-80 max-w-full object-contain" />
        ) : (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 space-y-1 px-0.5">
        <div className="truncate text-sm font-medium text-foreground" title={label}>
          {label}
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground">{mediaType}</div>
      </div>
    </div>
  )
}
