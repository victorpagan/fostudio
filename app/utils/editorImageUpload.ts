export type PickEditorImageOptions = {
  accept?: string
  maxBytes?: number
}

export type PickEditorImageResult = {
  file: File
  dataUrl: string
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string' || !result) {
        reject(new Error('Could not read image file'))
        return
      }
      resolve(result)
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read image file'))
    }
    reader.readAsDataURL(file)
  })
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

  const dataUrl = await readAsDataUrl(file)
  return { file, dataUrl }
}
