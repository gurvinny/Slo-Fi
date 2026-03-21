<div align="center">

<img src="docs/assets/slo-fi-banner.svg" alt="Slo-Fi Banner" width="100%"/>

<br/>

# Roadmap

### ✦ Where Slo-Fi has been and where it's going ✦

[![Version](https://img.shields.io/badge/Current-v1.0.0-A855F7.svg?style=flat-square&logo=semanticversioning&logoColor=white)](https://github.com/gurvinny/Slo-Fi/releases/tag/v1.0.0)
[![Milestone v2.0](https://img.shields.io/badge/Next-v2.0.0-06B6D4.svg?style=flat-square)](https://github.com/gurvinny/Slo-Fi/milestone/2)
[![Open Issues](https://img.shields.io/github/issues/gurvinny/Slo-Fi?style=flat-square&color=A855F7&label=Open%20Issues)](https://github.com/gurvinny/Slo-Fi/issues)

<p>
  <a href="#v10--complete">v1.0 — Complete</a> •
  <a href="#v20--dark-glass-redesign">v2.0 — Planned</a>
</p>

</div>

<br/>

---

<br/>

## v1.0 — Complete

All features shipped. The core engine and full feature set are live in the [v1.0.0 release](https://github.com/gurvinny/Slo-Fi/releases/tag/v1.0.0).

| Status | Feature | Description |
|:---:|:---|:---|
| ✅ | **Core time-stretching engine** | 0.25× – 1.0× playback rate with no pitch artifacts |
| ✅ | **Convolution reverb** | True ConvolverNode reverb with synthetic IR generation |
| ✅ | **Responsive dark-mode UI** | Late-night aesthetic with neon accents, works on all screen sizes |
| ✅ | **Preset system** | Lo-Fi, Vaporwave, Ambient, and Custom one-click presets |
| ✅ | **Audio export** | WAV download of the fully processed, slowed, effected track |
| ✅ | **Waveform + spectrum analyzer** | Seekable time-domain waveform and live FFT frequency display |
| ✅ | **MIDI CC controller mapping** | Map any hardware knob or fader to any parameter |
| ✅ | **Effects chain** | 3-band EQ, Chorus (rate + depth), Tape Saturation |

<br/>

---

<br/>

## v2.0 — Dark Glass Redesign

A major visual and experiential overhaul. The audio engine stays — everything the user sees and touches gets rebuilt with a modern dark glassmorphism aesthetic, beautiful on both mobile and desktop.

Track progress on the [v2.0 milestone](https://github.com/gurvinny/Slo-Fi/milestone/2).

<br/>

### Design & UI

| Issue | Feature | Description |
|:---:|:---|:---|
| [#7](https://github.com/gurvinny/Slo-Fi/issues/7) | **Dark Glassmorphism Design System** | Full UI rebuild: frosted panels, `backdrop-filter: blur(24px)`, neon border glow, unified glass design language across every component. |
| [#8](https://github.com/gurvinny/Slo-Fi/issues/8) | **Aurora Animated Background** | Subtle CSS keyframe aurora gradient — deep purples and teals breathing behind the glass UI. Zero JS runtime cost. |
| [#11](https://github.com/gurvinny/Slo-Fi/issues/11) | **Animated Glassmorphic Preset Cards** | Preset buttons replaced with rich glass cards — animated on hover, glow on active. Each with its own visual identity. |
| [#12](https://github.com/gurvinny/Slo-Fi/issues/12) | **Floating Glass Control Panels** | Controls stack vertically on mobile, float as overlay panels on desktop for a DAW-like feel without cluttering the waveform. |

<br/>

### Mobile & PWA

| Issue | Feature | Description |
|:---:|:---|:---|
| [#9](https://github.com/gurvinny/Slo-Fi/issues/9) | **Mobile-First Responsive Layout** | Rebuilt grid for phones and tablets. Touch-sized targets (44px min), swipe-to-scrub waveform, pinch-to-zoom spectrum. |
| [#10](https://github.com/gurvinny/Slo-Fi/issues/10) | **PWA Full-Screen + Haptic Feedback** | Full-screen mode on mobile via the Fullscreen API. Vibration API feedback on play/pause/scrub. |

<br/>

### Audio Engine

| Issue | Feature | Description |
|:---:|:---|:---|
| [#13](https://github.com/gurvinny/Slo-Fi/issues/13) | **Beat Detection + BPM Display** | Onset detection via `AnalyserNode` FFT data. Real-time BPM readout in the player header that updates as playback speed changes. |
| [#14](https://github.com/gurvinny/Slo-Fi/issues/14) | **Loop Region Selection** | Drag handles on the waveform to set in/out loop points. Seamless looping for practice, sampling, or production. |
| [#18](https://github.com/gurvinny/Slo-Fi/issues/18) | **OfflineAudioContext Export** | Faster-than-realtime export — a 10-minute track exports in seconds, not 10 minutes. Full effects chain reproduced faithfully. |
| [#21](https://github.com/gurvinny/Slo-Fi/issues/21) | **8D Audio Effect** | Binaural `PannerNode` with `HRTF` model automating a circular rotation path. Designed for headphone listening — creates the illusion of sound moving in 3D space. |

<br/>

### Presets & Sessions

| Issue | Feature | Description |
|:---:|:---|:---|
| [#19](https://github.com/gurvinny/Slo-Fi/issues/19) | **Multi-File Session** | Load multiple audio files simultaneously. Switch between tracks instantly, queue them, or browse a session list — all in-memory, nothing uploaded. |
| [#20](https://github.com/gurvinny/Slo-Fi/issues/20) | **Hyperpop Preset** | Pitched-up, heavily distorted, tight gated reverb, maxed chorus. Built for the chaotic hyper-compressed sound of hyperpop production. |

<br/>

### MIDI

| Issue | Feature | Description |
|:---:|:---|:---|
| [#15](https://github.com/gurvinny/Slo-Fi/issues/15) | **Visual MIDI Mapping UI** | Overlay showing all assignable parameters with a visual piano/pad layout. Click a parameter to enter assign mode — no manual CC number entry. |

<br/>

### Quality & Accessibility

| Issue | Feature | Description |
|:---:|:---|:---|
| [#17](https://github.com/gurvinny/Slo-Fi/issues/17) | **WCAG 2.1 AA Accessibility** | Full keyboard navigation, ARIA roles, visible focus rings, and colour contrast ratios meeting the AA standard throughout the glass UI. |

<br/>

---

<br/>

<div align="center">

<sub><a href="README.md">Back to README</a> • <a href="ARCHITECTURE.md">Architecture</a> • <a href="CONTRIBUTING.md">Contributing</a></sub>

</div>
