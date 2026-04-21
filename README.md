<br/>

<div align="center">

<img src="docs/assets/slo-fi-banner.svg" alt="Slo-Fi" width="100%"/>

<br/>

# SLO-FI

**A browser-based audio studio. Drop a track. The orb comes alive.**

<br/>

[![Live App](https://img.shields.io/badge/▶%20Open%20App-slofi.live-A855F7.svg?style=for-the-badge)](https://slofi.live)

<br/>

[![Version](https://img.shields.io/badge/Version-2.1.0-A855F7.svg?style=flat-square)](https://github.com/gurvinny/Slo-Fi/releases)
[![License](https://img.shields.io/badge/License-MIT-A855F7.svg?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r183-black.svg?style=flat-square&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Privacy First](https://img.shields.io/badge/Privacy-First-10B981.svg?style=flat-square&logo=lock&logoColor=white)](#-privacy--security)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-10B981.svg?style=flat-square&logo=github&logoColor=white)](CONTRIBUTING.md)

<br/>

<p>
  <a href="#-what-it-does">What It Does</a> &nbsp;·&nbsp;
  <a href="#-features">Features</a> &nbsp;·&nbsp;
  <a href="#-tech-stack">Tech Stack</a> &nbsp;·&nbsp;
  <a href="#-privacy--security">Privacy</a> &nbsp;·&nbsp;
  <a href="#-get-started">Get Started</a>
</p>

</div>

---

## ✦ What It Does

Slo-Fi is a **fully client-side audio processing app** that runs entirely in the browser — no server, no uploads, no account. Drop any audio file and it gives you a real-time studio: slow the track down, shape the reverb, tune pitch and EQ, and watch a 3D WebGL orb react to every beat.

Built as a demonstration of what the Web Audio API and WebGL can do together at production quality. Everything processes on-device. Nothing touches a server.

---

## ✦ Features

| | |
|:---|:---|
| **Playback Speed** | 25%–170% with no pitch artifacts — tempo changes, key stays locked |
| **Reverb Engine** | True convolution reverb with adjustable mix, decay, and room size |
| **3-Band EQ** | Low / mid / high shelf with ±12 dB range |
| **Pitch Shift** | ±12 semitones, fully independent of speed |
| **Chorus + Saturation** | Shimmer, width, and analog warmth |
| **Key Detection** | Chromagram analysis runs offline on load — all 12 roots, major/minor |
| **BPM Detection** | Real-time onset detection from the live FFT stream, updates with speed |
| **Loop Region** | Drag handles on the waveform to set in/out points with crossfade |
| **8D Audio** | Binaural HRTF spatial processing — sound orbits your head |
| **WAV Export** | Download the fully processed, effected track |
| **Presets** | Lo-Fi · Vaporwave · Ambient · Hyperpop — each switches audio and visuals |
| **PWA** | Installs to home screen, works offline, lock screen media controls |

### The Orb

At the center of Slo-Fi is a **3D audio-reactive sphere** built with Three.js and custom GLSL shaders. Bass pushes the geometry outward. Mid frequencies ripple the surface in layered simplex noise. Treble ignites a particle field. Every visual parameter — reactivity, glow, rotation, wireframe, particle count — is adjustable live.

---

## ✦ Tech Stack

| Layer | Technology |
|:---|:---|
| Language | TypeScript 5.x |
| Build | Vite 8.x |
| 3D / WebGL | Three.js r183 + custom GLSL shaders |
| Audio | Web Audio API — convolution reverb, analyser, BPM/key detection |
| Visuals | Post-processing bloom via `EffectComposer`, simplex noise displacement |
| Styling | Tailwind CSS v4 |
| Deployment | Cloudflare Pages |
| Self-hosting | Docker + nginx |

---

## ✦ Privacy & Security

**Audio never leaves the device.**

Slo-Fi processes everything inside the browser using the Web Audio API. There is no backend receiving files, no analytics, no third-party scripts, no telemetry of any kind.

| | |
|:---|:---:|
| Audio processed entirely on-device | ✅ |
| Zero network requests for audio data | ✅ |
| No accounts, no tracking, no telemetry | ✅ |
| All dependencies bundled — no CDN calls at runtime | ✅ |
| Audio cleared from memory on tab close | ✅ |
| Service worker caches app shell only — never audio | ✅ |

See [SECURITY.md](SECURITY.md) for the full architecture and responsible disclosure policy.

---

## ✦ Get Started

### Live

**[slofi.live](https://slofi.live)** — open it, drop a track, done. Works on any modern browser, no install required.

### Local

```bash
git clone https://github.com/gurvinny/Slo-Fi.git
cd Slo-Fi
npm install
npm run dev        # dev server at localhost:5173
npm run build      # production build
npm run preview    # preview the build locally
```

### Docker

```bash
docker compose up -d   # builds and serves via nginx
```

---

## ✦ Architecture

Detailed breakdown of the audio engine, shader pipeline, and PWA service worker in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## ✦ Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch conventions, dev setup, and PR checklist.

---

## 📄 License

MIT — see [LICENSE](LICENSE).

<br/>

<div align="center">

[![GitHub Stars](https://img.shields.io/github/stars/gurvinny/Slo-Fi?style=flat-square&color=A855F7&label=Stars)](https://github.com/gurvinny/Slo-Fi/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/gurvinny/Slo-Fi?style=flat-square&color=06B6D4&label=Forks)](https://github.com/gurvinny/Slo-Fi/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/gurvinny/Slo-Fi?style=flat-square&color=A855F7&label=Issues)](https://github.com/gurvinny/Slo-Fi/issues)

</div>
