import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  pluginConsentPreviewRequestSchema,
  type PluginConsentPreviewResult
} from '../../shared/plugins/plugin-consent-preview'
import { previewPluginConsentForClient } from '../plugins/plugin-consent-preview-controller'
import type { PluginService } from '../plugins/plugin-service'

const consentPreviewIpcArgsSchema = z.object({
  requestId: z.string().min(1).max(128),
  request: pluginConsentPreviewRequestSchema
})
const cancelConsentPreviewArgsSchema = z.object({ requestId: z.string().min(1).max(128) })

const consentPreviewRequests = new Map<string, AbortController>()

function requestKey(webContentsId: number, requestId: string): string {
  return `${webContentsId}:${requestId}`
}

function cancelRequest(webContentsId: number, requestId: string): void {
  consentPreviewRequests.get(requestKey(webContentsId, requestId))?.abort()
}

export function registerPluginConsentPreviewHandlers(pluginService: PluginService): void {
  ipcMain.handle(
    'plugins:previewConsent',
    async (event, args: unknown): Promise<PluginConsentPreviewResult> => {
      await pluginService.whenReady()
      const parsed = consentPreviewIpcArgsSchema.parse(args)
      const key = requestKey(event.sender.id, parsed.requestId)
      const controller = new AbortController()
      consentPreviewRequests.get(key)?.abort()
      consentPreviewRequests.set(key, controller)
      const abort = (): void => controller.abort()
      event.sender.once('destroyed', abort)
      event.sender.once('render-process-gone', abort)
      try {
        return await previewPluginConsentForClient(pluginService, parsed.request, {
          ownerKey: `renderer:${event.sender.id}`,
          signal: controller.signal
        })
      } finally {
        if (consentPreviewRequests.get(key) === controller) {
          consentPreviewRequests.delete(key)
        }
        event.sender.removeListener('destroyed', abort)
        event.sender.removeListener('render-process-gone', abort)
      }
    }
  )
  ipcMain.on('plugins:cancelConsentPreview', (event, args: unknown) => {
    const parsed = cancelConsentPreviewArgsSchema.parse(args)
    cancelRequest(event.sender.id, parsed.requestId)
  })
}
