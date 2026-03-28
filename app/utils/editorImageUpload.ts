export type PickEditorImageOptions = {
  accept?: string
  maxBytes?: number
}

export type PickEditorImageResult = {
  file: File
}

export async function pickImageFromDevice(options: PickEditorImageOptions = {}): Promise<PickEditorImageResult | null> {
  if (!import.meta.client) return null

  const accept = options.accept ?? 'image/*'
  const maxBytes = options.maxBytes ?? (8 * 1024 * 1024)

  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept

  const file = await new Promise<File | null>((resolve) => {
    input.onchange = () => {
      const selected = input.files?.[0] ?? null
      resolve(selected)
    }
    input.click()
  })

  if (!file) return null

  if (!file.type.startsWith('image/')) {
    throw new Error('Selected file is not an image')
  }

  if (file.size > maxBytes) {
    throw new Error(`Image is too large (${Math.ceil(file.size / (1024 * 1024))}MB). Max ${Math.ceil(maxBytes / (1024 * 1024))}MB.`)
  }

  return { file }
}

export type UploadEditorImageResult = {
  url: string
  path: string
  bucket: string
}

export async function uploadEditorImage(file: File): Promise<UploadEditorImageResult> {
  if (!import.meta.client) {
    throw new Error('Image upload is only available in the browser.')
  }

  const formData = new FormData()
  formData.append('image', file, file.name)

  return await $fetch<UploadEditorImageResult>('/api/admin/editor/upload-image', {
    method: 'POST',
    body: formData
  })
}
