import { DEFAULTS } from '../config/defaults'
import { AudioEngine } from '../audio/AudioEngine'
import { detectBpm } from '../audio/BpmDetector'
import { detectKey, NOTE_NAMES } from '../audio/KeyDetector'
import type { DetectedKey } from '../audio/KeyDetector'
import { Waveform } from './Waveform'
import type { AnomalySphere } from './AnomalySphere'
import { StarOverlay } from './StarOverlay'
import { PresetController } from './PresetController'
import { EffectsController } from './EffectsController'
import { ExportController } from './ExportController'
import { MobileController } from './MobileController'
import type { AudioParams } from '../types'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export class App {
  private engine = new AudioEngine()
  private waveform: Waveform
  private sphere: AnomalySphere | null = null
  private starOverlay = new StarOverlay()

  // Controllers
  private presets: PresetController
  private effects: EffectsController
  private exporter: ExportController
  private _mobile!: MobileController

  private _isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  // Core DOM refs
  private dropzone = document.getElementById('dropzone')!
  private fileInput = document.getElementById('fileInput') as HTMLInputElement
  private player = document.getElementById('player')!
  private trackName = document.getElementById('trackName')!
  private trackBpm  = document.getElementById('trackBpm')!
  private trackMeta = document.getElementById('trackMeta')!

  private _baseBpm    = 0
  private _detectedKey: DetectedKey | null = null
  private _loopActive = false
  private currentTimeEl = document.getElementById('currentTime')!
  private durationEl = document.getElementById('duration')!
  private playPauseBtn = document.getElementById('playPauseBtn')!
  private stopBtn = document.getElementById('stopBtn')!
  private rewindBtn = document.getElementById('rewindBtn')!
  private loopBtn   = document.getElementById('loopBtn')!
  private speedSlider = document.getElementById('speedSlider') as HTMLInputElement
  private speedValue = document.getElementById('speedValue')!
  private pitchSlider = document.getElementById('pitchSlider') as HTMLInputElement
  private pitchValue = document.getElementById('pitchValue')!
  private reverbSlider = document.getElementById('reverbSlider') as HTMLInputElement
  private reverbValue = document.getElementById('reverbValue')!
  private decaySlider = document.getElementById('decaySlider') as HTMLInputElement
  private decayValue = document.getElementById('decayValue')!
  private roomSlider = document.getElementById('roomSlider') as HTMLInputElement
  private roomValue = document.getElementById('roomValue')!
  private volumeSlider = document.getElementById('volumeSlider') as HTMLInputElement
  private volumeValue = document.getElementById('volumeValue')!

  // Sound drawer refs (merged Audio + Effects)
  private soundDrawer   = document.getElementById('soundDrawer')!
  private soundShowBtn  = document.getElementById('soundShowBtn')!
  private soundCloseBtn = document.getElementById('soundCloseBtn')!

  // Mobile backdrop — shown behind open drawers on phones; tap to close
  private _drawerBackdrop = document.getElementById('drawerBackdrop')!

  // Settings drawer refs
  private settingsDrawer   = document.getElementById('settingsDrawer')!
  private settingsCloseBtn = document.getElementById('settingsCloseBtn')!
  private settingsShowBtn  = document.getElementById('settingsShowBtn')!

  // Help modal refs
  private helpModal    = document.getElementById('help-modal') as HTMLDialogElement
  private helpBtn      = document.getElementById('helpBtn')!
  private helpCloseBtn = document.getElementById('helpCloseBtn')!

  // Playlist state
  private playlist: File[]        = []
  private currentTrackIndex       = -1
  private _dragIndex              = -1
  private _trackMeta              = new Map<number, { duration: number; key: string; bpm: number }>()
  private playlistDrawer          = document.getElementById('playlistDrawer')!
  private playlistCloseBtn        = document.getElementById('playlistCloseBtn')!
  private playlistShowBtn         = document.getElementById('playlistShowBtn')!
  private playlistAddBtn          = document.getElementById('playlistAddBtn')!
  private playlistList            = document.getElementById('playlistList')!
  private playlistCount           = document.getElementById('playlistCount')!

  // Visual settings controls
  private particleCountSlider  = document.getElementById('particleCountSlider') as HTMLInputElement
  private particleCountValue   = document.getElementById('particleCountValue')!
  private orbReactivitySlider  = document.getElementById('orbReactivitySlider') as HTMLInputElement
  private orbReactivityValue   = document.getElementById('orbReactivityValue')!
  private orbGlowSlider        = document.getElementById('orbGlowSlider') as HTMLInputElement
  private orbGlowValue         = document.getElementById('orbGlowValue')!
  private orbSizeSlider        = document.getElementById('orbSizeSlider') as HTMLInputElement
  private orbSizeValue         = document.getElementById('orbSizeValue')!
  private rotationSpeedSlider  = document.getElementById('rotationSpeedSlider') as HTMLInputElement
  private rotationSpeedValue   = document.getElementById('rotationSpeedValue')!
  private bassPulseToggle      = document.getElementById('bassPulseToggle') as HTMLInputElement
  private wireframeToggle      = document.getElementById('wireframeToggle') as HTMLInputElement
  private lightningToggle      = document.getElementById('lightningToggle') as HTMLInputElement
  private crackToggle          = document.getElementById('crackToggle') as HTMLInputElement
  private crystalToggle        = document.getElementById('crystalToggle') as HTMLInputElement
  private glitchToggle         = document.getElementById('glitchToggle') as HTMLInputElement
  private starsSlider          = document.getElementById('starsSlider') as HTMLInputElement
  private starsValue           = document.getElementById('starsValue')!

  private readonly SETTINGS_KEY = 'slofi-settings'

  constructor() {
    this.waveform = new Waveform(document.getElementById('waveform') as HTMLCanvasElement)

    this.presets = new PresetController(this.engine)
    this.effects = new EffectsController(this.engine)
    this.exporter = new ExportController(this.engine)

    this.wireEngineCallbacks()
    this.wireUI()
    this.wireKeyboard()
    this.wireCrossController()
    this.wireSoundPanel()
    this.wireSettingsPanel()
    this.wireHelpModal()
    this.wirePlaylistPanel()
    this._drawerBackdrop.addEventListener('click', () => this.closeAllPanels())
    this.wireSliderTouch()
    this.applyDefaults()
    this.loadSettings()
    this.initAriaValueText()

    // Wire up mobile APIs: Media Session, Fullscreen, Vibration, and
    // AudioContext background recovery via visibilitychange.
    this._mobile = new MobileController(this.engine)
    this._mobile.onExternalPlay  = () => { this.setPlayingState(true);  this.sphere?.start(); this.starOverlay.resume(); void this._mobile.acquireWakeLock() }
    this._mobile.onExternalPause = () => { this.setPlayingState(false); this.sphere?.stop();  this.starOverlay.pause() }
    this._mobile.onExternalStop  = () => {
      this.setPlayingState(false)
      this.waveform.setProgress(0)
      this.currentTimeEl.textContent = '0:00'
      this.sphere?.stop()
      this.starOverlay.pause()
      this._mobile.stopSilenceLoop()
      this._mobile.releaseWakeLock()
    }
    const fsBtn = document.getElementById('fullscreenBtn') as HTMLButtonElement | null
    if (fsBtn) this._mobile.bindFullscreenBtn(fsBtn)
  }

  private wirePlaylistPanel(): void {
    this.playlistCloseBtn.addEventListener('click', () => {
      this.playlistDrawer.classList.remove('panel--visible')
      this._drawerBackdrop.classList.remove('backdrop--visible')
    })
    this.playlistShowBtn.addEventListener('click', () => {
      const isOpen = this.playlistDrawer.classList.contains('panel--visible')
      this.closeAllPanels()
      if (!isOpen) {
        this.playlistDrawer.classList.add('panel--visible')
        this.showBackdrop()
      }
    })
    this.playlistAddBtn.addEventListener('click', () => this.fileInput.click())

    const clearBtn = document.getElementById('playlistClearBtn')
    clearBtn?.addEventListener('click', () => {
      if (!this.playlist.length) return
      this.playlist = []
      this._trackMeta.clear()
      this.currentTrackIndex = -1
      this.engine.stop()
      this.setPlayingState(false)
      this.renderPlaylist()
    })

    const search = document.getElementById('playlistSearch') as HTMLInputElement | null
    search?.addEventListener('input', () => {
      const q = search.value.toLowerCase()
      this.playlistList.querySelectorAll<HTMLElement>('.playlist-item').forEach((li) => {
        const name = li.querySelector('.playlist-item-name')?.textContent?.toLowerCase() ?? ''
        li.style.display = !q || name.includes(q) ? '' : 'none'
      })
    })
  }

  private addFilesToPlaylist(files: File[]): void {
    const audio = files.filter(f => !f.type || f.type.startsWith('audio/'))
    if (!audio.length) return
    this.playlist.push(...audio)
    this.renderPlaylist()
    if (this.currentTrackIndex === -1) {
      void this.switchTrack(0)
    }
  }

  private async switchTrack(index: number, autoPlay = false): Promise<void> {
    if (index < 0 || index >= this.playlist.length) return
    this.currentTrackIndex = index
    this.renderPlaylist()
    // Orb fade-dim: zero reactivity briefly so the orb dims before the new
    // buffer loads, then restore after the load settles (~150ms)
    const reactVal = parseInt(this.orbReactivitySlider.value) / 100
    this.sphere?.setReactivity(0)
    await this.loadFile(this.playlist[index])
    window.setTimeout(() => this.sphere?.setReactivity(reactVal), 150)
    if (autoPlay) {
      try {
        await this.engine.play()
        this.setPlayingState(true)
        this.sphere?.start()
        this.starOverlay.resume()
        this._mobile?.ensureSilenceLoop()
        this._mobile?.updatePlaybackState(true)
        void this._mobile?.acquireWakeLock()
      } catch {
        // AudioContext resume failed (e.g. iOS suspended context without a
        // user gesture). Stay in paused state so the user can tap to resume.
        this.setPlayingState(false)
      }
    }
  }

  private removeTrack(index: number): void {
    this.playlist.splice(index, 1)
    // Rebuild _trackMeta with shifted indices
    const newMeta = new Map<number, { duration: number; key: string; bpm: number }>()
    this._trackMeta.forEach((v, k) => {
      if (k < index)       newMeta.set(k, v)
      else if (k > index)  newMeta.set(k - 1, v)
      // k === index is dropped
    })
    this._trackMeta = newMeta

    if (!this.playlist.length) {
      this.currentTrackIndex = -1
      this.engine.stop()
      this.setPlayingState(false)
      this.renderPlaylist()
      return
    }
    if (index === this.currentTrackIndex) {
      void this.switchTrack(Math.min(index, this.playlist.length - 1))
    } else if (index < this.currentTrackIndex) {
      this.currentTrackIndex--
    }
    this.renderPlaylist()
  }

  private renderPlaylist(): void {
    this.playlistList.innerHTML = ''
    const count = this.playlist.length
    this.playlistCount.textContent = `${count} track${count !== 1 ? 's' : ''}`
    this.playlist.forEach((file, i) => {
      const li     = document.createElement('li')
      const handle = document.createElement('span')
      const info   = document.createElement('div')
      const name   = document.createElement('span')
      const meta   = document.createElement('span')
      const rmBtn  = document.createElement('button')

      li.className = 'playlist-item'
      if (i === this.currentTrackIndex) li.setAttribute('aria-current', 'true')
      li.draggable = true
      li.addEventListener('dragstart', (e) => {
        this._dragIndex = i
        li.classList.add('dragging')
        e.dataTransfer?.setData('text/plain', String(i))
      })
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging')
        this._dragIndex = -1
      })
      li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drag-over') })
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'))
      li.addEventListener('drop', (e) => {
        e.preventDefault()
        li.classList.remove('drag-over')
        this.reorderTrack(this._dragIndex, i)
      })

      handle.className = 'playlist-drag-handle'
      handle.textContent = '☰'
      handle.setAttribute('aria-hidden', 'true')

      const idx = String(i + 1).padStart(2, '0')
      name.className = 'playlist-item-name'
      name.textContent = `${idx}. ${file.name.replace(/\.[^.]+$/, '')}`
      name.title = file.name

      const m = this._trackMeta.get(i)
      const dur = m ? formatTime(m.duration) : '—'
      const key = m?.key ?? '—'
      const bpm = m ? `${Math.round(m.bpm)} BPM` : '—'
      meta.className = 'playlist-item-meta'
      meta.textContent = `${dur} · ${key} · ${bpm}`

      info.className = 'playlist-item-info'
      info.append(name, meta)

      rmBtn.className = 'playlist-item-remove'
      rmBtn.setAttribute('aria-label', `Remove ${file.name}`)
      rmBtn.textContent = '×'
      rmBtn.addEventListener('click', (e) => { e.stopPropagation(); this.removeTrack(i) })

      li.addEventListener('click', () => void this.switchTrack(i, true))
      li.append(handle, info, rmBtn)
      this.playlistList.appendChild(li)
    })
  }

  private reorderTrack(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || to >= this.playlist.length) return
    const [item] = this.playlist.splice(from, 1)
    this.playlist.splice(to, 0, item)
    if (this.currentTrackIndex === from) {
      this.currentTrackIndex = to
    } else if (from < this.currentTrackIndex && to >= this.currentTrackIndex) {
      this.currentTrackIndex--
    } else if (from > this.currentTrackIndex && to <= this.currentTrackIndex) {
      this.currentTrackIndex++
    }
    // Rebuild _trackMeta: apply the same splice to a meta array then re-index
    const metaArr = Array.from({ length: this.playlist.length + 1 }, (_, k) =>
      this._trackMeta.get(k) ?? null)
    const [movedMeta] = metaArr.splice(from, 1)
    metaArr.splice(to, 0, movedMeta)
    this._trackMeta = new Map()
    metaArr.forEach((v, k) => { if (v) this._trackMeta.set(k, v) })
    this.renderPlaylist()
  }

  private wireHelpModal(): void {
    this.helpBtn.addEventListener('click', () => this.helpModal.showModal())
    this.helpCloseBtn.addEventListener('click', () => this.helpModal.close())
    this.helpModal.addEventListener('click', (e) => {
      if (e.target === this.helpModal) this.helpModal.close()
    })
    // Tab switching
    const tabs = this.helpModal.querySelectorAll<HTMLButtonElement>('.help-tab')
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => {
          t.classList.remove('help-tab--active')
          t.setAttribute('aria-selected', 'false')
        })
        tab.classList.add('help-tab--active')
        tab.setAttribute('aria-selected', 'true')
        this.helpModal.querySelectorAll<HTMLElement>('.help-tab-panel').forEach((p) => {
          p.classList.toggle('help-tab-panel--hidden', p.id !== `helpTab-${tab.dataset.tab}`)
        })
      })
    })
  }

  private closeAllPanels(): void {
    this.playlistDrawer.classList.remove('panel--visible')
    this.soundDrawer.classList.remove('panel--visible')
    this.settingsDrawer.classList.remove('panel--visible')
    this.soundShowBtn.classList.remove('btn-controls-show--active')
    this.settingsShowBtn.classList.remove('btn-settings-show--active')
    this._drawerBackdrop.classList.remove('backdrop--visible')
  }

  private showBackdrop(): void {
    if (this._isMobile) this._drawerBackdrop.classList.add('backdrop--visible')
  }

  // iOS Safari does not fire input events from touch on range inputs that have
  // -webkit-appearance:none, even with touch-action:none set in CSS.
  // This method adds touch→value bridge listeners to every .slider so dragging
  // on mobile produces the same input events as mouse drag on desktop.
  private wireSliderTouch(): void {
    // Touch Events are more reliable than Pointer Events for <input type="range">
    // on iOS Safari. iOS has a native range gesture handler that conflicts with
    // setPointerCapture(). Using touchmove with { passive: false } + preventDefault
    // takes full ownership of the touch — the browser won't try to scroll or do
    // its own range handling.
    document.querySelectorAll<HTMLInputElement>('.slider').forEach((slider) => {
      const readTouch = (e: TouchEvent) => {
        const touch = e.touches[0]
        if (!touch) return
        const rect  = slider.getBoundingClientRect()
        const min   = parseFloat(slider.min  || '0')
        const max   = parseFloat(slider.max  || '100')
        const step  = parseFloat(slider.step || '1')
        const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width))
        const raw   = min + ratio * (max - min)
        const val   = Math.max(min, Math.min(max, Math.round(raw / step) * step))
        slider.value = String(val)
        slider.dispatchEvent(new Event('input', { bubbles: true }))
      }
      // touchstart: passive ok — just record initial position, no scroll risk
      slider.addEventListener('touchstart', readTouch, { passive: true })
      // touchmove: NON-passive so preventDefault() can stop iOS from scrolling
      // the drawer while the user drags a slider horizontally
      slider.addEventListener('touchmove', (e: TouchEvent) => {
        e.preventDefault()
        readTouch(e)
      }, { passive: false })
    })
  }

  private wireSoundPanel(): void {
    this.soundShowBtn.addEventListener('click', () => {
      const isOpen = this.soundDrawer.classList.contains('panel--visible')
      this.closeAllPanels()
      if (!isOpen) {
        this.soundDrawer.classList.add('panel--visible')
        this.soundShowBtn.classList.add('btn-controls-show--active')
        this.showBackdrop()
      }
    })
    this.soundCloseBtn.addEventListener('click', () => {
      this.soundDrawer.classList.remove('panel--visible')
      this.soundShowBtn.classList.remove('btn-controls-show--active')
      this._drawerBackdrop.classList.remove('backdrop--visible')
    })
    this.soundDrawer.querySelectorAll<HTMLButtonElement>('.sound-tab').forEach((tab) => {
      tab.addEventListener('click', () =>
        this.switchSoundTab(tab.dataset.tab as 'audio' | 'effects'))
    })
  }

  private switchSoundTab(tab: 'audio' | 'effects'): void {
    this.soundDrawer.querySelectorAll<HTMLElement>('.sound-tab').forEach((t) => {
      const isActive = t.dataset.tab === tab
      t.classList.toggle('sound-tab--active', isActive)
      t.setAttribute('aria-selected', String(isActive))
    })
    this.soundDrawer.querySelectorAll<HTMLElement>('.sound-tab-panel').forEach((p) => {
      p.classList.toggle('sound-tab-panel--hidden', p.id !== `soundTab-${tab}`)
    })
  }

  private wireSettingsPanel(): void {
    this.settingsCloseBtn.addEventListener('click', () => {
      this.settingsDrawer.classList.remove('panel--visible')
      this.settingsShowBtn.classList.remove('btn-settings-show--active')
      this._drawerBackdrop.classList.remove('backdrop--visible')
    })
    this.settingsShowBtn.addEventListener('click', () => {
      const isOpen = this.settingsDrawer.classList.contains('panel--visible')
      if (isOpen) {
        this.settingsDrawer.classList.remove('panel--visible')
        this.settingsShowBtn.classList.remove('btn-settings-show--active')
      } else {
        this.settingsDrawer.classList.add('panel--visible')
        this.settingsShowBtn.classList.add('btn-settings-show--active')
        this.showBackdrop()
      }
    })
    this.settingsDrawer.querySelectorAll<HTMLButtonElement>('.theme-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        this.applyTheme(chip.dataset.theme ?? 'prism')
      })
    })
  }

  private wireCrossController(): void {
    this.presets.onPresetApplied = (params: AudioParams) => {
      this.syncSlidersToParams(params)
      this.effects.syncToParams(params)
      this.sphere?.setSpeed(params.playbackRate)
      this.sphere?.setReverb(params.reverbMix)
      this.saveSettings()
    }
    this.presets.onThemeApplied = (theme: string) => {
      this.applyTheme(theme)
    }
    this.presets.onVisualApplied = (visual) => {
      if (visual.reactivity    !== undefined) { this.orbReactivitySlider.value = String(Math.round(visual.reactivity * 100));       this.orbReactivityValue.textContent = `${Math.round(visual.reactivity * 100)}%`;    this.sphere?.setReactivity(visual.reactivity) }
      if (visual.glow          !== undefined) { this.orbGlowSlider.value       = String(Math.round(visual.glow * 100));             this.orbGlowValue.textContent       = `${Math.round(visual.glow * 100)}%`;          this.sphere?.setGlow(visual.glow) }
      if (visual.orbSize       !== undefined) { this.orbSizeSlider.value        = String(Math.round(visual.orbSize * 100));          this.orbSizeValue.textContent        = `${Math.round(visual.orbSize * 100)}%`;        this.sphere?.setOrbSize(visual.orbSize) }
      if (visual.rotationSpeed !== undefined) { this.rotationSpeedSlider.value  = String(Math.round(visual.rotationSpeed * 100));    this.rotationSpeedValue.textContent  = `${visual.rotationSpeed.toFixed(1)}×`;         this.sphere?.setRotationSpeed(visual.rotationSpeed) }
      if (visual.stars         !== undefined) { this.starsSlider.value          = String(Math.round(visual.stars * 100));            this.starsValue.textContent          = `${Math.round(visual.stars * 100)}%`;          this.sphere?.setStarBrightness(visual.stars) }
      if (visual.particleCount !== undefined) { this.particleCountSlider.value  = String(visual.particleCount);                      this.particleCountValue.textContent  = String(visual.particleCount);                   this.sphere?.setParticleCount(visual.particleCount) }
      if (visual.wireframe     !== undefined) { this.wireframeToggle.checked    = visual.wireframe;    this.sphere?.setWireframe(visual.wireframe) }
      if (visual.bassPulse     !== undefined) { this.bassPulseToggle.checked    = visual.bassPulse;    this.sphere?.setBassPulse(visual.bassPulse) }
      if (visual.lightning     !== undefined) { this.lightningToggle.checked    = visual.lightning;    this.sphere?.setLightning(visual.lightning) }
      if (visual.crack         !== undefined) { this.crackToggle.checked        = visual.crack;        this.sphere?.setCrack(visual.crack) }
      if (visual.crystal       !== undefined) { this.crystalToggle.checked      = visual.crystal;      this.sphere?.setCrystal(visual.crystal) }
      if (visual.glitch        !== undefined) { this.glitchToggle.checked       = visual.glitch;       this.sphere?.setGlitch(visual.glitch) }
      this.saveSettings()
    }
    this.effects.onChanged = () => {
      this.presets.clearActive()
    }
    this.effects.on8DChange = (enabled, _speed) => {
      this.sphere?.set8DMode(enabled)
      if (!enabled) this.sphere?.set8DAngle(0)
    }
    // Keep the orb rotation in sync with the 8D panner angle every animation frame
    this.engine.on8DAngleUpdate = (angle) => {
      this.sphere?.set8DAngle(angle)
    }
  }

  private wireEngineCallbacks(): void {
    this.engine.onEnded = () => {
      this.setPlayingState(false)
      this.waveform.setProgress(0)
      this.sphere?.stop()
      this.starOverlay.pause()
      // Auto-advance to next track and start playback immediately.
      // Keep the silence loop running during the decode gap so the iOS audio
      // session stays alive — only stop it when the playlist is fully done.
      const next = this.currentTrackIndex + 1
      if (next < this.playlist.length) {
        void this.switchTrack(next, true)
      } else {
        // No more tracks — stop the keepalive and release the wake lock.
        this._mobile?.stopSilenceLoop()
        this._mobile?.releaseWakeLock()
      }
    }
    this.engine.onTimeUpdate = (current, duration) => {
      this.currentTimeEl.textContent = formatTime(current)
      if (duration > 0) {
        this.waveform.setProgress(current / duration)
        // Keep the lock screen position scrubber moving in real time
        this._mobile?.updatePlaybackState(this.engine.isPlaying)
      }
    }
    this.engine.onLoopCycle = () => {
      this.sphere?.triggerLoopPulse()
    }
  }

  private wireUI(): void {
    // Drop zone
    this.dropzone.addEventListener('click', () => this.fileInput.click())
    this.dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.fileInput.click()
    })
    this.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault()
      this.dropzone.classList.add('drag-over')
    })
    this.dropzone.addEventListener('dragleave', () => {
      this.dropzone.classList.remove('drag-over')
    })
    this.dropzone.addEventListener('drop', (e) => {
      e.preventDefault()
      this.dropzone.classList.remove('drag-over')
      const files = e.dataTransfer?.files
      if (files && files.length > 0) this.addFilesToPlaylist(Array.from(files))
    })
    this.fileInput.addEventListener('change', () => {
      const files = this.fileInput.files
      if (files && files.length > 0) {
        this.addFilesToPlaylist(Array.from(files))
        // Reset so the same file(s) can be added again later
        this.fileInput.value = ''
      }
    })

    // Transport
    this.playPauseBtn.addEventListener('click', () => this.togglePlayPause())
    this.stopBtn.addEventListener('click', () => {
      this.engine.stop()
      this.setPlayingState(false)
      this.waveform.setProgress(0)
      this.currentTimeEl.textContent = '0:00'
      this.sphere?.stop()
      this.starOverlay.pause()
      this._mobile?.stopSilenceLoop()
      this._mobile?.releaseWakeLock()
    })
    this.rewindBtn.addEventListener('click', () => {
      this.engine.seek(Math.max(0, this.engine.currentTime - 5))
    })

    // Waveform seek
    this.waveform.onSeek = (ratio) => {
      this.engine.seek(ratio * this.engine.duration)
      this._mobile?.hapticSeek()
    }

    // Waveform loop handle drag
    this.waveform.onLoopChange = (start, end) => {
      this.engine.setLoop(start * this.engine.duration, end * this.engine.duration)
    }

    // Loop toggle button
    this.loopBtn.addEventListener('click', () => {
      this._loopActive = !this._loopActive
      this.engine.setLoopEnabled(this._loopActive)
      this.waveform.setLoopEnabled(this._loopActive)
      this.loopBtn.classList.toggle('btn-loop--active', this._loopActive)
      this.loopBtn.setAttribute('aria-label', this._loopActive ? 'Disable loop' : 'Enable loop')
      this.loopBtn.setAttribute('aria-pressed', String(this._loopActive))
    })

    // Speed
    this.speedSlider.addEventListener('input', () => {
      const rate = parseInt(this.speedSlider.value) / 100
      this.engine.setPlaybackRate(rate)
      this.speedValue.textContent = `${rate.toFixed(2)}x`
      this.speedSlider.setAttribute('aria-valuetext', `${rate.toFixed(2)}x`)
      this.sphere?.setSpeed(rate)
      this.presets.clearActive()
      this.updateBpmDisplay()
      this.saveSettings()
    })

    // Pitch
    this.pitchSlider.addEventListener('input', () => {
      const st = parseInt(this.pitchSlider.value)
      this.engine.setPitch(st)
      this.pitchValue.textContent = st === 0 ? '0 st' : `${st > 0 ? '+' : ''}${st} st`
      this.pitchSlider.setAttribute('aria-valuetext', st === 0 ? '0 semitones' : `${st > 0 ? '+' : ''}${st} semitones`)
      this.presets.clearActive()
      this.updateBpmDisplay()
      this.saveSettings()
    })

    // Reverb mix
    this.reverbSlider.addEventListener('input', () => {
      const mix = parseInt(this.reverbSlider.value) / 100
      this.engine.setReverbMix(mix)
      this.reverbValue.textContent = `${this.reverbSlider.value}%`
      this.reverbSlider.setAttribute('aria-valuetext', `${this.reverbSlider.value}%`)
      this.sphere?.setReverb(mix)
      this.presets.clearActive()
      this.saveSettings()
    })

    // Decay
    this.decaySlider.addEventListener('input', () => {
      const decay = parseInt(this.decaySlider.value) / 10
      this.engine.setReverbDecay(decay)
      this.decayValue.textContent = `${decay.toFixed(1)}s`
      this.decaySlider.setAttribute('aria-valuetext', `${decay.toFixed(1)} seconds`)
      this.presets.clearActive()
      this.saveSettings()
    })

    // Room size
    this.roomSlider.addEventListener('input', () => {
      const size = parseInt(this.roomSlider.value) / 100
      this.engine.setReverbRoomSize(size)
      this.roomValue.textContent = `${this.roomSlider.value}%`
      this.roomSlider.setAttribute('aria-valuetext', `${this.roomSlider.value}%`)
      this.presets.clearActive()
      this.saveSettings()
    })

    // Volume
    this.volumeSlider.addEventListener('input', () => {
      const vol = parseInt(this.volumeSlider.value) / 100
      this.engine.setVolume(vol)
      this.volumeValue.textContent = `${this.volumeSlider.value}%`
      this.volumeSlider.setAttribute('aria-valuetext', `${this.volumeSlider.value}%`)
      this.saveSettings()
    })

    // Visual settings — particle count
    this.particleCountSlider.addEventListener('change', () => {
      const n = parseInt(this.particleCountSlider.value)
      this.sphere?.setParticleCount(n)
      this.particleCountValue.textContent = String(n)
      this.saveSettings()
    })

    // Visual settings — orb reactivity
    this.orbReactivitySlider.addEventListener('input', () => {
      const v = parseInt(this.orbReactivitySlider.value) / 100
      this.sphere?.setReactivity(v)
      this.orbReactivityValue.textContent = `${this.orbReactivitySlider.value}%`
      this.saveSettings()
    })

    // Visual settings — orb glow
    this.orbGlowSlider.addEventListener('input', () => {
      const v = parseInt(this.orbGlowSlider.value) / 100
      this.sphere?.setGlow(v)
      this.orbGlowValue.textContent = `${this.orbGlowSlider.value}%`
      this.saveSettings()
    })

    // Visual settings — orb size
    this.orbSizeSlider.addEventListener('input', () => {
      const v = parseInt(this.orbSizeSlider.value) / 100
      this.sphere?.setOrbSize(v)
      this.orbSizeValue.textContent = `${this.orbSizeSlider.value}%`
      this.saveSettings()
    })

    // Visual settings — rotation speed
    this.rotationSpeedSlider.addEventListener('input', () => {
      const v = parseInt(this.rotationSpeedSlider.value) / 100
      this.sphere?.setRotationSpeed(v)
      this.rotationSpeedValue.textContent = `${v.toFixed(1)}×`
      this.saveSettings()
    })

    // Visual settings — bass pulse toggle
    this.bassPulseToggle.addEventListener('change', () => {
      this.sphere?.setBassPulse(this.bassPulseToggle.checked)
      this.saveSettings()
    })

    // Visual settings — wireframe toggle
    this.wireframeToggle.addEventListener('change', () => {
      this.sphere?.setWireframe(this.wireframeToggle.checked)
      this.saveSettings()
    })

    // Visual settings — orb effect toggles
    this.lightningToggle.addEventListener('change', () => {
      this.sphere?.setLightning(this.lightningToggle.checked)
      this.saveSettings()
    })
    this.crackToggle.addEventListener('change', () => {
      this.sphere?.setCrack(this.crackToggle.checked)
      this.saveSettings()
    })
    this.crystalToggle.addEventListener('change', () => {
      this.sphere?.setCrystal(this.crystalToggle.checked)
      this.saveSettings()
    })
    this.glitchToggle.addEventListener('change', () => {
      this.sphere?.setGlitch(this.glitchToggle.checked)
      this.saveSettings()
    })

    // Visual settings — star brightness
    this.starsSlider.addEventListener('input', () => {
      const v = parseInt(this.starsSlider.value) / 100
      this.sphere?.setStarBrightness(v)
      this.starsValue.textContent = `${this.starsSlider.value}%`
      this.saveSettings()
    })
  }

  private wireKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement).tagName
      // ? key opens help regardless of whether a file is loaded
      if (e.key === '?' && tag !== 'INPUT') {
        e.preventDefault()
        this.helpModal.showModal()
        return
      }

      if (!this.engine.hasBuffer) return
      if (tag === 'INPUT') return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          this.togglePlayPause()
          break
        case 'ArrowLeft':
          e.preventDefault()
          this.engine.seek(Math.max(0, this.engine.currentTime - 5))
          break
        case 'ArrowRight':
          e.preventDefault()
          this.engine.seek(Math.min(this.engine.duration, this.engine.currentTime + 5))
          break
        case 's':
        case 'S':
          this.engine.stop()
          this.setPlayingState(false)
          this.waveform.setProgress(0)
          this.sphere?.stop()
          this.starOverlay.pause()
          break
        case 'l':
        case 'L':
          this.loopBtn.click()
          break
        case 'f':
        case 'F':
          ;(document.getElementById('fullscreenBtn') as HTMLButtonElement | null)?.click()
          break
        case 'n':
        case 'N':
          if (this.currentTrackIndex < this.playlist.length - 1)
            void this.switchTrack(this.currentTrackIndex + 1, true)
          break
        case 'p':
        case 'P':
          if (this.currentTrackIndex > 0)
            void this.switchTrack(this.currentTrackIndex - 1, true)
          break
        case '1': case '2': case '3': case '4': case '5': {
          const idx = parseInt(e.key) - 1
          const presetBtn = document.querySelectorAll<HTMLButtonElement>('.preset-card')[idx]
          presetBtn?.click()
          break
        }
      }
    })
    // Volume shortcuts — work without a file loaded
    document.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === '[') {
        const v = Math.max(0, parseInt(this.volumeSlider.value) - 10)
        this.volumeSlider.value = String(v)
        this.volumeSlider.dispatchEvent(new Event('input'))
      } else if (e.key === ']') {
        const v = Math.min(100, parseInt(this.volumeSlider.value) + 10)
        this.volumeSlider.value = String(v)
        this.volumeSlider.dispatchEvent(new Event('input'))
      }
    })
  }

  private async loadFile(file: File): Promise<void> {
    const content = this.dropzone.querySelector<HTMLElement>('.dropzone-content')!
    const title   = this.dropzone.querySelector<HTMLElement>('.dropzone-title')!

    const showDropzoneError = (message: string): void => {
      title.textContent = message
      content.classList.add('error')
      setTimeout(() => {
        title.textContent = 'Drop your audio file here'
        content.classList.remove('error')
      }, 3000)
    }

    if (file.type && !file.type.startsWith('audio/')) {
      showDropzoneError('Please drop an audio file.')
      return
    }

    this.dropzone.classList.add('loading')
    title.textContent = 'Decoding audio...'

    // Isolate the decode step so that any UI/visual error that follows is
    // NOT misreported as "Could not decode this file."
    try {
      await this.engine.loadFile(file)
    } catch (err) {
      console.error('Failed to decode audio:', err)
      showDropzoneError('Could not decode this file. Try a different format.')
      this.dropzone.classList.remove('loading')
      return
    }

    // Audio decoded successfully — set up the UI.
    try {
      // Show the player first so the canvases have real CSS dimensions before
      // we resize and draw into them.
      this.showPlayer()
      this.setPlayingState(false)

      this.waveform.resize()
      const waveData = this.engine.getWaveform(400)
      this.waveform.setData(waveData)
      this.waveform.setProgress(0)

      // Reset loop state for the new file
      this._loopActive = false
      this.engine.setLoop(0, this.engine.duration)
      this.engine.setLoopEnabled(false)
      this.waveform.setLoop(0, 1)
      this.waveform.setLoopEnabled(false)
      this.loopBtn.classList.remove('btn-loop--active')
      this.loopBtn.setAttribute('aria-label', 'Enable loop')
      this.loopBtn.setAttribute('aria-pressed', 'false')

      const baseName = file.name.replace(/\.[^.]+$/, '')
      this.trackName.textContent = baseName
      this.exporter.trackName = baseName
      // Push the track title to the OS lock screen / notification card
      this._mobile.setMediaSessionMetadata(baseName)

      this._baseBpm  = detectBpm(this.engine.getBuffer()!)
      this._detectedKey = detectKey(this.engine.getBuffer()!)
      this.updateBpmDisplay()

      // Store metadata for the current playlist track and refresh the playlist
      // so the duration/key/BPM row updates from "—" to real values.
      if (this.currentTrackIndex >= 0) {
        this._trackMeta.set(this.currentTrackIndex, {
          duration: this.engine.duration,
          key:      this._detectedKey
            ? `${NOTE_NAMES[this._detectedKey.root]} ${this._detectedKey.mode}`
            : '—',
          bpm:      this._baseBpm,
        })
        this.renderPlaylist()
      }

      this.trackMeta.textContent = `${formatTime(this.engine.duration)} · ${formatBytes(file.size)} · ${file.type || 'audio'}`
      this.durationEl.textContent = formatTime(this.engine.duration)
      this.currentTimeEl.textContent = '0:00'
    } catch (uiErr) {
      console.error('UI setup error after audio load (non-fatal):', uiErr)
    } finally {
      this.dropzone.classList.remove('loading')
    }

    if (!this.sphere && this.engine.analyserNode) {
      try {
        const { AnomalySphere } = await import('./AnomalySphere')
        this.sphere = new AnomalySphere(
          document.getElementById('anomaly') as HTMLElement,
          this.engine.analyserNode,
        )
        this.sphere.onEnergyUpdate = (bass, mid, treble, uiBass, uiTreble) => {
          // On mobile, skip CSS var updates entirely — setProperty() on aurora vars
          // triggers a full style-recalc + GPU compositor repaint on every
          // backdrop-filter layer (6+) each frame, which is the primary cause of
          // iOS OOM crashes during long playback. The aurora animates via @keyframes
          // on mobile instead (see main.css .aurora-idle).
          if (!this._isMobile) {
            const root = document.documentElement.style
            root.setProperty('--aurora-bass',   String(bass.toFixed(3)))
            root.setProperty('--aurora-mid',    String(mid.toFixed(3)))
            root.setProperty('--aurora-treble', String(treble.toFixed(3)))
            root.setProperty('--ui-bass',       String(uiBass.toFixed(3)))
            root.setProperty('--ui-treble',     String(uiTreble.toFixed(3)))
          }
          this.starOverlay.setTreble(treble)
        }
        // Sync slider/toggle defaults to sphere immediately after construction so the
        // sphere reflects the HTML default values without requiring user interaction.
        this.sphere.setReactivity(parseInt(this.orbReactivitySlider.value) / 100)
        this.sphere.setOrbSize(parseInt(this.orbSizeSlider.value) / 100)
        this.sphere.setGlow(parseInt(this.orbGlowSlider.value) / 100)
        this.sphere.setRotationSpeed(parseInt(this.rotationSpeedSlider.value) / 100)
        this.sphere.setBassPulse(this.bassPulseToggle.checked)
        this.sphere.setWireframe(this.wireframeToggle.checked)
        this.sphere.setLightning(this.lightningToggle.checked)
        this.sphere.setCrack(this.crackToggle.checked)
        this.sphere.setCrystal(this.crystalToggle.checked)
        this.sphere.setGlitch(this.glitchToggle.checked)
        this.sphere.setParticleCount(parseInt(this.particleCountSlider.value))
        this.sphere.setStarBrightness(parseInt(this.starsSlider.value) / 100)
      } catch (sphereErr) {
        console.error('3D sphere unavailable (WebGL may not be supported):', sphereErr)
      }
    }
  }

  private syncSlidersToParams(params: AudioParams): void {
    this.speedSlider.value = String(Math.round(params.playbackRate * 100))
    this.speedValue.textContent = `${params.playbackRate.toFixed(2)}x`
    this.updateBpmDisplay()

    const st = params.pitchSemitones
    this.pitchSlider.value = String(st)
    this.pitchValue.textContent = st === 0 ? '0 st' : `${st > 0 ? '+' : ''}${st} st`

    this.reverbSlider.value = String(Math.round(params.reverbMix * 100))
    this.reverbValue.textContent = `${Math.round(params.reverbMix * 100)}%`

    this.decaySlider.value = String(Math.round(params.reverbDecay * 10))
    this.decayValue.textContent = `${params.reverbDecay.toFixed(1)}s`

    this.roomSlider.value = String(Math.round(params.reverbRoomSize * 100))
    this.roomValue.textContent = `${Math.round(params.reverbRoomSize * 100)}%`

    this.volumeSlider.value = String(Math.round(params.volume * 100))
    this.volumeValue.textContent = `${Math.round(params.volume * 100)}%`

    this.notifyParamChange()
  }

  private notifyParamChange(): void { /* hook point for future param-change listeners */ }

  private initAriaValueText(): void {
    const rate = parseInt(this.speedSlider.value) / 100
    this.speedSlider.setAttribute('aria-valuetext', `${rate.toFixed(2)}x`)

    const st = parseInt(this.pitchSlider.value)
    this.pitchSlider.setAttribute('aria-valuetext', st === 0 ? '0 semitones' : `${st > 0 ? '+' : ''}${st} semitones`)

    this.reverbSlider.setAttribute('aria-valuetext', `${this.reverbSlider.value}%`)

    const decay = parseInt(this.decaySlider.value) / 10
    this.decaySlider.setAttribute('aria-valuetext', `${decay.toFixed(1)} seconds`)

    this.roomSlider.setAttribute('aria-valuetext', `${this.roomSlider.value}%`)
    this.volumeSlider.setAttribute('aria-valuetext', `${this.volumeSlider.value}%`)
  }

  // Apply defaults.ts values to all sliders and engine state.
  // Runs before loadSettings() so user-saved localStorage always wins.
  private applyDefaults(): void {
    const d = DEFAULTS

    this.applyTheme(d.colorTheme)

    this.speedSlider.value       = String(Math.round(d.speed * 100))
    this.speedValue.textContent  = `${d.speed.toFixed(2)}x`
    this.engine.setPlaybackRate(d.speed)

    this.pitchSlider.value       = String(d.pitch)
    this.pitchValue.textContent  = d.pitch === 0 ? '0 st' : `${d.pitch > 0 ? '+' : ''}${d.pitch} st`
    this.engine.setPitch(d.pitch)

    this.reverbSlider.value      = String(Math.round(d.reverbMix * 100))
    this.reverbValue.textContent = `${Math.round(d.reverbMix * 100)}%`
    this.engine.setReverbMix(d.reverbMix)

    this.decaySlider.value       = String(Math.round(d.reverbDecay * 10))
    this.decayValue.textContent  = `${d.reverbDecay.toFixed(1)}s`
    this.engine.setReverbDecay(d.reverbDecay)

    this.roomSlider.value        = String(Math.round(d.reverbRoomSize * 100))
    this.roomValue.textContent   = `${Math.round(d.reverbRoomSize * 100)}%`
    this.engine.setReverbRoomSize(d.reverbRoomSize)

    this.volumeSlider.value      = String(Math.round(d.volume * 100))
    this.volumeValue.textContent = `${Math.round(d.volume * 100)}%`
    this.engine.setVolume(d.volume)

    this.orbReactivitySlider.value      = String(Math.round(d.reactivity * 100))
    this.orbReactivityValue.textContent = `${Math.round(d.reactivity * 100)}%`

    this.orbGlowSlider.value      = String(Math.round(d.glow * 100))
    this.orbGlowValue.textContent = `${Math.round(d.glow * 100)}%`

    this.orbSizeSlider.value      = String(Math.round(d.orbSize * 100))
    this.orbSizeValue.textContent = `${Math.round(d.orbSize * 100)}%`

    this.rotationSpeedSlider.value      = String(Math.round(d.rotationSpeed * 100))
    this.rotationSpeedValue.textContent = `${d.rotationSpeed.toFixed(1)}×`

    this.particleCountSlider.value      = String(d.particleCount)
    this.particleCountValue.textContent = String(d.particleCount)

    this.starsSlider.value      = String(Math.round(d.stars * 100))
    this.starsValue.textContent = `${Math.round(d.stars * 100)}%`

    this.wireframeToggle.checked  = d.wireframe
    this.bassPulseToggle.checked  = d.bassPulse
    this.lightningToggle.checked  = d.lightning
    this.crackToggle.checked      = d.crack
    this.crystalToggle.checked    = d.crystal
    this.glitchToggle.checked     = d.glitch
  }

  private saveSettings(): void {
    const settings = {
      theme:        document.documentElement.dataset.theme ?? 'prism',
      speed:        this.speedSlider.value,
      pitch:        this.pitchSlider.value,
      reverb:       this.reverbSlider.value,
      decay:        this.decaySlider.value,
      room:         this.roomSlider.value,
      volume:       this.volumeSlider.value,
      particleCount: this.particleCountSlider.value,
      orbReactivity: this.orbReactivitySlider.value,
      orbGlow:      this.orbGlowSlider.value,
      orbSize:      this.orbSizeSlider.value,
      rotationSpeed: this.rotationSpeedSlider.value,
      bassPulse:    this.bassPulseToggle.checked,
      wireframe:    this.wireframeToggle.checked,
      lightning:    this.lightningToggle.checked,
      crack:        this.crackToggle.checked,
      crystal:      this.crystalToggle.checked,
      glitch:       this.glitchToggle.checked,
      stars:        this.starsSlider.value,
    }
    try { localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings)) } catch { /* quota */ }
  }

  private loadSettings(): void {
    let s: Record<string, unknown>
    try {
      const raw = localStorage.getItem(this.SETTINGS_KEY)
      if (!raw) return
      s = JSON.parse(raw) as Record<string, unknown>
    } catch { return }

    const str  = (v: unknown, fb: string)  => typeof v === 'string'  ? v  : fb
    const bool = (v: unknown, fb: boolean) => typeof v === 'boolean' ? v  : fb

    if (s['theme'] !== undefined) this.applyTheme(str(s['theme'], 'prism'))

    // Audio sliders — restore DOM value + display text + engine state.
    // isFinite() guards prevent NaN from reaching the engine (which would
    // cause buildIR() to throw InvalidStateError on ctx.createBuffer(2, NaN)).
    if (s['speed'] !== undefined) {
      this.speedSlider.value = str(s['speed'], this.speedSlider.value)
      const rate = parseInt(this.speedSlider.value) / 100
      this.speedValue.textContent = `${rate.toFixed(2)}x`
      if (isFinite(rate)) this.engine.setPlaybackRate(rate)
    }
    if (s['pitch'] !== undefined) {
      this.pitchSlider.value = str(s['pitch'], this.pitchSlider.value)
      const st = parseInt(this.pitchSlider.value)
      this.pitchValue.textContent = st === 0 ? '0 st' : `${st > 0 ? '+' : ''}${st} st`
      if (isFinite(st)) this.engine.setPitch(st)
    }
    if (s['reverb'] !== undefined) {
      this.reverbSlider.value = str(s['reverb'], this.reverbSlider.value)
      this.reverbValue.textContent = `${this.reverbSlider.value}%`
      const mix = parseInt(this.reverbSlider.value) / 100
      if (isFinite(mix)) this.engine.setReverbMix(mix)
    }
    if (s['decay'] !== undefined) {
      this.decaySlider.value = str(s['decay'], this.decaySlider.value)
      const decay = parseInt(this.decaySlider.value) / 10
      this.decayValue.textContent = `${decay.toFixed(1)}s`
      if (isFinite(decay)) this.engine.setReverbDecay(decay)
    }
    if (s['room'] !== undefined) {
      this.roomSlider.value = str(s['room'], this.roomSlider.value)
      this.roomValue.textContent = `${this.roomSlider.value}%`
      const room = parseInt(this.roomSlider.value) / 100
      if (isFinite(room)) this.engine.setReverbRoomSize(room)
    }
    if (s['volume'] !== undefined) {
      this.volumeSlider.value = str(s['volume'], this.volumeSlider.value)
      this.volumeValue.textContent = `${this.volumeSlider.value}%`
      const vol = parseInt(this.volumeSlider.value) / 100
      if (isFinite(vol)) this.engine.setVolume(vol)
    }

    // Visual settings — restore DOM only (sphere reads these when created in loadFile)
    if (s['particleCount'] !== undefined) {
      this.particleCountSlider.value = str(s['particleCount'], this.particleCountSlider.value)
      this.particleCountValue.textContent = this.particleCountSlider.value
    }
    if (s['orbReactivity'] !== undefined) {
      this.orbReactivitySlider.value = str(s['orbReactivity'], this.orbReactivitySlider.value)
      this.orbReactivityValue.textContent = `${this.orbReactivitySlider.value}%`
    }
    if (s['orbGlow'] !== undefined) {
      this.orbGlowSlider.value = str(s['orbGlow'], this.orbGlowSlider.value)
      this.orbGlowValue.textContent = `${this.orbGlowSlider.value}%`
    }
    if (s['orbSize'] !== undefined) {
      this.orbSizeSlider.value = str(s['orbSize'], this.orbSizeSlider.value)
      this.orbSizeValue.textContent = `${this.orbSizeSlider.value}%`
    }
    if (s['rotationSpeed'] !== undefined) {
      this.rotationSpeedSlider.value = str(s['rotationSpeed'], this.rotationSpeedSlider.value)
      const v = parseInt(this.rotationSpeedSlider.value) / 100
      this.rotationSpeedValue.textContent = `${v.toFixed(1)}×`
    }
    if (s['bassPulse'] !== undefined)  this.bassPulseToggle.checked  = bool(s['bassPulse'],  this.bassPulseToggle.checked)
    if (s['wireframe'] !== undefined)  this.wireframeToggle.checked  = bool(s['wireframe'],  this.wireframeToggle.checked)
    if (s['lightning'] !== undefined)  this.lightningToggle.checked  = bool(s['lightning'],  this.lightningToggle.checked)
    if (s['crack'] !== undefined)      this.crackToggle.checked      = bool(s['crack'],      this.crackToggle.checked)
    if (s['crystal'] !== undefined)    this.crystalToggle.checked    = bool(s['crystal'],    this.crystalToggle.checked)
    if (s['glitch'] !== undefined)     this.glitchToggle.checked     = bool(s['glitch'],     this.glitchToggle.checked)
    if (s['stars'] !== undefined) {
      this.starsSlider.value = str(s['stars'], this.starsSlider.value)
      this.starsValue.textContent = `${this.starsSlider.value}%`
    }
  }

  private applyTheme(theme: string): void {
    this.settingsDrawer.querySelectorAll('.theme-chip').forEach(c => c.classList.remove('theme-chip--active'))
    const chip = this.settingsDrawer.querySelector<HTMLButtonElement>(`.theme-chip[data-theme="${theme}"]`)
    chip?.classList.add('theme-chip--active')
    if (theme === 'prism') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.dataset.theme = theme
    }
    this.sphere?.setColorTheme(theme)
    this.saveSettings()
    // Redraw immediately so the new theme's CSS colour vars are picked up.
    this.waveform.redraw()
  }

  private updateBpmDisplay(): void {
    if (!this._baseBpm) { this.trackBpm.textContent = ''; return }
    const displayed = Math.round(this._baseBpm * this.engine.getParams().playbackRate)
    let key = ''
    if (this._detectedKey) {
      const shift = this.engine.getParams().pitchSemitones
      const transposedRoot = ((this._detectedKey.root + shift) % 12 + 12) % 12
      key = ` · ${NOTE_NAMES[transposedRoot]} ${this._detectedKey.mode}`
    }
    const text = `${displayed} BPM${key}`
    this.trackBpm.textContent = text
    // Announce BPM/key changes to screen readers via the sr-only live region
    const statusEl = document.getElementById('trackStatus')
    if (statusEl) statusEl.textContent = text
  }

  private async togglePlayPause(): Promise<void> {
    if (this.engine.isPlaying) {
      this.engine.pause()
      this.setPlayingState(false)
      this.sphere?.stop()
      this.starOverlay.pause()
      this._mobile.hapticPause()
      this._mobile.updatePlaybackState(false)
      // Keep the silence loop running during pause so the iOS audio session
      // and lock screen controls stay visible while the track is paused.
    } else {
      try {
        await this.engine.play()
        this.setPlayingState(true)
        this.sphere?.start()
        this.starOverlay.resume()
        this._mobile.hapticPlay()
        this._mobile.updatePlaybackState(true)
        this._mobile.ensureSilenceLoop()
        void this._mobile.acquireWakeLock()
      } catch {
        // AudioContext resume failed (e.g. iOS suspended context without a
        // user gesture). Stay in paused state so the user can tap to resume.
        this.setPlayingState(false)
      }
    }
  }

  private setPlayingState(playing: boolean): void {
    this.playPauseBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play')
    document.body.classList.toggle('is-playing', playing)
    document.body.classList.toggle('is-paused', !playing)
    // Keep the OS lock screen transport badge in sync with the in-app state
    this._mobile?.updatePlaybackState(playing)
  }

  private showPlayer(): void {
    // Trigger the landing exit animation
    this.dropzone.classList.add('landing-exit')
    window.setTimeout(() => {
      this.dropzone.style.display = 'none'
    }, 520)

    // Phase 1: switch to display:block so waveform canvas gets real CSS dimensions
    // (waveform.resize() is called right after showPlayer() in loadFile)
    this.player.style.display = 'block'
    this.player.removeAttribute('aria-hidden')

    // Phase 2: fade the player in after the landing exit is underway
    window.setTimeout(() => {
      this.player.style.opacity = ''
      this.player.classList.add('visible')
    }, 420)
  }
}
