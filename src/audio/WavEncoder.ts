// Encodes an AudioBuffer to a standard 16-bit PCM WAV Blob.
// No external dependencies. Supports mono and stereo.
export function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numFrames = buffer.length
  const bytesPerSample = 2 // 16-bit

  const pcmByteCount = numFrames * numChannels * bytesPerSample
  const totalBytes = 44 + pcmByteCount

  const out = new ArrayBuffer(totalBytes)
  const view = new DataView(out)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, totalBytes - 8, true)
  writeString(view, 8, 'WAVE')

  // fmt sub-chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)                                       // sub-chunk size (PCM = 16)
  view.setUint16(20, 1, true)                                        // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true) // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true)             // block align
  view.setUint16(34, 16, true)                                       // bits per sample

  // data sub-chunk
  writeString(view, 36, 'data')
  view.setUint32(40, pcmByteCount, true)

  // Interleaved PCM samples (L0,R0,L1,R1,...)
  let offset = 44
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = buffer.getChannelData(ch)[i]
      const clamped = Math.max(-1, Math.min(1, sample))
      // Convert float32 to int16 (little-endian)
      view.setInt16(offset, Math.round(clamped * 32767), true)
      offset += 2
    }
  }

  return new Blob([out], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
