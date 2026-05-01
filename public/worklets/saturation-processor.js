// AudioWorkletProcessor — tanh soft-clipping saturation.
// Runs in the dedicated audio worklet thread, keeping DSP off the main thread.
// Normalization: y = tanh(k*x) / tanh(k) maps ±1 → ±1 at all drive levels
// (zero gain change — only waveform shape changes, never amplitude).
// drive=0: transparent bypass  |  drive=1: noticeable musical saturation

class SaturationProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: 'drive',
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automationRate: 'a-rate',
    }]
  }

  process(inputs, outputs, parameters) {
    const input  = inputs[0]
    const output = outputs[0]
    if (!input || !input.length) return true

    const driveParam = parameters.drive
    const blockSize  = output[0]?.length ?? 128

    for (let ch = 0; ch < output.length; ch++) {
      const inp = input[ch]
      const out = output[ch]
      if (!inp) { out?.fill(0); continue }

      for (let i = 0; i < blockSize; i++) {
        const drive = driveParam.length > 1 ? driveParam[i] : driveParam[0]

        if (drive < 0.001) {
          out[i] = inp[i]
          continue
        }

        // k from ~0 (linear) to 6 (musical saturation) — matches EffectsChain curve
        const k    = drive * 6 + 0.001
        const norm = Math.tanh(k)
        out[i] = Math.tanh(k * inp[i]) / norm
      }
    }

    return true
  }
}

registerProcessor('saturation-processor', SaturationProcessor)
