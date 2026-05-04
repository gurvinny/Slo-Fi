export class SplashController {
  private readonly STORAGE_KEY = 'sf_visited'
  private readonly IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  constructor() {
    // Immediately hide landing content so the reveal feels intentional, not a flash
    document.documentElement.classList.add('has-splash')
    this._run()
  }

  private _run(): void {
    const splash = document.getElementById('splash')
    if (!splash) {
      document.documentElement.classList.remove('has-splash')
      return
    }

    const cta = document.getElementById('splashCta') as HTMLButtonElement
    const isRepeat = !!localStorage.getItem(this.STORAGE_KEY)
    localStorage.setItem(this.STORAGE_KEY, '1')

    if (isRepeat) {
      // Fast collapse — skip the full sequence, just collapse and reveal
      splash.classList.add('splash--fast')
      document.documentElement.classList.remove('has-splash')
      setTimeout(() => splash.remove(), 280)
      return
    }

    // First visit: full branded sequence
    splash.classList.add('splash--animate')

    // Flicker at 820ms — 3 rapid opacity pulses
    setTimeout(() => this._flicker(splash), 820)

    // CTA becomes interactive at 1020ms
    setTimeout(() => cta.classList.add('splash-cta--visible'), 1020)

    if (this.IS_MOBILE) {
      // On mobile: tap anywhere to dismiss (after animation has started)
      const onTap = () => {
        document.removeEventListener('touchstart', onTap)
        this._dismiss(splash)
      }
      document.addEventListener('touchstart', onTap, { passive: true })
    } else {
      cta.addEventListener('click', () => this._dismiss(splash), { once: true })
    }
  }

  private _flicker(el: HTMLElement): void {
    let i = 0
    const t = setInterval(() => {
      el.style.opacity = i % 2 === 0 ? '0.1' : ''
      if (++i >= 6) { clearInterval(t); el.style.opacity = '' }
    }, 52)
  }

  private _dismiss(splash: HTMLElement): void {
    // Pin the clip-path collapse to the mark's exact screen center
    const mark = document.getElementById('splash-mark')
    if (mark) {
      const r = mark.getBoundingClientRect()
      const cx = ((r.left + r.width  / 2) / window.innerWidth  * 100).toFixed(1)
      const cy = ((r.top  + r.height / 2) / window.innerHeight * 100).toFixed(1)
      splash.style.setProperty('--clip-cx', cx + '%')
      splash.style.setProperty('--clip-cy', cy + '%')
    }

    // Reveal the landing page — CSS transitions on .header, #dropzone etc. kick in
    document.documentElement.classList.remove('has-splash')

    // Collapse the splash
    splash.classList.add('splash--out')

    // Remove from DOM after transition completes
    setTimeout(() => splash.remove(), 750)
  }
}
