import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { requireServerAdmin } from '~~/server/utils/auth'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_EMAIL_IMAGE_DIMENSION_PX = 1600
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

type OptimizedImageResult = {
  buffer: Buffer
  mimeType: string
  extension: string
}

async function optimizeForEmailImage(input: Buffer, mimeType: string): Promise<OptimizedImageResult> {
  // Keep GIFs untouched so animation is preserved.
  if (mimeType === 'image/gif') {
    return {
      buffer: input,
      mimeType: 'image/gif',
      extension: 'gif'
    }
  }

  try {
    const pipeline = sharp(input, { failOn: 'none', animated: false }).rotate()
    const metadata = await pipeline.metadata()

    const resized = pipeline.resize({
      width: MAX_EMAIL_IMAGE_DIMENSION_PX,
      height: MAX_EMAIL_IMAGE_DIMENSION_PX,
      fit: 'inside',
      withoutEnlargement: true
    })

    const usePng = Boolean(metadata.hasAlpha) || mimeType === 'image/png'
    if (usePng) {
      const output = await resized.png({
        compressionLevel: 9,
        quality: 80,
        effort: 8,
        palette: true
      }).toBuffer()

      return {
        buffer: output,
        mimeType: 'image/png',
        extension: 'png'
      }
    }

    const output = await resized.jpeg({
      quality: 82,
      progressive: true,
      mozjpeg: true
    }).toBuffer()

    return {
      buffer: output,
      mimeType: 'image/jpeg',
      extension: 'jpg'
    }
  } catch (error: unknown) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid or unsupported image data: ${error instanceof Error ? error.message : 'Unknown image error'}`
    })
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
  const optimized = await optimizeForEmailImage(imagePart.data, mimeType)

  if (optimized.buffer.length > MAX_IMAGE_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: `Optimized image is still too large (${Math.ceil(optimized.buffer.length / (1024 * 1024))}MB). Max 10MB.`
    })
  }

  const extension = optimized.extension || extensionForMime(mimeType)
  const objectPath = `editor/${yyyy}/${mm}/${dd}/${user.sub}/${randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, optimized.buffer, {
    contentType: optimized.mimeType,
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
