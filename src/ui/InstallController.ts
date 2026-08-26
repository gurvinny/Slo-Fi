import type { Toast } from './Toast'

// The beforeinstallprompt event isn't in lib.dom — minimal shape we use.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Owns the custom PWA install experience: captures Chrome/Android's
// beforeinstallprompt, and surfaces a one-per-session toast after the user's
// first track loads. On iOS Safari (no programmatic prompt) it shows the
// manual "Add to Home Screen" instructions instead.
export class InstallController {
  private _deferred: BeforeInstallPromptEvent | null = null
  private readonly SHOWN_KEY = 'slofi-install-shown'

  constructor(private toast: Toast) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()                              // suppress the default mini-infobar
      this._deferred = e as BeforeInstallPromptEvent  // stash for our own button
    })
    window.addEventListener('appinstalled', () => {
      this._deferred = null
      try { sessionStorage.setItem(this.SHOWN_KEY, '1') } catch { /* ignore */ }
    })
  }

  private get isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
  }

  private get isIOS(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as Window & { MSStream?: unknown }).MSStream
  }

  // Call once after the first track loads.
  maybePrompt(): void {
    if (this.isStandalone) return                                  // already installed
    try { if (sessionStorage.getItem(this.SHOWN_KEY) === '1') return } catch { /* ignore */ }

    if (this._deferred) {
      // Chrome / Android — real install prompt behind our own button
      this.markShown()
      this.toast.show({
        message: 'Add Slo‑Fi to your Home Screen for the full experience.',
        actionLabel: 'Install',
        onAction: () => {
          const evt = this._deferred
          this._deferred = null
          void evt?.prompt()
        },
      })
    } else if (this.isIOS) {
      // iOS Safari — no programmatic prompt; show the manual A2HS instructions
      this.markShown()
      this.toast.show({
        message: 'Install Slo‑Fi: tap Share, then “Add to Home Screen”.',
        duration: 8000,
      })
    }
    // Otherwise: not installable (unsupported browser, or prompt not yet fired) — stay quiet.
  }

  private markShown(): void {
    try { sessionStorage.setItem(this.SHOWN_KEY, '1') } catch { /* ignore */ }
  }
}
