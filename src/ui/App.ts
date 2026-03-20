import { AudioEngine } from '../audio/AudioEngine'
import { Waveform } from './Waveform'

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

  // DOM refs
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
    this.wireEngineCallbacks()
    this.wireUI()
    this.wireKeyboard()
  }

  // ── Engine callbacks ───────────────────────────────────────────────────────

  private wireEngineCallbacks(): void {
    this.engine.onEnded = () => {
      this.setPlayingState(false)
      this.waveform.setProgress(0)
    }

    this.engine.onTimeUpdate = (current, duration) => {
      this.currentTimeEl.textContent = formatTime(current)
      if (duration > 0) {
        this.waveform.setProgress(current / duration)
      }
    }
  }

  // ── UI wiring ──────────────────────────────────────────────────────────────

  private wireUI(): void {
    // Drop zone — click
    this.dropzone.addEventListener('click', () => this.fileInput.click())
    this.dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.fileInput.click()
    })

    // Drop zone — drag & drop
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

    // File input
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
      this.speedValue.textContent = `${rate.toFixed(2)}×`
    })

    // Reverb mix
    this.reverbSlider.addEventListener('input', () => {
      const mix = parseInt(this.reverbSlider.value) / 100
      this.engine.setReverbMix(mix)
      this.reverbValue.textContent = `${this.reverbSlider.value}%`
    })

    // Decay
    this.decaySlider.addEventListener('input', () => {
      const decay = parseInt(this.decaySlider.value) / 10
      this.engine.setReverbDecay(decay)
      this.decayValue.textContent = `${decay.toFixed(1)}s`
    })

    // Room size
    this.roomSlider.addEventListener('input', () => {
      const size = parseInt(this.roomSlider.value) / 100
      this.engine.setReverbRoomSize(size)
      this.roomValue.textContent = `${this.roomSlider.value}%`
    })

    // Volume
    this.volumeSlider.addEventListener('input', () => {
      const vol = parseInt(this.volumeSlider.value) / 100
      this.engine.setVolume(vol)
      this.volumeValue.textContent = `${this.volumeSlider.value}%`
    })
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

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
          break
      }
    })
  }

  // ── File loading ───────────────────────────────────────────────────────────

  private async loadFile(file: File): Promise<void> {
    this.dropzone.classList.add('loading')
    this.dropzone.querySelector('.dropzone-title')!.textContent = 'Decoding audio…'

    try {
      await this.engine.loadFile(file)

      const waveData = this.engine.getWaveform(400)
      this.waveform.setData(waveData)
      this.waveform.setProgress(0)

      this.trackName.textContent = file.name.replace(/\.[^.]+$/, '')
      this.trackMeta.textContent = `${formatTime(this.engine.duration)} · ${formatBytes(file.size)} · ${file.type || 'audio'}`
      this.durationEl.textContent = formatTime(this.engine.duration)
      this.currentTimeEl.textContent = '0:00'

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

  // ── State helpers ──────────────────────────────────────────────────────────

  private togglePlayPause(): void {
    if (this.engine.isPlaying) {
      this.engine.pause()
      this.setPlayingState(false)
    } else {
      this.engine.play()
      this.setPlayingState(true)
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
