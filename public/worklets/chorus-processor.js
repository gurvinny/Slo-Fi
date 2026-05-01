// AudioWorkletProcessor — delay-line chorus with internal LFO.
// Runs in the dedicated audio worklet thread.
// Replaces the OscillatorNode+DelayNode chain that previously ran on the main
// audio render thread. Processing per-sample in the worklet gives tighter
// LFO timing and eliminates any scheduling jitter from Web Audio graph updates.
//
// Signal path: input → circular delay buffer → LFO-modulated read pointer
// Wet/dry: depth 0 → fully dry | depth 1 → 50% wet (matches old behaviour)

const MAX_DELAY_SAMPLES = 6000  // ~125 ms at 48 kHz — enough for any chorus depth

class ChorusProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rate',  defaultValue: 0.8, minValue: 0.1, maxValue: 5,   automationRate: 'a-rate' },
      { name: 'depth', defaultValue: 0,   minValue: 0,   maxValue: 1,   automationRate: 'a-rate' },
    ]
  }

  constructor() {
    super()
    // One delay buffer per channel (stereo max)
    this._buffer  = [new Float32Array(MAX_DELAY_SAMPLES), new Float32Array(MAX_DELAY_SAMPLES)]
    this._writeIdx = 0
    this._phase    = 0   // LFO phase accumulator [0, 1)
  }

  process(inputs, outputs, parameters) {
    const input  = inputs[0]
    const output = outputs[0]
    if (!input || !input.length) return true

    const rateParam  = parameters.rate
    const depthParam = parameters.depth
    const sr         = sampleRate
    const blockSize  = output[0]?.length ?? 128
    const channels   = Math.min(input.length, output.length, 2)

    for (let i = 0; i < blockSize; i++) {
      const rate  = rateParam.length  > 1 ? rateParam[i]  : rateParam[0]
      const depth = depthParam.length > 1 ? depthParam[i] : depthParam[0]

      // Sine LFO — advance phase per sample
      const lfo = Math.sin(2 * Math.PI * this._phase)
      this._phase = (this._phase + rate / sr) % 1

      // Delay time: 15 ms base + up to 12 ms LFO swing at full depth
      const delaySamples = Math.max(1, (0.015 + depth * 0.012 * lfo) * sr)
      const delayInt     = Math.floor(delaySamples)
      const delayFrac    = delaySamples - delayInt

      for (let ch = 0; ch < channels; ch++) {
        const buf = this._buffer[ch]
        const x   = input[ch]?.[i] ?? 0

        // Write current sample into circular buffer
        buf[this._writeIdx % MAX_DELAY_SAMPLES] = x

        // Linear interpolation between adjacent buffer samples for smooth delay
        const i0      = (this._writeIdx - delayInt + MAX_DELAY_SAMPLES)     % MAX_DELAY_SAMPLES
        const i1      = (this._writeIdx - delayInt - 1 + MAX_DELAY_SAMPLES) % MAX_DELAY_SAMPLES
        const delayed = buf[i0] + delayFrac * (buf[i1] - buf[i0])

        // depth 0 → fully dry | depth 1 → 50% wet (same as old depth*0.6 wet gain)
        const wet    = depth * 0.5
        output[ch][i] = x * (1 - wet) + delayed * wet
      }

      this._writeIdx = (this._writeIdx + 1) % MAX_DELAY_SAMPLES
    }

    return true
  }
}

registerProcessor('chorus-processor', ChorusProcessor)
