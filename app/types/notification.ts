export type Notification = {
  id: string
  type: 'membership' | 'credits' | 'booking' | 'system'
  title: string
  body: string
  date: string
  unread?: boolean
  sender?: {
    name: string
    avatar?: { src?: string; alt?: string }
  }
  action?: { label: string; to: string }
}
