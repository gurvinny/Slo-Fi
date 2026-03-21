<div align="center">

<img src="docs/assets/slo-fi-banner.svg" alt="Slo-Fi Banner" width="100%"/>

<br/>

# Architecture & Technical Deep-Dive

### ✦ How Slo-Fi works under the hood ✦

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Web Audio API](https://img.shields.io/badge/Web_Audio_API-4A154B.svg?style=flat-square&logo=audiomack&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF.svg?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Zero Dependencies](https://img.shields.io/badge/Runtime_Deps-Zero-10B981.svg?style=flat-square)](package.json)

<p>
  <a href="#signal-flow">Signal Flow</a> •
  <a href="#core-components">Core Components</a> •
  <a href="#module-structure">Module Structure</a> •
  <a href="#performance">Performance</a> •
  <a href="#security-architecture">Security</a>
</p>

</div>

<br/>

---

<br/>

Slo-Fi is built entirely on the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — no external audio libraries, no server-side processing. The entire signal chain runs inside the browser's native audio thread, which executes compiled C++ under the hood. This is what makes sub-10ms latency possible.

<br/>

## Signal Flow

Every audio file travels through the same directed graph of Web Audio nodes:

```
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────────┐    ┌─────────┐
│  Source   │───▶│  Playback    │───▶│  Effects     │───▶│  Convolver    │───▶│  Gain /      │───▶│  Audio  │
│  Buffer   │    │  Rate Node   │    │  Chain       │    │  Node         │    │  Master Out  │    │  Output │
└──────────┘    └──────────────┘    └──────────────┘    └───────────────┘    └──────────────┘    └─────────┘
   File I/O       Time-Stretch        EQ · Chorus ·        Reverb Engine         Volume Ctrl       destination
                                       Saturation
```

Each node is a native browser object — no custom DSP running in JavaScript on the main thread. The audio processing happens in a real-time audio worklet thread that can't be blocked by UI updates or garbage collection.

<br/>

---

<br/>

## Core Components

### `AudioContext` — The Runtime

The entire processing graph lives inside a single `AudioContext` instance, owned by `AudioEngine`. Audio is decoded from a local `File` object into an `AudioBuffer` using `decodeAudioData()` — this happens asynchronously so the UI stays responsive. The context's sample rate locks to the device's native rate (44.1kHz or 48kHz) to avoid resampling overhead.

```typescript
const ctx = new AudioContext({ latencyHint: 'interactive' });
const source = ctx.createBufferSource();
source.buffer = decodedAudio;
source.playbackRate.value = 0.85; // 85% speed
source.connect(effectsChainInput);
source.start();
```

The `latencyHint: 'interactive'` mode tells the browser to minimise buffer size and prioritise low latency over stability — the right trade-off for live control of audio parameters.

---

### `ConvolverNode` — Reverb That Breathes

Rather than a basic delay-line reverb, Slo-Fi uses the `ConvolverNode` for true **convolution reverb** — the same algorithm used in professional studio plugins. The node multiplies the frequency-domain representation of the input signal against an impulse response (IR), producing reverb tails that are physically accurate.

```typescript
const convolver = ctx.createConvolver();
convolver.buffer = impulseResponseBuffer;

// Dry/wet blend via parallel gain nodes
const dryGain = ctx.createGain();
const wetGain = ctx.createGain();

source.connect(dryGain).connect(ctx.destination);
source.connect(convolver).connect(wetGain).connect(ctx.destination);
```

**Synthetic IR Generation** — When no external impulse response file is loaded, Slo-Fi generates one algorithmically. It builds an exponential decay envelope at the configured decay time and room size, fills a stereo `AudioBuffer` with white noise shaped by that envelope, and feeds it directly into the `ConvolverNode`. This runs once per parameter change and produces perceptually convincing results at zero network cost.

---

### Effects Chain

The effects chain (`src/audio/EffectsChain.ts`) sits between the playback rate node and the convolver. It is built from three native node types:

| Effect | Node(s) | Notes |
|:---|:---|:---|
| 3-Band EQ | `BiquadFilterNode` × 3 | Low shelf, peaking mid, high shelf |
| Chorus | `DelayNode` + `OscillatorNode` + `GainNode` | LFO modulates delay time for shimmer |
| Tape Saturation | `WaveShaperNode` | Soft-clipping curve applied via `curve` buffer |

The chain is fully bypassable — when all effects are at neutral, the nodes are still connected but have no audible effect, avoiding the click that would occur from disconnecting and reconnecting nodes mid-playback.

---

### `AnalyserNode` — Visualisation

Two `AnalyserNode` instances feed the waveform and spectrum visualisers:

- **Waveform** (`src/ui/Waveform.ts`) — reads time-domain data via `getByteTimeDomainData()` and draws it to a `<canvas>` element on every animation frame
- **Spectrum Analyzer** (`src/ui/SpectrumAnalyzer.ts`) — reads frequency-domain data via `getByteFrequencyData()` with an FFT size of 2048, rendered as a bar chart on `<canvas>`

Both run on `requestAnimationFrame` and only redraw while audio is playing.

---

### MIDI

`MidiController.ts` uses the Web MIDI API (`navigator.requestMIDIAccess()`) to listen for MIDI CC messages. Each CC number maps to a named parameter (speed, reverb mix, volume, EQ bands, etc.). Mappings are stored in memory and can be reassigned at any time without restarting playback.

<br/>

---

<br/>

## Module Structure

```
src/
├── main.ts                  Application entry point
├── types.ts                 Shared TypeScript types
├── presets.ts               Preset definitions (Lo-Fi, Vaporwave, Ambient, Custom)
│
├── audio/
│   ├── AudioEngine.ts       AudioContext ownership, node graph, playback control
│   ├── EffectsChain.ts      EQ, Chorus, Tape Saturation nodes
│   ├── Exporter.ts          WAV export orchestration
│   ├── MidiController.ts    Web MIDI API input and CC mapping
│   └── WavEncoder.ts        Raw PCM → WAV file encoding
│
├── ui/
│   ├── App.ts               Main controller — wires DOM to audio engine
│   ├── Waveform.ts          Time-domain canvas visualiser
│   ├── SpectrumAnalyzer.ts  Frequency-domain canvas visualiser
│   ├── EffectsController.ts Effects panel DOM bindings
│   ├── PresetController.ts  Preset selection UI
│   ├── ExportController.ts  Export button and progress
│   └── MidiStatusIndicator.ts MIDI connection status display
```

The two top-level modules (`audio/`, `ui/`) have a strict dependency direction — `ui/` depends on `audio/`, and `audio/` never imports from `ui/`. This keeps the audio engine independently testable.

<br/>

---

<br/>

## Performance

| Metric | Value |
|:---|:---|
| Audio thread latency | < 10ms (`latencyHint: 'interactive'`) |
| Memory footprint | ~10 MB per minute of stereo 44.1kHz audio |
| CPU usage | Minimal — all nodes execute as native C++ in the audio thread |
| Node graph size | 7–10 nodes (source → rate → effects chain → convolver → gains → destination) |
| Visualiser frame rate | Capped to `requestAnimationFrame` (~60fps), pauses when audio stops |
| Build output | Single JS bundle, no runtime dependencies |

<br/>

---

<br/>

## Security Architecture

Audio processing is entirely client-side. The browser is the only runtime — there is no server in the audio path.

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT BROWSER                        │
│                                                         │
│   ┌──────────┐     ┌──────────────┐     ┌──────────┐   │
│   │  Local    │────▶│  AudioContext │────▶│  Speaker │   │
│   │  File     │     │  (in-memory) │     │  Output  │   │
│   └──────────┘     └──────────────┘     └──────────┘   │
│                                                         │
│   ██████████████  NO DATA EXITS THIS BOX  ████████████  │
│                                                         │
└─────────────────────────────────────────────────────────┘
                           ✕
                    ┌──────────────┐
                    │   Internet   │  ← No connection made for audio
                    └──────────────┘
```

| Guarantee | How |
|:---|:---|
| No audio uploads | `decodeAudioData()` reads from a local `File` object — no network call |
| No persistent storage | `AudioBuffer` lives in memory only; cleared on tab close |
| No third-party scripts | All dependencies bundled at build time; no CDN calls at runtime |
| Strict CSP | Content Security Policy headers block inline scripts and restrict origins |

For reporting a vulnerability, see [SECURITY.md](SECURITY.md).

<br/>

---

<br/>

<div align="center">

<sub><a href="README.md">Back to README</a> • <a href="ROADMAP.md">Roadmap</a> • <a href="CONTRIBUTING.md">Contributing</a></sub>

</div>
