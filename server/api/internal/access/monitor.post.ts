import { timingSafeEqual } from 'node:crypto'
import { getKey } from '~~/server/utils/config/secret'
import { monitorAccess } from '~~/server/utils/access/monitor'

export default defineEventHandler(async (event) => {
  const expected = await getKey(event, 'ACCESS_AUTOMATION_SHARED_KEY').catch(() => null)
  const supplied = getHeader(event, 'x-access-key') ?? ''
  if (!expected || Buffer.byteLength(expected) !== Buffer.byteLength(supplied)
    || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return await monitorAccess(event)
})
