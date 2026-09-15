import type { AudioEngine } from './AudioEngine'
import { buildIR } from './AudioEngine'
import { EffectsChain } from './EffectsChain'
import { encodeWav } from './WavEncoder'
import type { AudioParams } from '../types'

// Max source duration we'll attempt to export (security: prevent browser OOM on huge files)
const MAX_EXPORT_DURATION_SECONDS = 30 * 60 // 30 minutes

// Renders a source buffer through the full offline signal graph.
//
// Split out from exportAudio so it can be tested directly. Keeping the graph
// in a second copy inside a test is how an export path drifts away from the
// thing it is supposed to mirror -- the missing detune below survived exactly
// because nothing exercised this code.
//
// The graph:
//   source -> dry ------------------> master -> EffectsChain -> destination
//          \-> convolver -> wet ----/
//
// Sample rate and channel count are inherited from the source buffer, and the
// output is sized from the *slowed* duration, not the source duration.
export async function renderExport(
  srcBuffer: AudioBuffer,
  params: AudioParams,
): Promise<AudioBuffer> {
  // Output is longer than the source whenever the track is slowed down.
  const outputDuration = srcBuffer.duration / params.playbackRate
  const outputSamples = Math.ceil(outputDuration * srcBuffer.sampleRate)

  const offline = new OfflineAudioContext(
    srcBuffer.numberOfChannels,
    outputSamples,
    srcBuffer.sampleRate,
  )

  const source = offline.createBufferSource()
  source.buffer = srcBuffer
  source.playbackRate.value = params.playbackRate
  // Live playback pitches with detune (AudioEngine.ensureContext). Without the
  // same line here the exported file comes back at the original pitch, so it
  // disagrees with what the user just heard.
  source.detune.value = params.pitchSemitones * 100

  const convolver = offline.createConvolver()
  convolver.buffer = buildIR(offline, params.reverbType, params.reverbDecay, params.reverbPreDelay, params.reverbDamping)

  const dryGain = offline.createGain()
  dryGain.gain.value = 1 - params.reverbMix

  const wetGain = offline.createGain()
  wetGain.gain.value = params.reverbMix

  const masterGain = offline.createGain()
  masterGain.gain.value = params.volume

  source.connect(dryGain)
  source.connect(convolver)
  convolver.connect(wetGain)
  dryGain.connect(masterGain)
  wetGain.connect(masterGain)

  const chain = new EffectsChain()
  const chainOut = chain.initOffline(offline, masterGain, params)
  chainOut.connect(offline.destination)

  source.start(0)

  return offline.startRendering()
}

// Renders the current track with all effects applied and triggers a WAV download.
export async function exportAudio(engine: AudioEngine, trackName: string): Promise<void> {
  const srcBuffer = engine.getBuffer()
  if (!srcBuffer) throw new Error('No audio loaded')

  const params = engine.getParams()

  if (srcBuffer.duration > MAX_EXPORT_DURATION_SECONDS) {
    throw new Error('Track is too long to export (max 30 minutes)')
  }

  const rendered = await renderExport(srcBuffer, params)
  triggerDownload(encodeWav(rendered), sanitizeFilename(trackName))
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
