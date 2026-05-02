import { setHeader } from 'h3'
import { requireServerAdmin } from '~~/server/utils/auth'
import { buildStudioHandbook } from '~~/server/utils/admin/studioHandbook'
import { renderStudioHandbookPdf } from '~~/server/utils/admin/studioHandbookPdf'

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)

  const payload = await buildStudioHandbook(event)
  const pdf = await renderStudioHandbookPdf(payload)

  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', 'attachment; filename="fo-studio-ops-handbook.pdf"')
  setHeader(event, 'Cache-Control', 'no-store')

  return pdf
})
