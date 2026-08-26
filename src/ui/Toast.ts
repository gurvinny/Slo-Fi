// Small bottom-banner toast, reused for the low-power "Lite visual" suggestion
// and the PWA install prompt. One toast visible at a time.
export interface ToastOptions {
  message: string
  actionLabel?: string
  onAction?: () => void
  duration?: number   // ms before auto-dismiss; 0/omitted = sticky until dismissed
}

export class Toast {
  private el       = document.getElementById('toast')!
  private msgEl    = this.el.querySelector('.toast-msg') as HTMLElement
  private actionEl = this.el.querySelector('.toast-action') as HTMLButtonElement
  private closeEl  = this.el.querySelector('.toast-close') as HTMLButtonElement
  private _timer: number | null = null
  private _onAction: (() => void) | null = null

  constructor() {
    this.closeEl.addEventListener('click', () => this.hide())
    this.actionEl.addEventListener('click', () => {
      const fn = this._onAction
      this.hide()
      fn?.()
    })
  }

  show(o: ToastOptions): void {
    this.clearTimer()
    this.msgEl.textContent = o.message
    this._onAction = o.onAction ?? null
    if (o.actionLabel) {
      this.actionEl.textContent = o.actionLabel
      this.actionEl.style.display = ''
    } else {
      this.actionEl.textContent = ''
      this.actionEl.style.display = 'none'
    }
    this.el.classList.add('toast--visible')
    this.el.setAttribute('aria-hidden', 'false')
    if (o.duration && o.duration > 0) {
      this._timer = window.setTimeout(() => this.hide(), o.duration)
    }
  }

  hide(): void {
    this.clearTimer()
    this.el.classList.remove('toast--visible')
    this.el.setAttribute('aria-hidden', 'true')
    this._onAction = null
  }

  private clearTimer(): void {
    if (this._timer !== null) { clearTimeout(this._timer); this._timer = null }
  }
}
