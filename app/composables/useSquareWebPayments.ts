type SquarePaymentsInstance = {
  card: () => Promise<{
    attach: (selector: string) => Promise<void>
    tokenize: () => Promise<{ status: string, token?: string, errors?: Array<{ message?: string }> }>
    destroy?: () => Promise<void> | void
  }>
}

type SquareGlobal = {
  payments: (applicationId: string, locationId: string) => SquarePaymentsInstance
}

declare global {
  interface Window {
    Square?: SquareGlobal
  }
}

let squareScriptPromise: Promise<void> | null = null

async function loadSquareScript() {
  if (import.meta.server) throw new Error('Square Web Payments can only run in browser.')
  if (window.Square?.payments) return
  if (squareScriptPromise) {
    await squareScriptPromise
    return
  }

  squareScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-square-web-payments="1"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Square Web Payments SDK.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://web.squarecdn.com/v1/square.js'
    script.async = true
    script.dataset.squareWebPayments = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Square Web Payments SDK.'))
    document.head.appendChild(script)
  })

  await squareScriptPromise
}

export async function createSquareCardHandle(containerSelector: string) {
  const config = await $fetch<{ applicationId: string, locationId: string }>('/api/payments/config')
  await loadSquareScript()
  if (!window.Square?.payments) throw new Error('Square Web Payments SDK unavailable.')
  const payments = window.Square.payments(config.applicationId, config.locationId)
  const card = await payments.card()
  await card.attach(containerSelector)
  return card
}
