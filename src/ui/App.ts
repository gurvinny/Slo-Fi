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

  // Controls drawer refs
  private controlsDrawer = document.getElementById('controlsDrawer')!
  private controlsFloatBtn = document.getElementById('controlsFloatBtn')!
  private controlsCloseBtn = document.getElementById('controlsCloseBtn')!
  private controlsShowBtn = document.getElementById('controlsShowBtn')!

  // Effects drawer refs
  private effectsDrawer   = document.getElementById('effectsDrawer')!
  private effectsCloseBtn = document.getElementById('effectsCloseBtn')!
  private effectsShowBtn  = document.getElementById('effectsShowBtn')!

  // Settings drawer refs
  private settingsDrawer   = document.getElementById('settingsDrawer')!
  private settingsCloseBtn = document.getElementById('settingsCloseBtn')!
  private settingsShowBtn  = document.getElementById('settingsShowBtn')!

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

  constructor() {
    this.waveform = new Waveform(document.getElementById('waveform') as HTMLCanvasElement)

    this.presets = new PresetController(this.engine)
    this.effects = new EffectsController(this.engine)
    this.exporter = new ExportController(this.engine)

    this.wireEngineCallbacks()
    this.wireUI()
    this.wireKeyboard()
    this.wireCrossController()
    this.wireControlsPanel()
    this.wireEffectsPanel()
    this.wireSettingsPanel()

    // Wire up mobile APIs: Media Session, Fullscreen, Vibration, and
    // AudioContext background recovery via visibilitychange.
    this._mobile = new MobileController(this.engine)
    this._mobile.onExternalPlay  = () => { this.setPlayingState(true);  this.sphere?.start(); this.starOverlay.resume() }
    this._mobile.onExternalPause = () => { this.setPlayingState(false); this.sphere?.stop();  this.starOverlay.pause() }
    this._mobile.onExternalStop  = () => {
      this.setPlayingState(false)
      this.waveform.setProgress(0)
      this.currentTimeEl.textContent = '0:00'
      this.sphere?.stop()
      this.starOverlay.pause()
      this._mobile.stopSilenceLoop()
    }
    const fsBtn = document.getElementById('fullscreenBtn') as HTMLButtonElement | null
    if (fsBtn) this._mobile.bindFullscreenBtn(fsBtn)
  }

  private wireControlsPanel(): void {
    this.controlsFloatBtn.addEventListener('click', () => {
      const isNowFloating = this.controlsDrawer.classList.toggle('controls-drawer--floating')
      this.controlsFloatBtn.setAttribute('title',      isNowFloating ? 'Pin panel'   : 'Float panel')
      this.controlsFloatBtn.setAttribute('aria-label', isNowFloating ? 'Pin panel'   : 'Float panel')
    })
    this.controlsCloseBtn.addEventListener('click', () => {
      this.controlsDrawer.classList.add('controls-drawer--hidden')
      this.controlsDrawer.classList.remove('controls-drawer--floating')
      this.controlsShowBtn.style.display = ''
    })
    this.controlsShowBtn.addEventListener('click', () => {
      this.controlsDrawer.classList.remove('controls-drawer--hidden')
      this.controlsShowBtn.style.display = 'none'
      // Close effects drawer if open
      this.effectsDrawer.classList.add('controls-drawer--hidden')
      this.effectsShowBtn.style.display = ''
    })
  }

  private wireEffectsPanel(): void {
    this.effectsCloseBtn.addEventListener('click', () => {
      this.effectsDrawer.classList.add('controls-drawer--hidden')
      this.effectsShowBtn.style.display = ''
    })
    this.effectsShowBtn.addEventListener('click', () => {
      this.effectsDrawer.classList.remove('controls-drawer--hidden')
      this.effectsShowBtn.style.display = 'none'
      // Close controls drawer if open
      this.controlsDrawer.classList.add('controls-drawer--hidden')
      this.controlsDrawer.classList.remove('controls-drawer--floating')
      this.controlsShowBtn.style.display = ''
    })
  }

  private wireSettingsPanel(): void {
    this.settingsCloseBtn.addEventListener('click', () => {
      this.settingsDrawer.classList.add('settings-drawer--hidden')
      this.settingsShowBtn.classList.remove('btn-settings-show--active')
    })
    this.settingsShowBtn.addEventListener('click', () => {
      const isHidden = this.settingsDrawer.classList.toggle('settings-drawer--hidden')
      this.settingsShowBtn.classList.toggle('btn-settings-show--active', !isHidden)
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
    }
    this.presets.onThemeApplied = (theme: string) => {
      this.applyTheme(theme)
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
      this._mobile?.stopSilenceLoop()
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
      const file = e.dataTransfer?.files[0]
      if (file) this.loadFile(file)
    })
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0]
      if (file) this.loadFile(file)
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
      this.sphere?.setSpeed(rate)
      this.presets.clearActive()
      this.updateBpmDisplay()
    })

    // Pitch
    this.pitchSlider.addEventListener('input', () => {
      const st = parseInt(this.pitchSlider.value)
      this.engine.setPitch(st)
      this.pitchValue.textContent = st === 0 ? '0 st' : `${st > 0 ? '+' : ''}${st} st`
      this.presets.clearActive()
      this.updateBpmDisplay()
    })

    // Reverb mix
    this.reverbSlider.addEventListener('input', () => {
      const mix = parseInt(this.reverbSlider.value) / 100
      this.engine.setReverbMix(mix)
      this.reverbValue.textContent = `${this.reverbSlider.value}%`
      this.sphere?.setReverb(mix)
      this.presets.clearActive()
    })

    // Decay
    this.decaySlider.addEventListener('input', () => {
      const decay = parseInt(this.decaySlider.value) / 10
      this.engine.setReverbDecay(decay)
      this.decayValue.textContent = `${decay.toFixed(1)}s`
      this.presets.clearActive()
    })

    // Room size
    this.roomSlider.addEventListener('input', () => {
      const size = parseInt(this.roomSlider.value) / 100
      this.engine.setReverbRoomSize(size)
      this.roomValue.textContent = `${this.roomSlider.value}%`
      this.presets.clearActive()
    })

    // Volume
    this.volumeSlider.addEventListener('input', () => {
      const vol = parseInt(this.volumeSlider.value) / 100
      this.engine.setVolume(vol)
      this.volumeValue.textContent = `${this.volumeSlider.value}%`
    })

    // Visual settings — particle count
    this.particleCountSlider.addEventListener('change', () => {
      const n = parseInt(this.particleCountSlider.value)
      this.sphere?.setParticleCount(n)
      this.particleCountValue.textContent = String(n)
    })

    // Visual settings — orb reactivity
    this.orbReactivitySlider.addEventListener('input', () => {
      const v = parseInt(this.orbReactivitySlider.value) / 100
      this.sphere?.setReactivity(v)
      this.orbReactivityValue.textContent = `${this.orbReactivitySlider.value}%`
    })

    // Visual settings — orb glow
    this.orbGlowSlider.addEventListener('input', () => {
      const v = parseInt(this.orbGlowSlider.value) / 100
      this.sphere?.setGlow(v)
      this.orbGlowValue.textContent = `${this.orbGlowSlider.value}%`
    })

    // Visual settings — orb size
    this.orbSizeSlider.addEventListener('input', () => {
      const v = parseInt(this.orbSizeSlider.value) / 100
      this.sphere?.setOrbSize(v)
      this.orbSizeValue.textContent = `${this.orbSizeSlider.value}%`
    })

    // Visual settings — rotation speed
    this.rotationSpeedSlider.addEventListener('input', () => {
      const v = parseInt(this.rotationSpeedSlider.value) / 100
      this.sphere?.setRotationSpeed(v)
      this.rotationSpeedValue.textContent = `${v.toFixed(1)}×`
    })

    // Visual settings — bass pulse toggle
    this.bassPulseToggle.addEventListener('change', () => {
      this.sphere?.setBassPulse(this.bassPulseToggle.checked)
    })

    // Visual settings — wireframe toggle
    this.wireframeToggle.addEventListener('change', () => {
      this.sphere?.setWireframe(this.wireframeToggle.checked)
    })

    // Visual settings — orb effect toggles
    this.lightningToggle.addEventListener('change', () => {
      this.sphere?.setLightning(this.lightningToggle.checked)
    })
    this.crackToggle.addEventListener('change', () => {
      this.sphere?.setCrack(this.crackToggle.checked)
    })
    this.crystalToggle.addEventListener('change', () => {
      this.sphere?.setCrystal(this.crystalToggle.checked)
    })
    this.glitchToggle.addEventListener('change', () => {
      this.sphere?.setGlitch(this.glitchToggle.checked)
    })

    // Visual settings — star brightness
    this.starsSlider.addEventListener('input', () => {
      const v = parseInt(this.starsSlider.value) / 100
      this.sphere?.setStarBrightness(v)
      this.starsValue.textContent = `${this.starsSlider.value}%`
    })
  }

  private wireKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      if (!this.engine.hasBuffer) return
      const tag = (e.target as HTMLElement).tagName
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

    try {
      await this.engine.loadFile(file)

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

      this.trackMeta.textContent = `${formatTime(this.engine.duration)} · ${formatBytes(file.size)} · ${file.type || 'audio'}`
      this.durationEl.textContent = formatTime(this.engine.duration)
      this.currentTimeEl.textContent = '0:00'

    } catch (err) {
      console.error('Failed to decode audio:', err)
      showDropzoneError('Could not decode this file. Try a different format.')
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
          const root = document.documentElement.style
          root.setProperty('--aurora-bass',   String(bass.toFixed(3)))
          root.setProperty('--aurora-mid',    String(mid.toFixed(3)))
          root.setProperty('--aurora-treble', String(treble.toFixed(3)))
          root.setProperty('--ui-bass',       String(uiBass.toFixed(3)))
          root.setProperty('--ui-treble',     String(uiTreble.toFixed(3)))
          this.starOverlay.setTreble(treble)
        }
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
    this.trackBpm.textContent = `${displayed} BPM${key}`
  }

  private togglePlayPause(): void {
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
      this.engine.play()
      this.setPlayingState(true)
      this.sphere?.start()
      this.starOverlay.resume()
      this._mobile.hapticPlay()
      this._mobile.updatePlaybackState(true)
      this._mobile.ensureSilenceLoop()
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
