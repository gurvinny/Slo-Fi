import type { AudioEngine } from '../audio/AudioEngine'

// Haptic pulse durations in milliseconds. Short and distinct so they feel
// like confirmation taps rather than interruptions.
const HAPTIC_PLAY  = [12]
const HAPTIC_PAUSE = [8]
const HAPTIC_SEEK  = [4]

// True on iOS/Android where the AudioContext is suspended when the page is
// hidden. On macOS/Windows/Linux desktop browsers the context keeps running,
// so the background gain-fade and session-pause logic must be skipped there.
const IS_MOBILE_PLATFORM = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

// MobileController owns all mobile-specific browser APIs:
//   - Media Session API: populates the OS lock screen / notification transport
//   - Fullscreen API: enters and exits browser fullscreen
//   - Vibration API: short haptic feedback on transport interactions
//   - visibilitychange: resumes the AudioContext after a background suspension
//
// This follows the same controller pattern as PresetController and EffectsController.
// App.ts wires the onExternal* callbacks to keep its own UI state in sync when
// the user operates playback from the lock screen.

export class MobileController {
  private _engine: AudioEngine

  // Callbacks assigned by App.ts so lock screen actions update the in-app UI
  public onExternalPlay:  (() => void) | null = null
  public onExternalPause: (() => void) | null = null
  public onExternalStop:  (() => void) | null = null

  // Reference to the engine's keepalive audio element (set after first play).
  private _silentAudio: HTMLAudioElement | null = null

  // Screen Wake Lock — keeps the browser tab alive during extended playback.
  // The sentinel is released automatically when the tab is hidden, so we
  // re-acquire it each time the tab becomes visible and music is playing.
  private _wakeLock: WakeLockSentinel | null = null

  async acquireWakeLock(): Promise<void> {
    if (!('wakeLock' in navigator)) return
    try {
      this._wakeLock = await navigator.wakeLock.request('screen')
    } catch { /* denied or unsupported — non-fatal */ }
  }

  releaseWakeLock(): void {
    this._wakeLock?.release().catch(() => {})
    this._wakeLock = null
  }

  private _onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      if (!IS_MOBILE_PLATFORM) return
      // Fade master gain to zero before iOS suspends the AudioContext so
      // there is no harsh click when the app goes to the background.
      this._engine.prepareForBackground()
      // Keep the lock screen card visible by marking the session as paused
      // rather than letting the OS infer it has ended.
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused'
      }
    } else if (document.visibilityState === 'visible') {
      // Resume the AudioContext and fade gain back up cleanly.
      this._engine.resumeFromBackground()
      // Also restart the silence loop in case iOS paused the audio element
      if (this._engine.isPlaying) this.ensureSilenceLoop()
      // Re-acquire wake lock — it is automatically released on tab hide.
      if (this._engine.isPlaying) void this.acquireWakeLock()
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState =
          this._engine.isPlaying ? 'playing' : 'paused'
      }
    }
  }

  constructor(engine: AudioEngine) {
    this._engine = engine
    document.addEventListener('visibilitychange', this._onVisibilityChange)
    this._registerMediaSessionHandlers()
  }

  // Set the track title on the OS lock screen and notification area.
  // Call this each time a new file is loaded.
  setMediaSessionMetadata(title: string): void {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: 'Slo-Fi',
      album:  '',
    })
  }

  // Sync the lock screen playback state and position scrubber.
  // Call this on every play, pause, seek, and time update.
  updatePlaybackState(playing: boolean): void {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'

    const dur = this._engine.duration
    if (dur > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration:     dur,
          playbackRate: this._engine.getParams().playbackRate,
          position:     Math.min(this._engine.currentTime, dur),
        })
      } catch {
        // setPositionState throws on some browsers when position > duration
        // during a seek transition. Swallow so the UI never breaks.
      }
    }
  }

  // Wire the fullscreen toggle button. Handles both the standard and webkit
  // prefixed APIs so it works on older mobile browsers.
  bindFullscreenBtn(btn: HTMLButtonElement): void {
    btn.addEventListener('click', () => this._toggleFullscreen())
    document.addEventListener('fullscreenchange',        () => this._syncFullscreenIcon(btn))
    document.addEventListener('webkitfullscreenchange',  () => this._syncFullscreenIcon(btn))
  }

  // Short haptic pulse confirming that playback has started.
  hapticPlay(): void { this._vibrate(HAPTIC_PLAY) }

  // Short haptic pulse confirming that playback has paused.
  hapticPause(): void { this._vibrate(HAPTIC_PAUSE) }

  // Very brief tick for waveform seek interactions.
  hapticSeek(): void { this._vibrate(HAPTIC_SEEK) }

  // Starts the engine's keepalive audio element (a silent MediaStream source)
  // to hold the iOS audio session open. Because the source is a live MediaStream
  // rather than a file, iOS has no duration to display in Control Center, so
  // our setPositionState calls are the only position data it can show.
  // Call this from any user-initiated play action.
  ensureSilenceLoop(): void {
    if (!this._silentAudio) {
      this._silentAudio = this._engine.keepaliveEl
    }
    if (this._silentAudio && this._silentAudio.paused) {
      this._silentAudio.play().catch(() => {})
    }
  }

  // Pauses the keepalive element - call when playback is fully stopped (not on
  // pause) so the iOS audio session can end cleanly.
  stopSilenceLoop(): void {
    if (this._silentAudio && !this._silentAudio.paused) {
      this._silentAudio.pause()
    }
  }

  // Remove the visibilitychange listener and unregister Media Session handlers.
  // Call this if the app is ever torn down.
  destroy(): void {
    document.removeEventListener('visibilitychange', this._onVisibilityChange)
    this.stopSilenceLoop()
    this.releaseWakeLock()
    if (!('mediaSession' in navigator)) return
    const actions: MediaSessionAction[] = ['play', 'pause', 'stop', 'seekto', 'previoustrack', 'nexttrack']
    for (const action of actions) {
      try { navigator.mediaSession.setActionHandler(action, null) } catch {}
    }
  }

  // Register OS transport controls. The handlers call engine methods directly
  // then fire the onExternal* callbacks so App.ts can update button icons and
  // the 3D orb state.
  private _registerMediaSessionHandlers(): void {
    if (!('mediaSession' in navigator)) return

    const ms = navigator.mediaSession

    ms.setActionHandler('play', () => {
      this._engine.play()
      this.ensureSilenceLoop()
      this.onExternalPlay?.()
    })

    ms.setActionHandler('pause', () => {
      this._engine.pause()
      this.onExternalPause?.()
    })

    ms.setActionHandler('stop', () => {
      this._engine.stop()
      this.onExternalStop?.()
    })

    ms.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) {
        this._engine.seek(details.seekTime)
      }
    })

    ms.setActionHandler('seekbackward', (details) => {
      const skip = details.seekOffset ?? 10
      this._engine.seek(Math.max(0, this._engine.currentTime - skip))
    })

    ms.setActionHandler('seekforward', (details) => {
      const skip = details.seekOffset ?? 10
      this._engine.seek(Math.min(this._engine.duration, this._engine.currentTime + skip))
    })

    ms.setActionHandler('previoustrack', () => {
      // No previous track concept in Slo-Fi, so seek back to the start instead.
      this._engine.seek(0)
    })

    try {
      // 'nexttrack' is not meaningful here. Unregister to hide the button.
      ms.setActionHandler('nexttrack', null)
    } catch {}
  }

  private _toggleFullscreen(): void {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null
      webkitExitFullscreen?: () => Promise<void>
    }
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>
    }

    const isFs = !!document.fullscreenElement || !!doc.webkitFullscreenElement

    if (!isFs) {
      const req = el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.()
      req?.catch(() => {
        // Fullscreen request denied or unsupported (e.g. iOS Safari). Swallow
        // silently so the button never throws a visible error.
      })
    } else {
      const ex = document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.()
      ex?.catch(() => {})
    }
  }

  private _syncFullscreenIcon(btn: HTMLButtonElement): void {
    const doc = document as Document & { webkitFullscreenElement?: Element | null }
    const isFs = !!document.fullscreenElement || !!doc.webkitFullscreenElement

    btn.setAttribute('aria-label', isFs ? 'Exit fullscreen' : 'Enter fullscreen')
    btn.setAttribute('title',      isFs ? 'Exit fullscreen (F)' : 'Enter fullscreen (F)')

    const enter = btn.querySelector<HTMLElement>('#iconFullscreenEnter')
    const exit  = btn.querySelector<HTMLElement>('#iconFullscreenExit')
    if (enter) enter.style.display = isFs ? 'none' : ''
    if (exit)  exit.style.display  = isFs ? ''     : 'none'
  }

  private _vibrate(pattern: number[]): void {
    if (!('vibrate' in navigator)) return
    try { navigator.vibrate(pattern) } catch {}
  }
}
