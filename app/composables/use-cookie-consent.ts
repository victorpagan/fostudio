export type CookieConsentChoice = 'accepted' | 'rejected' | null

export const useCookieConsent = createSharedComposable(() => useCookie<CookieConsentChoice>('cookie-consent', {
  default: () => null,
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax',
  secure: !import.meta.dev
}))
