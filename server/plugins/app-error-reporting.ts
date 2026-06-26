import {
  getErrorMessage,
  getErrorStackTrace,
  getErrorStatusCode,
  shouldReportAppError
} from '~~/server/utils/errors/filtering'
import { reportAppError } from '~~/server/utils/errors/reporting'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', async (error, context) => {
    const event = context?.event
    if (!event) return
    if (!shouldReportAppError(error, event)) return

    await reportAppError(event, {
      sourceApp: 'fostudio',
      severity: 'error',
      message: getErrorMessage(error),
      stackTrace: getErrorStackTrace(error),
      statusCode: getErrorStatusCode(error),
      metadata: {
        hook: 'nitro.error'
      }
    })
  })
})
