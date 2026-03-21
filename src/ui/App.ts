import { AudioEngine } from '../audio/AudioEngine'
import { Waveform } from './Waveform'
import { SpectrumAnalyzer } from './SpectrumAnalyzer'
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
  private spectrum: SpectrumAnalyzer | null = null

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
  private trackMeta = document.getElementById('trackMeta')!
  private currentTimeEl = document.getElementById('currentTime')!
  private durationEl = document.getElementById('duration')!
  private playPauseBtn = document.getElementById('playPauseBtn')!
  private iconPlay = document.getElementById('iconPlay')!
  private iconPause = document.getElementById('iconPause')!
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

  constructor() {
    this.waveform = new Waveform(document.getElementById('waveform') as HTMLCanvasElement)

    // Controllers are instantiated here; DOM elements must exist before this runs
    this.presets = new PresetController(this.engine)
    this.effects = new EffectsController(this.engine)
    this.exporter = new ExportController(this.engine)
    this.collab = new CollabController(this.engine)

    this.wireEngineCallbacks()
    this.wireUI()
    this.wireKeyboard()
    this.wireCrossController()
    this.initMidi()
  }

  // Cross-controller wiring (presets syncing sliders, etc.)
  private wireCrossController(): void {
    this.presets.onPresetApplied = (params: AudioParams) => {
      this.syncSlidersToParams(params)
      this.effects.syncToParams(params)
    }

    this.effects.onChanged = () => {
      this.presets.clearActive()
      this.notifyParamChange()
    }
  }

  // Broadcasts current params to the collab session if one is active
  private notifyParamChange(): void {
    this.collab.broadcast(this.engine.getParams())
  }

  private async initMidi(): Promise<void> {
    this.midi.onStatusChange = (status) => this.midiIndicator.update(status)

    const available = await this.midi.init()
    if (!available) return

    // Wire default CC mappings (0-127 normalized to 0-1 by MidiController)
    this.midi.bindCC(7, (v) => {
      // CC 7 = Volume
      const vol = v
      this.engine.setVolume(vol)
      this.volumeSlider.value = String(Math.round(vol * 100))
      this.volumeValue.textContent = `${Math.round(vol * 100)}%`
      this.notifyParamChange()
    })

    this.midi.bindCC(74, (v) => {
      // CC 74 = Playback rate (maps 0-1 to 0.25-1.0)
      const rate = 0.25 + v * 0.75
      this.engine.setPlaybackRate(rate)
      this.speedSlider.value = String(Math.round(rate * 100))
      this.speedValue.textContent = `${rate.toFixed(2)}x`
      this.presets.clearActive()
      this.notifyParamChange()
    })

    this.midi.bindCC(91, (v) => {
      // CC 91 = Reverb send
      this.engine.setReverbMix(v)
      this.reverbSlider.value = String(Math.round(v * 100))
      this.reverbValue.textContent = `${Math.round(v * 100)}%`
      this.notifyParamChange()
    })

    this.midi.bindCC(93, (v) => {
      // CC 93 = Chorus depth
      this.engine.setChorusDepth(v)
      this.notifyParamChange()
    })
  }

  // Engine callbacks

  private wireEngineCallbacks(): void {
    this.engine.onEnded = () => {
      this.setPlayingState(false)
      this.waveform.setProgress(0)
      this.spectrum?.stop()
    }

    this.engine.onTimeUpdate = (current, duration) => {
      this.currentTimeEl.textContent = formatTime(current)
      if (duration > 0) {
        this.waveform.setProgress(current / duration)
      }
    }
  }

  // Core UI wiring

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
      this.spectrum?.stop()
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
      this.presets.clearActive()
      this.notifyParamChange()
    })

    // Reverb mix
    this.reverbSlider.addEventListener('input', () => {
      const mix = parseInt(this.reverbSlider.value) / 100
      this.engine.setReverbMix(mix)
      this.reverbValue.textContent = `${this.reverbSlider.value}%`
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
  }

  // Keyboard shortcuts

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
          this.spectrum?.stop()
          break
      }
    })
  }

  // File loading

  private async loadFile(file: File): Promise<void> {
    // Validate MIME type before decoding
    if (file.type && !file.type.startsWith('audio/')) {
      alert('Please drop an audio file.')
      return
    }

    this.dropzone.classList.add('loading')
    this.dropzone.querySelector('.dropzone-title')!.textContent = 'Decoding audio...'

    try {
      await this.engine.loadFile(file)

      const waveData = this.engine.getWaveform(400)
      this.waveform.setData(waveData)
      this.waveform.setProgress(0)

      // Strip extension for display and export filename
      const baseName = file.name.replace(/\.[^.]+$/, '')
      this.trackName.textContent = baseName
      this.exporter.trackName = baseName

      this.trackMeta.textContent = `${formatTime(this.engine.duration)} · ${formatBytes(file.size)} · ${file.type || 'audio'}`
      this.durationEl.textContent = formatTime(this.engine.duration)
      this.currentTimeEl.textContent = '0:00'

      // Set up spectrum analyzer now that the audio context exists
      if (!this.spectrum && this.engine.analyserNode) {
        this.spectrum = new SpectrumAnalyzer(
          document.getElementById('spectrum') as HTMLCanvasElement,
          this.engine.analyserNode,
        )
      }

      this.showPlayer()
      this.setPlayingState(false)
    } catch (err) {
      console.error('Failed to decode audio:', err)
      alert('Could not decode this audio file. Please try a different format.')
      this.dropzone.querySelector('.dropzone-title')!.textContent = 'Drop your audio file here'
    } finally {
      this.dropzone.classList.remove('loading')
    }
  }

  // Syncs the core slider positions and badges after a preset is applied
  private syncSlidersToParams(params: AudioParams): void {
    this.speedSlider.value = String(Math.round(params.playbackRate * 100))
    this.speedValue.textContent = `${params.playbackRate.toFixed(2)}x`

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

  // State helpers

  private togglePlayPause(): void {
    if (this.engine.isPlaying) {
      this.engine.pause()
      this.setPlayingState(false)
      this.spectrum?.stop()
    } else {
      this.engine.play()
      this.setPlayingState(true)
      this.spectrum?.start()
    }
  }

  private setPlayingState(playing: boolean): void {
    this.iconPlay.style.display = playing ? 'none' : ''
    this.iconPause.style.display = playing ? '' : 'none'
    this.playPauseBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play')
  }

  private showPlayer(): void {
    this.dropzone.style.display = 'none'
    this.player.classList.add('visible')
    this.player.removeAttribute('aria-hidden')
  }
}
