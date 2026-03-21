import type { AudioEngine } from './AudioEngine'
import { buildIR } from './AudioEngine'
import { EffectsChain } from './EffectsChain'
import { encodeWav } from './WavEncoder'

// Max source duration we'll attempt to export (security: prevent browser OOM on huge files)
const MAX_EXPORT_DURATION_SECONDS = 30 * 60 // 30 minutes

// Renders the current track with all effects applied and triggers a WAV download.
export async function exportAudio(engine: AudioEngine, trackName: string): Promise<void> {
  const srcBuffer = engine.getBuffer()
  if (!srcBuffer) throw new Error('No audio loaded')

  const params = engine.getParams()

  if (srcBuffer.duration > MAX_EXPORT_DURATION_SECONDS) {
    throw new Error('Track is too long to export (max 30 minutes)')
  }

  // Output duration is longer than the source because we're slowing it down
  const outputDuration = srcBuffer.duration / params.playbackRate
  const outputSamples = Math.ceil(outputDuration * srcBuffer.sampleRate)

  const offline = new OfflineAudioContext(
    srcBuffer.numberOfChannels,
    outputSamples,
    srcBuffer.sampleRate,
  )

  // Rebuild the full signal graph offline with the same parameters
  const source = offline.createBufferSource()
  source.buffer = srcBuffer
  source.playbackRate.value = params.playbackRate

  const convolver = offline.createConvolver()
  convolver.buffer = buildIR(offline, params.reverbDecay, params.reverbRoomSize)

  const dryGain = offline.createGain()
  dryGain.gain.value = 1 - params.reverbMix

  const wetGain = offline.createGain()
  wetGain.gain.value = params.reverbMix

  const masterGain = offline.createGain()
  masterGain.gain.value = params.volume

  // source -> dry/wet reverb -> masterGain
  source.connect(dryGain)
  source.connect(convolver)
  convolver.connect(wetGain)
  dryGain.connect(masterGain)
  wetGain.connect(masterGain)

  // effects chain -> offline destination
  const chain = new EffectsChain()
  const chainOut = chain.initOffline(offline, masterGain, params)
  chainOut.connect(offline.destination)

  source.start(0)

  const rendered = await offline.startRendering()
  const blob = encodeWav(rendered)

  triggerDownload(blob, sanitizeFilename(trackName))
}

// Strips unsafe characters from a filename
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _\-]/g, '').trim() || 'slo-fi-export'
}

function triggerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.wav`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke after a short delay to let the browser pick up the download
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
