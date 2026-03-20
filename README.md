<br/>
<div align="center">

<!-- ═══════════════════════════════════════════════════════════ -->
<!--                        HERO SECTION                        -->
<!-- ═══════════════════════════════════════════════════════════ -->

<img src="docs/assets/slo-fi-banner.svg" alt="Slo-Fi Banner" width="100%"/>

<br/>

# 𝚂 𝙻 𝙾 - 𝙵 𝙸

### ✦ Your Browser Is the Studio ✦

> *Slo-Fi turns your browser into a late-night studio.*
> *Experience your favorite tracks in a new dimension with professional-grade slowing*
> *and deep, ethereal reverb. No downloads, no lag—just pure atmospheric bliss.*

<br/>

[![License](https://img.shields.io/badge/License-MIT-A855F7.svg?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Repo Size](https://img.shields.io/github/repo-size/YOUR_USERNAME/slo-fi?style=flat-square&color=06B6D4&label=Repo%20Size)](https://github.com/YOUR_USERNAME/slo-fi)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2024-F7DF1E.svg?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26.svg?style=flat-square&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6.svg?style=flat-square&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![Web Audio API](https://img.shields.io/badge/Web_Audio_API-4A154B.svg?style=flat-square&logo=audiomack&logoColor=white)](#-architecture--technical-deep-dive)
[![Privacy First](https://img.shields.io/badge/🔒_Privacy-First-10B981.svg?style=flat-square)](#-security--privacy)

<br/>

<p>
  <a href="#-features">Features</a> •
  <a href="#-architecture--technical-deep-dive">Architecture</a> •
  <a href="#-security--privacy">Security & Privacy</a> •
  <a href="#-getting-started">Get Started</a> •
  <a href="#-roadmap">Roadmap</a>
</p>

<br/>

<sub>↑ Real-time slowing + reverb applied to a local audio file — entirely in the browser.</sub>

</div>

<br/>

---

<br/>

## ✦ Features

| | Feature | Description |
|:---:|:---|:---|
| 🎚️ | **Real-Time Time-Stretching** | Slow tracks from 0.25× to 1.0× without pitch artifacts. Powered by the native `AudioContext.playbackRate` and custom grain-based stretching. |
| 🏛️ | **Convolution Reverb Engine** | Load impulse responses or generate synthetic ones. Tweak **Decay** and **Room Size** to sculpt spaces from tight booths to infinite cathedrals. |
| 🎵 | **Pitch-Perfect Playback** | Maintain original pitch integrity while manipulating tempo — no chipmunks, no demons, just the music. |
| ⚡ | **Low-Latency Processing** | Sub-10ms signal chain built on the Web Audio API's real-time audio graph. No perceptible lag between control input and output. |
| 🔒 | **Local-First & Zero Upload** | Audio never leaves your machine. Every byte is processed client-side via `AudioContext`. Zero network requests. Zero telemetry. |
| 📱 | **Fully Responsive PWA** | Installable on any device. Designed for late-night sessions on desktop, tablet, or phone — offline-capable with a registered Service Worker. |
| 🎨 | **Late-Night Interface** | Dark-first UI with soft neon accents. Designed to feel like a professional DAW plugin, not a web toy. |

<br/>

---

<br/>

## 🔬 Architecture & Technical Deep-Dive

Slo-Fi is built entirely on the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), creating a zero-dependency audio processing pipeline that runs at native speed inside the browser's audio thread.

### Signal Flow

```
┌──────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────────┐    ┌─────────┐
│  Source   │───▶│  Playback    │───▶│  Convolver    │───▶│  Gain /      │───▶│  Audio  │
│  Buffer   │    │  Rate Node   │    │  Node         │    │  Master Out  │    │  Output │
└──────────┘    └──────────────┘    └───────────────┘    └──────────────┘    └─────────┘
   File I/O       Time-Stretch        Reverb Engine         Volume Ctrl       destination
```

### Core Components

#### `AudioContext` — The Runtime

The entire processing graph lives inside a single `AudioContext` instance. Audio is decoded from the user's local file into an `AudioBuffer`, then routed through a chain of connected nodes. The context's sample rate is locked to the device's native rate (typically 44.1kHz or 48kHz) for zero-resampling overhead.

```typescript
const ctx = new AudioContext({ latencyHint: 'interactive' });
const source = ctx.createBufferSource();
source.buffer = decodedAudio;
source.playbackRate.value = 0.85; // 85% speed — the sweet spot
```

#### `ConvolverNode` — Reverb That Breathes

Rather than relying on basic delay-line reverbs, Slo-Fi uses the `ConvolverNode` for true **convolution reverb** — the same algorithm used in professional studio plugins. The node convolves the input signal with an impulse response (IR), producing reverb tails that are physically accurate.

```typescript
const convolver = ctx.createConvolver();
convolver.buffer = impulseResponseBuffer; // Pre-computed or loaded IR

// Dry/Wet mixing via parallel gain nodes
const dryGain = ctx.createGain();
const wetGain = ctx.createGain();

source.connect(dryGain).connect(ctx.destination);
source.connect(convolver).connect(wetGain).connect(ctx.destination);
```

**Synthetic IR Generation:** When no external impulse response is loaded, Slo-Fi generates one algorithmically — computing an exponential decay curve at the configured room size and decay time, then filling a stereo `AudioBuffer` with shaped noise. This runs once on parameter change and feeds directly into the `ConvolverNode`.

#### Performance Characteristics

| Metric | Value |
|:---|:---|
| Audio Thread Latency | < 10ms (`latencyHint: 'interactive'`) |
| Memory Footprint | Proportional to audio file length; ~10 MB per minute of stereo 44.1kHz |
| CPU Usage | Minimal — native Web Audio nodes run in compiled C++ behind the API |
| Node Graph Complexity | 5–7 nodes (source → rate → convolver → gains → destination) |

<br/>

---

<br/>

## 🔒 Security & Privacy

> **Built by a security-minded engineer.** Slo-Fi was designed with the same rigor expected of privacy-sensitive applications.

### Zero-Trust Audio Pipeline

| Principle | Implementation |
|:---|:---|
| **No Server Uploads** | Audio files are read via the `FileReader` API and decoded locally with `AudioContext.decodeAudioData()`. No `fetch()`, no `XMLHttpRequest`, no WebSocket — the network stack is never invoked for audio data. |
| **No Third-Party Scripts** | Zero analytics, zero tracking pixels, zero CDN-loaded libraries at runtime. Every dependency is bundled and auditable. |
| **No Persistent Storage of Audio** | Audio buffers exist only in memory for the duration of playback. Closing or refreshing the tab deallocates all `AudioBuffer` instances. Nothing is written to `localStorage`, `IndexedDB`, or the filesystem. |
| **Content Security Policy** | Strict CSP headers prevent inline script injection and restrict resource origins. |
| **Subresource Integrity** | All external resources (if any) are loaded with SRI hashes to prevent tampering. |

### Threat Model Summary

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
                    │   Internet   │  ← No connection made
                    └──────────────┘
```

*This architecture makes Slo-Fi suitable for processing sensitive or unreleased audio material. Your files are your files.*

<br/>

---

<br/>

## 🚀 Getting Started

### Prerequisites

- A modern browser with Web Audio API support (Chrome 35+, Firefox 25+, Safari 14.1+, Edge 79+)
- Node.js ≥ 18 (for local development)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/slo-fi.git
cd slo-fi

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173` (or your configured port).

### Production Build

```bash
npm run build
npm run preview   # Preview the production build locally
```

### Usage

1. **Open Slo-Fi** in your browser.
2. **Drop an audio file** onto the interface (or click to browse). Supports `.mp3`, `.wav`, `.flac`, `.ogg`, and `.aac`.
3. **Adjust the speed** using the rate slider — dial it down to 0.85× for classic slowed, or go deeper.
4. **Shape the reverb** — increase Decay for longer tails, expand Room Size for that infinite-hall feel.
5. **Press play.** Welcome to the late-night studio.

<br/>

---

<br/>

## 🗺️ Roadmap

| Phase | Feature | Status |
|:---:|:---|:---:|
| 🟢 | Core time-stretching engine | ✅ Complete |
| 🟢 | Convolution reverb with synthetic IR | ✅ Complete |
| 🟢 | Responsive dark-mode UI | ✅ Complete |
| 🟡 | Preset system (Lo-Fi, Vaporwave, Ambient, Custom) | 🔧 In Progress |
| 🟡 | Audio export / download processed track | 🔧 In Progress |
| ⚪ | Visualizer (waveform + spectrum analyzer) | 📋 Planned |
| ⚪ | MIDI controller mapping | 📋 Planned |
| ⚪ | Additional effects chain (EQ, Chorus, Tape Saturation) | 📋 Planned |
| ⚪ | Collaborative sessions via WebRTC | 📋 Planned |

<br/>

---

<br/>

## 🤝 Contributing

Contributions are welcome. Please read the [Contributing Guide](CONTRIBUTING.md) before opening a PR.

```bash
# Fork → Clone → Branch → Commit → Push → PR
git checkout -b feature/your-feature
npm run lint && npm test
git commit -m "feat: add your feature"
git push origin feature/your-feature
```

<br/>

---

<br/>

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

<br/>

---

<br/>

<div align="center">

<sub>Built with obsessive attention to audio fidelity and user privacy.</sub>

<br/>

<sub>If Slo-Fi helped you find a new way to hear your favorite tracks, consider leaving a ⭐</sub>

<br/><br/>

[![GitHub Stars](https://img.shields.io/github/stars/YOUR_USERNAME/slo-fi?style=flat-square&color=A855F7&label=Stars)](https://github.com/YOUR_USERNAME/slo-fi/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/YOUR_USERNAME/slo-fi?style=flat-square&color=06B6D4&label=Forks)](https://github.com/YOUR_USERNAME/slo-fi/network/members)

</div>
