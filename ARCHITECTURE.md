<div align="center">

<img src="docs/assets/slo-fi-banner.svg" alt="Slo-Fi Banner" width="100%"/>

<br/>

# Architecture & Technical Deep-Dive

### ✦ How Slo-Fi works under the hood ✦

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Web Audio API](https://img.shields.io/badge/Web_Audio_API-4A154B.svg?style=flat-square&logo=audiomack&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF.svg?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
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
┌──────────┐  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  ┌─────────┐
│  Source   │─▶│  Playback    │─▶│  Effects      │─▶│  Convolver   │─▶│  8D Panner   │─▶│  Gain /      │─▶│  Audio  │
│  Buffer   │  │  Rate Node   │  │  Chain        │  │  Node        │  │  Node        │  │  Master Out  │  │  Output │
└──────────┘  └──────────────┘  └───────────────┘  └──────────────┘  └───────────────┘  └──────────────┘  └─────────┘
  File I/O     Time-Stretch &     EQ · Chorus ·      Reverb Engine     HRTF Spatial       Volume Ctrl       destination
               Pitch Shift        Saturation                           (optional)
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
source.playbackRate.value = 0.85; // 85% speed — pitch handled separately
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

### 8D Panner — Spatial Audio

When 8D mode is enabled, a `PannerNode` with the `HRTF` panning model is inserted after the convolver. An automation loop updates the panner's position on each animation frame, tracing a circular path in 3D space around the listener. Distance attenuation is disabled so the effect is purely spatial rather than volumetric.

```typescript
const panner = ctx.createPanner();
panner.panningModel = 'HRTF';
panner.distanceModel = 'linear';
panner.maxDistance = 1; // no volume attenuation
```

---

### `AnalyserNode` — Visualisation

Two `AnalyserNode` instances feed the waveform and spectrum visualisers:

- **Waveform** (`src/ui/Waveform.ts`) — reads time-domain data via `getByteTimeDomainData()` and draws it to a `<canvas>` element on every animation frame. Supports drag-to-seek and draggable loop region handles.
- **Spectrum Analyzer** (`src/ui/SpectrumAnalyzer.ts`) — reads frequency-domain data via `getByteFrequencyData()` with an FFT size of 2048, rendered as a bar chart on `<canvas>`. Peak energy spawns particle sparks. Updates aurora CSS variables in real time (`--aurora-bass`, `--aurora-mid`, `--aurora-treble`).

Both run on `requestAnimationFrame` and only redraw while audio is playing.

---

### `BpmDetector` — Beat Analysis

`src/audio/BpmDetector.ts` reads live FFT data from the `AnalyserNode` to detect onsets in the sub-bass region. Inter-onset intervals are accumulated into a running estimate that converges on the track's BPM. The display value is divided by the current playback speed so the readout always reflects the tempo you hear, not the original.

---

### `KeyDetector` — Harmonic Analysis

`src/audio/KeyDetector.ts` runs once when a file loads, using `OfflineAudioContext` to decode the full buffer offline. It builds a 12-bin chromagram from the frequency data and scores it against major and minor key profiles using the **Krumhansl-Schmuckler algorithm**. The highest-scoring match (root note + mode) is displayed under the track title.

---

### `MobileController` — PWA Integration

`src/ui/MobileController.ts` wires up the browser APIs that make Slo-Fi a first-class mobile app:

| API | What it does |
|:---|:---|
| **Media Session API** | Lock screen controls (play, pause, seek) with track metadata display |
| **Fullscreen API** | Full-screen button for immersive playback |
| **Vibration API** | Haptic feedback: 12ms on play, 8ms on pause, 4ms on seek |
| **Visibility change** | Resumes `AudioContext` when the app is foregrounded after backgrounding |
| **Silence loop** | Keeps iOS audio session alive during background playback |

---

### `AnomalySphere` — The Orb

`src/ui/AnomalySphere.ts` is the Three.js renderer for the 3D audio-reactive orb. A `SphereGeometry` is displaced every frame using 4 layers of simplex 3D noise at different frequencies, scaled by the live bass, mid, and treble energy from the `AnalyserNode`. Post-processing adds `UnrealBloom`, film grain, and chromatic aberration.

A cloud of 350 orbiting particles and 3 energy rings complete the scene. The orb's time warp parameter slows the noise animation in sync with playback speed — at 25% speed, the distortions become large and dreamlike.

<br/>

---

<br/>

## Module Structure

```
src/
├── main.ts                  Application entry point
├── types.ts                 Shared TypeScript types
├── presets.ts               Preset definitions (Lo-Fi, Vaporwave, Ambient, Hyperpop, Custom)
│
├── audio/
│   ├── AudioEngine.ts       AudioContext ownership, node graph, playback control
│   ├── EffectsChain.ts      EQ, Chorus, Tape Saturation nodes
│   ├── BpmDetector.ts       Onset detection + real-time BPM calculation
│   ├── KeyDetector.ts       Chromagram analysis — Krumhansl-Schmuckler key detection
│   ├── Exporter.ts          WAV export orchestration
│   └── WavEncoder.ts        Raw PCM → WAV file encoding
│
└── ui/
    ├── App.ts               Main controller — wires DOM to audio engine
    ├── AnomalySphere.ts     Three.js 3D orb with simplex noise displacement + post-processing
    ├── StarOverlay.ts       Particle star field behind the orb
    ├── Waveform.ts          Time-domain canvas visualiser + loop region handles
    ├── SpectrumAnalyzer.ts  Frequency-domain canvas visualiser + aurora variable driver
    ├── EffectsController.ts Effects panel DOM bindings
    ├── PresetController.ts  Preset selection UI + theme switching
    ├── ExportController.ts  Export button and progress
    └── MobileController.ts  Media Session, Fullscreen, Haptic, Visibility APIs
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
| Node graph size | 9–12 nodes (source → rate → effects chain → convolver → 8D panner → gains → destination) |
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
| PWA service worker | `sw.js` caches app shell assets only — audio data is never cached or stored |

For reporting a vulnerability, see [SECURITY.md](SECURITY.md).

<br/>

---

<br/>

<div align="center">

<sub><a href="README.md">Back to README</a> • <a href="ROADMAP.md">Roadmap</a> • <a href="CONTRIBUTING.md">Contributing</a></sub>

</div>
