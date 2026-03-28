import { randomUUID } from 'node:crypto'
import { requireServerAdmin } from '~~/server/utils/auth'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif'
])

function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/avif':
      return 'avif'
    default:
      return 'bin'
  }
}

function resolveEditorImageBucket(event: Parameters<typeof useRuntimeConfig>[0]): string {
  const runtimeConfig = useRuntimeConfig(event)
  const configured = String(runtimeConfig.editorImageBucket || '').trim()
  if (configured) return configured
  return 'mail-assets'
}

async function ensureBucketIsPublic(supabase: Awaited<ReturnType<typeof requireServerAdmin>>['supabase'], bucket: string) {
  const { data: bucketData, error: bucketError } = await supabase.storage.getBucket(bucket)

  if (bucketError) {
    const missing = bucketError.message.toLowerCase().includes('not found')
    if (!missing) {
      throw createError({ statusCode: 500, statusMessage: `Failed to load storage bucket "${bucket}": ${bucketError.message}` })
    }

    const { error: createErrorResult } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: MAX_IMAGE_BYTES,
      allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES]
    })

    if (createErrorResult && !createErrorResult.message.toLowerCase().includes('already exists')) {
      throw createError({ statusCode: 500, statusMessage: `Failed to create storage bucket "${bucket}": ${createErrorResult.message}` })
    }

    return
  }

  if (bucketData.public) return

  const { error: updateError } = await supabase.storage.updateBucket(bucket, {
    public: true,
    fileSizeLimit: MAX_IMAGE_BYTES,
    allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES]
  })

  if (updateError) {
    throw createError({
      statusCode: 500,
      statusMessage: `Storage bucket "${bucket}" must be public for email-safe image URLs: ${updateError.message}`
    })
  }
}

export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireServerAdmin(event)
  const parts = await readMultipartFormData(event)
  if (!parts?.length) {
    throw createError({ statusCode: 400, statusMessage: 'No upload payload provided.' })
  }

  const imagePart = parts.find(part => part.name === 'image' && part.filename && part.data?.length)
  if (!imagePart?.data?.length || !imagePart.filename) {
    throw createError({ statusCode: 400, statusMessage: 'Expected an image file in field "image".' })
  }

  const mimeType = String(imagePart.type || '').trim().toLowerCase()
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Unsupported image format "${mimeType || 'unknown'}". Allowed: JPEG, PNG, WEBP, GIF, AVIF.`
    })
  }

  if (imagePart.data.length > MAX_IMAGE_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: `Image is too large (${Math.ceil(imagePart.data.length / (1024 * 1024))}MB). Max 10MB.`
    })
  }

  const bucket = resolveEditorImageBucket(event)
  await ensureBucketIsPublic(supabase, bucket)

  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const extension = extensionForMime(mimeType)
  const objectPath = `editor/${yyyy}/${mm}/${dd}/${user.sub}/${randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, imagePart.data, {
    contentType: mimeType,
    cacheControl: '31536000',
    upsert: false
  })

  if (uploadError) {
    throw createError({ statusCode: 500, statusMessage: `Image upload failed: ${uploadError.message}` })
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(objectPath)
  const publicUrl = String(publicUrlData.publicUrl || '').trim()
  if (!publicUrl) {
    throw createError({ statusCode: 500, statusMessage: 'Could not resolve a public image URL.' })
  }

  return {
    url: publicUrl,
    path: objectPath,
    bucket
  }
})
