import { reportAppError } from '~~/server/utils/errors/reporting'

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

const getStackTrace = (error: unknown): string | null => {
  return error instanceof Error ? error.stack ?? null : null
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', async (error, context) => {
    const event = context?.event
    if (!event) return

    await reportAppError(event, {
      sourceApp: 'fostudio',
      severity: 'error',
      message: getErrorMessage(error),
      stackTrace: getStackTrace(error),
      metadata: {
        hook: 'nitro.error'
      }
    })
  })
})
