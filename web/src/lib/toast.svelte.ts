// One short-lived message at a time, shown by <Toast> in the app shell.

class ToastStore {
  current = $state<{ id: number; text: string } | null>(null)
  private next = 0

  show(text: string) {
    this.current = { id: ++this.next, text }
  }
}

export const toast = new ToastStore()
