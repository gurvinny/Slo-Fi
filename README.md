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
> *and deep, ethereal reverb. No downloads, no lag — just pure atmospheric bliss.*

<br/>

[![Version](https://img.shields.io/badge/Version-1.0.0-A855F7.svg?style=flat-square&logo=semanticversioning&logoColor=white)](#-roadmap)
[![License](https://img.shields.io/badge/License-MIT-A855F7.svg?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF.svg?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Web Audio API](https://img.shields.io/badge/Web_Audio_API-4A154B.svg?style=flat-square&logo=audiomack&logoColor=white)](#-architecture--technical-deep-dive)
[![Privacy First](https://img.shields.io/badge/Privacy-First-10B981.svg?style=flat-square&logo=lock&logoColor=white)](#-security--privacy)
[![Contributing](https://img.shields.io/badge/PRs-Welcome-10B981.svg?style=flat-square&logo=github&logoColor=white)](CONTRIBUTING.md)
[![Code of Conduct](https://img.shields.io/badge/Code_of_Conduct-Contributor_Covenant-ff69b4.svg?style=flat-square)](CODE_OF_CONDUCT.md)
[![Security](https://img.shields.io/badge/Security-Responsible_Disclosure-06B6D4.svg?style=flat-square&logo=shield&logoColor=white)](SECURITY.md)

<br/>

<p>
  <a href="#-features">Features</a> •
  <a href="#-architecture--technical-deep-dive">Architecture</a> •
  <a href="#-security--privacy">Security</a> •
  <a href="#-getting-started">Get Started</a> •
  <a href="#-roadmap">Roadmap</a> •
  <a href="#-contributing--community">Contributing</a>
</p>

<br/>

<sub>Real-time slowing + reverb applied to a local audio file — entirely in the browser.</sub>

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
| 🎛️ | **Preset System** | One-click Lo-Fi, Vaporwave, Ambient, and Custom presets. Each dialing in speed, reverb, EQ, and chorus for an instant vibe. |
| 📊 | **Waveform + Spectrum Analyzer** | Interactive seekable waveform and live FFT spectrum visualizer. See the music while you hear it. |
| 🎹 | **MIDI Controller Support** | Map any hardware MIDI CC to speed, reverb, volume, or effects parameters. Perform your mix live. |
| 🔊 | **Effects Chain** | 3-band EQ, chorus (rate + depth), and tape saturation in a collapsible effects panel. |
| 📤 | **Audio Export** | Export your slowed + processed audio as a WAV file directly from the browser. |
| 🌐 | **Collaborative Sessions** | Share a real-time session via WebRTC. Two people, one vibe, synced playback and controls. |
| 🔒 | **Local-First & Zero Upload** | Audio never leaves your machine. Every byte is processed client-side via `AudioContext`. Zero network requests for audio. Zero telemetry. |
| 📱 | **Fully Responsive PWA** | Installable on any device. Designed for late-night sessions on desktop, tablet, or phone — offline-capable with a registered Service Worker. |
| 🎨 | **Late-Night Interface** | Dark-first UI with soft neon accents. Designed to feel like a professional DAW plugin, not a web toy. |

<br/>

---

<br/>

## 🔬 Architecture & Technical Deep-Dive

Slo-Fi is built entirely on the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), creating a zero-dependency audio processing pipeline that runs at native speed inside the browser's audio thread.

### Signal Flow

```
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────────┐    ┌─────────┐
│  Source   │───▶│  Playback    │───▶│  Effects     │───▶│  Convolver    │───▶│  Gain /      │───▶│  Audio  │
│  Buffer   │    │  Rate Node   │    │  Chain       │    │  Node         │    │  Master Out  │    │  Output │
└──────────┘    └──────────────┘    └──────────────┘    └───────────────┘    └──────────────┘    └─────────┘
   File I/O       Time-Stretch        EQ · Chorus ·        Reverb Engine         Volume Ctrl       destination
                                       Saturation
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
| Memory Footprint | ~10 MB per minute of stereo 44.1kHz audio |
| CPU Usage | Minimal — native Web Audio nodes run in compiled C++ behind the API |
| Node Graph Complexity | 7–10 nodes (source → rate → effects chain → convolver → gains → destination) |

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

To report a security issue, see [SECURITY.md](SECURITY.md).

<br/>

---

<br/>

## 🚀 Getting Started

### Prerequisites

- A modern browser with Web Audio API support (Chrome 35+, Firefox 25+, Safari 14.1+, Edge 79+)
- Node.js ≥ 18 (for local development only)

### Installation

```bash
# Clone the repository
git clone https://github.com/gurvinny/slo-fi.git
cd slo-fi

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Production Build

```bash
npm run build
npm run preview   # Preview the production build locally
```

### Usage

1. **Open Slo-Fi** in your browser.
2. **Drop an audio file** onto the interface (or click to browse). Supports `.mp3`, `.wav`, `.flac`, `.ogg`, and `.aac`.
3. **Pick a preset** — Lo-Fi, Vaporwave, or Ambient — for an instant vibe, or build your own with Custom.
4. **Adjust the speed** using the rate slider — dial it down to 0.85× for classic slowed, or go deeper.
5. **Shape the reverb** — increase Decay for longer tails, expand Room Size for that infinite-hall feel.
6. **Dial in the effects chain** — sculpt tone with the 3-band EQ, add shimmer with Chorus, add warmth with Tape Drive.
7. **Export** your processed track as a WAV download when you're done.
8. **Press play.** Welcome to the late-night studio.

<br/>

---

<br/>

## 🗺️ Roadmap

### v1.0 — Complete

All features shipped. The core engine and full feature set are live.

| Status | Feature |
|:---:|:---|
| ✅ | Core time-stretching engine (0.25× – 1.0×) |
| ✅ | Convolution reverb with synthetic IR generation |
| ✅ | Responsive dark-mode UI |
| ✅ | Preset system (Lo-Fi, Vaporwave, Ambient, Custom) |
| ✅ | Audio export as WAV download |
| ✅ | Waveform + real-time spectrum analyzer |
| ✅ | MIDI CC controller mapping |
| ✅ | Effects chain (3-band EQ, Chorus, Tape Saturation) |
| ✅ | Collaborative sessions via WebRTC |

<br/>

### v2.0 — Dark Glass Redesign

A major visual and experiential overhaul. The audio engine stays — everything the user sees and touches gets rebuilt with a modern dark glassmorphism aesthetic, beautiful on both mobile and desktop.

| Area | Feature | Description |
|:---:|:---|:---|
| 🎨 | **Dark Glassmorphism Design System** | Full UI rebuild: frosted panels, `backdrop-filter: blur(24px)`, neon border glow, unified glass design language. |
| 🎨 | **Aurora Animated Background** | Subtle CSS keyframe aurora gradient — deep purples and teals breathing behind the glass UI. Zero JS cost. |
| 📱 | **Mobile-First Responsive Layout** | Rebuilt grid for phones and tablets. Touch-sized targets, swipe-to-scrub waveform, pinch-to-zoom. |
| 📱 | **PWA Full-Screen + Haptic Feedback** | Full-screen mode on mobile. Vibration API on play/pause/scrub for tactile feedback. |
| ✨ | **Animated Glassmorphic Preset Cards** | Preset buttons replaced with rich glass cards — animated on hover, glow on active. |
| 🎚️ | **Floating Glass Control Panels** | Controls stack vertically on mobile, float as overlay panels on desktop for a DAW-like feel. |
| 🔊 | **Beat Detection + BPM Display** | Onset detection via `AnalyserNode`. Real-time BPM readout in the player header. |
| 🔁 | **Loop Region Selection** | Drag handles on the waveform to set in/out loop points. Seamless looping for practice or production. |
| 🎹 | **Visual MIDI Mapping UI** | Overlay showing assignable parameters with visual piano/pad — click to assign, no manual CC entry. |
| 🌐 | **Enhanced Collab — Presence + Chat** | Collab panel overhaul with live cursors on the waveform, typing indicators, and a minimal text chat. |
| ♿ | **WCAG 2.1 AA Accessibility** | Full keyboard navigation, ARIA roles, focus rings, and contrast ratios meeting AA standard across all themes. |
| 🚀 | **OfflineAudioContext Export** | Faster-than-realtime export using `OfflineAudioContext` — large files export in seconds, not minutes. |
| 🎵 | **Multi-File Session** | Load multiple audio files simultaneously. Switch between tracks instantly, queue them, or layer stems in a single session. |
| ⚡ | **Hyperpop Preset** | A dedicated preset tuned for hyperpop production — pitched-up playback, heavy distortion, tight gated reverb, and maxed chorus for that chaotic hyper-compressed sound. |

<br/>

---

<br/>

## 🤝 Contributing & Community

Contributions, bug reports, and feature ideas are all welcome. Before opening a PR, please read the relevant doc:

| Document | Purpose |
|:---|:---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup, branch conventions, PR checklist, code style |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community standards and enforcement policy |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability responsibly |

```bash
# Quick contribution flow
git checkout -b feat/your-feature
npm run lint
git commit -m "feat: add your feature"
git push origin feat/your-feature
# then open a Pull Request
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

[![GitHub Stars](https://img.shields.io/github/stars/gurvinny/slo-fi?style=flat-square&color=A855F7&label=Stars)](https://github.com/gurvinny/slo-fi/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/gurvinny/slo-fi?style=flat-square&color=06B6D4&label=Forks)](https://github.com/gurvinny/slo-fi/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/gurvinny/slo-fi?style=flat-square&color=A855F7&label=Issues)](https://github.com/gurvinny/slo-fi/issues)

</div>
