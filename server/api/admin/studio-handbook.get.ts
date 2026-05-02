import { requireServerAdmin } from '~~/server/utils/auth'
import { buildStudioHandbook } from '~~/server/utils/admin/studioHandbook'

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)
  return await buildStudioHandbook(event)
})
