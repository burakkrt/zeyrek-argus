import { pushNotice, type Notice, type NoticeInput } from './notices'

/**
 * Uygulamanın tek bildirim deposu. Herhangi bir yerden `notify.warning('Başlık', 'Açıklama')` çağrılır; kartları
 * sayfa başlığının hemen altındaki `layout/Notifications.svelte` çizer (Page içinde, her sayfada hazır).
 */
class Notifier {
  items = $state<Notice[]>([])

  show(input: NoticeInput) {
    this.items = pushNotice(this.items, input, crypto.randomUUID())
  }

  dismiss(id: string) {
    this.items = this.items.filter((n) => n.id !== id)
  }

  success = (title: string, message?: string) => this.show({ tone: 'success', title, message })
  info = (title: string, message?: string) => this.show({ tone: 'info', title, message })
  warning = (title: string, message?: string) => this.show({ tone: 'warning', title, message })
  error = (title: string, message?: string) => this.show({ tone: 'error', title, message })
}

export const notify = new Notifier()
