import { createSharedComposable } from '@vueuse/core'

const _useDashboard = () => {
  const route = useRoute()
  const router = useRouter()
  const isNotificationsSlideoverOpen = ref(false)

  defineShortcuts({
    'g-d': () => router.push('/dashboard'),
    'g-b': () => router.push('/book'),
    'g-c': () => router.push('/calendar'),
    'g-m': () => router.push('/dashboard/membership'),
    'g-k': () => router.push('/dashboard/membership#credits'),
    'n': () => (isNotificationsSlideoverOpen.value = !isNotificationsSlideoverOpen.value)
  })

  watch(() => route.fullPath, () => {
    isNotificationsSlideoverOpen.value = false
  })

  return { isNotificationsSlideoverOpen }
}

export const useDashboard = createSharedComposable(_useDashboard)
