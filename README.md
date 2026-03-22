<br/>

<div align="center">

<img src="docs/assets/slo-fi-banner.svg" alt="Slo-Fi — v2 Anomaly" width="100%"/>

<br/>

# 𝚂 𝙻 𝙾 - 𝙵 𝙸

### ✦ Your Browser Is the Studio ✦

> *Drop a track. Watch it come alive.*
> *A living orb pulses with every beat. Reverb fills the room.*
> *No installs. No uploads. Just music.*

<br/>

[![Milestone](https://img.shields.io/badge/v2.0-Anomaly-06B6D4.svg?style=flat-square&logo=semanticversioning&logoColor=white)](https://github.com/gurvinny/Slo-Fi/milestone/2)
[![Version](https://img.shields.io/badge/Version-2.0.0-A855F7.svg?style=flat-square)](https://github.com/gurvinny/Slo-Fi/releases)
[![License](https://img.shields.io/badge/License-MIT-A855F7.svg?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF.svg?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-r183-black.svg?style=flat-square&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Privacy First](https://img.shields.io/badge/Privacy-First-10B981.svg?style=flat-square&logo=lock&logoColor=white)](#-privacy--security)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-10B981.svg?style=flat-square&logo=github&logoColor=white)](CONTRIBUTING.md)

<br/>

<p>
  <a href="#-the-orb">The Orb</a> •
  <a href="#-anomaly">Anomaly</a> •
  <a href="#-features">Features</a> •
  <a href="#-privacy--security">Privacy</a> •
  <a href="#-get-started">Get Started</a> •
  <a href="#-contributing--community">Contributing</a>
</p>

<br/>

</div>

---

<br/>

## ✦ The Orb

At the center of Slo-Fi lives a **3D audio-reactive orb** — a breathing, pulsing sphere built with Three.js and driven entirely by your music in real time.

It is not a visualizer bolted on after the fact. It is the interface. Drop a track and watch it morph.

- **Bass hits** push the orb outward, swelling its geometry with every kick and sub
- **Mid frequencies** ripple across the surface in waves of layered simplex noise
- **Treble energy** ignites the star field and crackles across the surface
- **Aurora gradients** bleed across the background, shifting color as the frequency balance changes
- **Beat pulse** syncs the entire UI — screen-edge vignette, aurora breathing, everything — to every kick

The orb is fully customizable from the Visual Settings panel:

| Setting | What it does |
|:---|:---|
| Reactivity | How aggressively audio displaces the geometry |
| Glow | Bloom intensity and light bleed |
| Size | Scale from compact to room-filling |
| Rotation | Speed of the idle spin |
| Particles | Orbiting particles around the surface (0–500+) |
| Bass Pulse | Toggle beat-synced size expansion |
| Wireframe | Swap the solid surface for a geometric wire mesh |
| Star Field | Particle density behind the orb, scales with treble |

Six color themes change the entire palette at once — **Prism** (hue shifts with the music), **Void**, **Neon**, **Ember**, **Frost**, and **Mono**.

<br/>

---

<br/>

## ✦ Anomaly

v2 is a complete reimagining of what Slo-Fi can be.

The audio engine was already there. Everything the user sees and touches has been rebuilt — dark glassmorphic panels, aurora gradients, a landing page that eases you in, a 3D orb that IS the interface. The features followed: BPM detection, key detection, pitch control, 8D audio, loop region selection, full mobile support, a PWA you can install to your home screen.

**Anomaly** is the name of the milestone. Named after the orb class at the heart of it all — the `AnomalySphere`.

> *The orb wakes up. The studio follows.*

<br/>

---

<br/>

## ✦ Features

### Slow it down. Keep it perfect.

Dial your track anywhere from **full speed down to 25%** without a single pitch artifact. The tempo changes. The key stays exactly where it should. No chipmunks. No demons. Just the music, stretched into something new.

---

### Reverb that breathes.

Slo-Fi uses **true convolution reverb** — the same algorithm in professional studio plugins — to produce reverb tails that feel physically real. Crank the Room Size and Decay and disappear into a cathedral. Dial it tight for a warm studio booth. The space is yours to sculpt.

---

### Know your key.

Drop a track and Slo-Fi tells you **what key it's in**. The chromagram analysis runs offline on load — no cloud, no API. Major or minor, all 12 roots. It updates as you slow down so you always know exactly where the music lives.

---

### Bend the pitch.

Shift the pitch **±12 semitones** independently of speed. Slow it down and bring it up a third. Speed it up and drop it down an octave. Speed and pitch are finally decoupled — shape them however the vibe demands.

---

### Hear in three dimensions.

**8D audio** uses binaural HRTF spatial processing to make sound rotate around your head. Put on headphones and the track moves — circling, drifting, wrapping. Turn it on, close your eyes, and hear the music from inside the room.

---

### Feel the beat.

Real-time **BPM detection** reads onset data from the live FFT stream. The readout lives right under the track title and updates as you change playback speed — so you always know the tempo you're actually working at.

---

### Loop what matters.

Drag handles on the waveform to set in and out points. The loop region plays seamlessly, with cross-fade. Set it tight for a sample, wide for a texture. **This is the section. Replay it forever.**

---

### A full effects chain, not just sliders.

Go deeper with a built-in studio-grade effects stack:

- **3-Band EQ** — shape tone from sub to air
- **Chorus** — shimmer, widen, float
- **Tape Saturation** — warmth, grit, analog edge

---

### One click to a vibe.

Four built-in presets dial in the mood instantly:

- **Lo-Fi** — warm, slow, intimate. Coffee shop at 2am.
- **Vaporwave** — saturated, dreamy, nostalgic. Mallsoft forever.
- **Ambient** — open, spacious, endless. 432 Hz. Just breathe.
- **Hyperpop** — bright, fast, distorted. Maximum chaos.
- **Custom** — your settings, your way.

Each preset switches the orb theme along with the audio. Lo-Fi goes **Void**. Vaporwave goes **Neon**. Ambient goes **Mono**. Hyperpop goes **Ember**.

---

### See the music.

An interactive **seekable waveform** and a live **FFT spectrum analyzer** let you watch the frequency content move in real time. Click anywhere on the waveform to jump to that moment. Loop region handles live right in the waveform. The spectrum bars spark particles at peak energy.

---

### Install it. Take it offline.

Slo-Fi is a **Progressive Web App**. Install it to your home screen from any browser and it works with no internet connection — the same as the full experience, completely offline.

On mobile it goes further: **haptic feedback** on play, pause, and seek. **Lock screen controls** via the Media Session API so you can scrub without unlocking your phone. **Full-screen mode** for immersive playback. Your audio session stays alive in the background.

---

### Export what you made.

When the vibe is right, hit export and get a **WAV download** of your fully processed, slowed, reverbed, effected track — ready to post, sample, or keep.

<br/>

---

<br/>

## 🔒 Privacy & Security

**Your audio never leaves your device. Full stop.**

Everything in Slo-Fi is processed inside your browser using the Web Audio API. There is no server receiving your files, no analytics watching your session, no third-party scripts. Close the tab and every byte of audio is gone.

| Guarantee | |
|:---|:---:|
| Audio processed entirely on-device | ✅ |
| Zero network requests for audio data | ✅ |
| No accounts, no tracking, no telemetry | ✅ |
| All dependencies bundled — no CDN calls | ✅ |
| Audio cleared from memory on tab close | ✅ |
| PWA service worker caches assets only — never audio | ✅ |

For the full security architecture and responsible disclosure policy, see [SECURITY.md](SECURITY.md).

<br/>

---

<br/>

## 🚀 Get Started

### Use it in the browser

Supports **Chrome 35+, Firefox 25+, Safari 14.1+, Edge 79+**. No install required.

### Run it locally

```bash
git clone https://github.com/gurvinny/Slo-Fi.git
cd Slo-Fi
npm install
npm run dev
```

Open `http://localhost:5173`, drop a track, and the orb comes to life.

```bash
npm run build    # production build
npm run preview  # preview the build locally
```

### How to use it

1. Drop any `.mp3`, `.wav`, `.flac`, `.ogg`, or `.aac` file onto the interface
2. Watch the orb wake up and sync to the music
3. Check the key and BPM displayed under the track title
4. Pick a preset — or dial in your own speed, reverb, effects, and pitch
5. Open Visual Settings to customize the orb, theme, particles, and star field
6. Set loop points on the waveform if you want to work a specific section
7. Export your track as a WAV when you're done

<br/>

---

<br/>

## 🤝 Contributing & Community

Contributions are welcome — whether that's a bug fix, a new feature, or just improving the docs.

| Document | |
|:---|:---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Dev setup, branch conventions, PR checklist, code style |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community standards |
| [SECURITY.md](SECURITY.md) | Responsible disclosure policy |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the audio engine works |
| [ROADMAP.md](ROADMAP.md) | v2 Anomaly — what shipped and what's pending |

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

[![GitHub Stars](https://img.shields.io/github/stars/gurvinny/Slo-Fi?style=flat-square&color=A855F7&label=Stars)](https://github.com/gurvinny/Slo-Fi/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/gurvinny/Slo-Fi?style=flat-square&color=06B6D4&label=Forks)](https://github.com/gurvinny/Slo-Fi/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/gurvinny/Slo-Fi?style=flat-square&color=A855F7&label=Issues)](https://github.com/gurvinny/Slo-Fi/issues)

</div>
