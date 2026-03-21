import { AudioEngine } from '../audio/AudioEngine'
import { detectBpm } from '../audio/BpmDetector'
import { Waveform } from './Waveform'
import { AnomalySphere } from './AnomalySphere'
import { StarOverlay } from './StarOverlay'
import { PresetController } from './PresetController'
import { EffectsController } from './EffectsController'
import { ExportController } from './ExportController'
import { CollabController } from './CollabController'
import { MidiController } from '../audio/MidiController'
import { MidiStatusIndicator } from './MidiStatusIndicator'
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
  private collab: CollabController
  private midi = new MidiController()
  private midiIndicator = new MidiStatusIndicator()

  // Core DOM refs
  private dropzone = document.getElementById('dropzone')!
  private fileInput = document.getElementById('fileInput') as HTMLInputElement
  private player = document.getElementById('player')!
  private trackName = document.getElementById('trackName')!
  private trackBpm  = document.getElementById('trackBpm')!
  private trackMeta = document.getElementById('trackMeta')!

  private _baseBpm = 0
  private currentTimeEl = document.getElementById('currentTime')!
  private durationEl = document.getElementById('duration')!
  private playPauseBtn = document.getElementById('playPauseBtn')!
  private stopBtn = document.getElementById('stopBtn')!
  private rewindBtn = document.getElementById('rewindBtn')!
  private speedSlider = document.getElementById('speedSlider') as HTMLInputElement
  private speedValue = document.getElementById('speedValue')!
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
  private starsSlider          = document.getElementById('starsSlider') as HTMLInputElement
  private starsValue           = document.getElementById('starsValue')!

  constructor() {
    this.waveform = new Waveform(document.getElementById('waveform') as HTMLCanvasElement)

    this.presets = new PresetController(this.engine)
    this.effects = new EffectsController(this.engine)
    this.exporter = new ExportController(this.engine)
    this.collab = new CollabController(this.engine)

    this.wireEngineCallbacks()
    this.wireUI()
    this.wireKeyboard()
    this.wireCrossController()
    this.wireControlsPanel()
    this.wireSettingsPanel()
    this.initMidi()
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
        this.settingsDrawer.querySelectorAll('.theme-chip').forEach(c => c.classList.remove('theme-chip--active'))
        chip.classList.add('theme-chip--active')
        const theme = chip.dataset.theme ?? 'prism'
        if (theme === 'prism') {
          document.documentElement.removeAttribute('data-theme')
        } else {
          document.documentElement.dataset.theme = theme
        }
        this.sphere?.setColorTheme(theme)
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
    this.effects.onChanged = () => {
      this.presets.clearActive()
      this.notifyParamChange()
    }
  }

  private notifyParamChange(): void {
    this.collab.broadcast(this.engine.getParams())
  }

  private async initMidi(): Promise<void> {
    this.midi.onStatusChange = (status) => this.midiIndicator.update(status)
    const available = await this.midi.init()
    if (!available) return

    this.midi.bindCC(7, (v) => {
      this.engine.setVolume(v)
      this.volumeSlider.value = String(Math.round(v * 100))
      this.volumeValue.textContent = `${Math.round(v * 100)}%`
      this.notifyParamChange()
    })
    this.midi.bindCC(74, (v) => {
      const rate = 0.50 + v * 1.20
      this.engine.setPlaybackRate(rate)
      this.speedSlider.value = String(Math.round(rate * 100))
      this.speedValue.textContent = `${rate.toFixed(2)}x`
      this.sphere?.setSpeed(rate)
      this.presets.clearActive()
      this.updateBpmDisplay()
      this.notifyParamChange()
    })
    this.midi.bindCC(91, (v) => {
      this.engine.setReverbMix(v)
      this.reverbSlider.value = String(Math.round(v * 100))
      this.reverbValue.textContent = `${Math.round(v * 100)}%`
      this.sphere?.setReverb(v)
      this.notifyParamChange()
    })
    this.midi.bindCC(93, (v) => {
      this.engine.setChorusDepth(v)
      this.notifyParamChange()
    })
  }

  private wireEngineCallbacks(): void {
    this.engine.onEnded = () => {
      this.setPlayingState(false)
      this.waveform.setProgress(0)
      this.sphere?.stop()
    }
    this.engine.onTimeUpdate = (current, duration) => {
      this.currentTimeEl.textContent = formatTime(current)
      if (duration > 0) {
        this.waveform.setProgress(current / duration)
      }
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
    })
    this.rewindBtn.addEventListener('click', () => {
      this.engine.seek(Math.max(0, this.engine.currentTime - 5))
    })

    // Waveform seek
    this.waveform.onSeek = (ratio) => {
      this.engine.seek(ratio * this.engine.duration)
    }

    // Speed
    this.speedSlider.addEventListener('input', () => {
      const rate = parseInt(this.speedSlider.value) / 100
      this.engine.setPlaybackRate(rate)
      this.speedValue.textContent = `${rate.toFixed(2)}x`
      this.sphere?.setSpeed(rate)
      this.presets.clearActive()
      this.updateBpmDisplay()
      this.notifyParamChange()
    })

    // Reverb mix
    this.reverbSlider.addEventListener('input', () => {
      const mix = parseInt(this.reverbSlider.value) / 100
      this.engine.setReverbMix(mix)
      this.reverbValue.textContent = `${this.reverbSlider.value}%`
      this.sphere?.setReverb(mix)
      this.presets.clearActive()
      this.notifyParamChange()
    })

    // Decay
    this.decaySlider.addEventListener('input', () => {
      const decay = parseInt(this.decaySlider.value) / 10
      this.engine.setReverbDecay(decay)
      this.decayValue.textContent = `${decay.toFixed(1)}s`
      this.presets.clearActive()
      this.notifyParamChange()
    })

    // Room size
    this.roomSlider.addEventListener('input', () => {
      const size = parseInt(this.roomSlider.value) / 100
      this.engine.setReverbRoomSize(size)
      this.roomValue.textContent = `${this.roomSlider.value}%`
      this.presets.clearActive()
      this.notifyParamChange()
    })

    // Volume
    this.volumeSlider.addEventListener('input', () => {
      const vol = parseInt(this.volumeSlider.value) / 100
      this.engine.setVolume(vol)
      this.volumeValue.textContent = `${this.volumeSlider.value}%`
      this.notifyParamChange()
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
          break
      }
    })
  }

  private async loadFile(file: File): Promise<void> {
    if (file.type && !file.type.startsWith('audio/')) {
      alert('Please drop an audio file.')
      return
    }

    this.dropzone.classList.add('loading')
    this.dropzone.querySelector('.dropzone-title')!.textContent = 'Decoding audio...'

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

      const baseName = file.name.replace(/\.[^.]+$/, '')
      this.trackName.textContent = baseName
      this.exporter.trackName = baseName

      this._baseBpm = detectBpm(this.engine.getBuffer()!)
      this.updateBpmDisplay()

      this.trackMeta.textContent = `${formatTime(this.engine.duration)} · ${formatBytes(file.size)} · ${file.type || 'audio'}`
      this.durationEl.textContent = formatTime(this.engine.duration)
      this.currentTimeEl.textContent = '0:00'

    } catch (err) {
      console.error('Failed to decode audio:', err)
      alert('Could not decode this audio file. Please try a different format.')
      this.dropzone.querySelector('.dropzone-title')!.textContent = 'Drop your audio file here'
    } finally {
      this.dropzone.classList.remove('loading')
    }

    if (!this.sphere && this.engine.analyserNode) {
      try {
        this.sphere = new AnomalySphere(
          document.getElementById('anomaly') as HTMLElement,
          this.engine.analyserNode,
        )
        this.sphere.onEnergyUpdate = (bass, mid, treble) => {
          const root = document.documentElement.style
          root.setProperty('--aurora-bass',   String(bass.toFixed(3)))
          root.setProperty('--aurora-mid',    String(mid.toFixed(3)))
          root.setProperty('--aurora-treble', String(treble.toFixed(3)))
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

  private updateBpmDisplay(): void {
    if (!this._baseBpm) { this.trackBpm.textContent = ''; return }
    const displayed = Math.round(this._baseBpm * this.engine.getParams().playbackRate)
    this.trackBpm.textContent = `${displayed} BPM`
  }

  private togglePlayPause(): void {
    if (this.engine.isPlaying) {
      this.engine.pause()
      this.setPlayingState(false)
      this.sphere?.stop()
    } else {
      this.engine.play()
      this.setPlayingState(true)
      this.sphere?.start()
    }
  }

  private setPlayingState(playing: boolean): void {
    this.playPauseBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play')
    document.body.classList.toggle('is-playing', playing)
    document.body.classList.toggle('is-paused', !playing)
  }

  private showPlayer(): void {
    this.dropzone.style.display = 'none'
    this.player.classList.add('visible')
    this.player.removeAttribute('aria-hidden')
  }
}
