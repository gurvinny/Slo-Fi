<div align="center">

<img src="docs/assets/slo-fi-banner.svg" alt="Slo-Fi Banner" width="100%"/>

<br/>

# Roadmap

### ✦ Where Slo-Fi has been and where it's going ✦

[![Current](https://img.shields.io/badge/Current-v3.0.0--dev-F97316.svg?style=flat-square&logo=semanticversioning&logoColor=white)](https://github.com/gurvinny/Slo-Fi/releases)
[![Milestone](https://img.shields.io/badge/v3.0-Meridian-F97316.svg?style=flat-square)](https://github.com/gurvinny/Slo-Fi/milestone/3)
[![Open Issues](https://img.shields.io/github/issues/gurvinny/Slo-Fi?style=flat-square&color=F97316&label=Open%20Issues)](https://github.com/gurvinny/Slo-Fi/issues)

<p>
  <a href="#v10--complete">v1.0 — Complete</a> •
  <a href="#v20--anomaly">v2.0 — Anomaly</a> •
  <a href="#v20--complete">v2.0 — Complete</a> •
  <a href="#v30--meridian">v3.0 — Meridian</a>
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
| ✅ | **Effects chain** | 3-band EQ, Chorus (rate + depth), Tape Saturation |

<br/>

---

<br/>

## v2.0 — Anomaly

A complete visual and experiential overhaul. Dark glassmorphism, aurora gradients, a 3D audio-reactive orb that IS the interface. Real-time music analysis. Full mobile PWA. The audio engine stays — everything the user sees and touches has been rebuilt.

Track remaining items on the [v2.0 milestone](https://github.com/gurvinny/Slo-Fi/milestone/2).

<br/>

### Design & UI

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| ✅ | [#7](https://github.com/gurvinny/Slo-Fi/issues/7) | **Dark Glassmorphism Design System** | Full UI rebuild: frosted panels, `backdrop-filter: blur(24px)`, neon border glow, unified glass design language across every component. |
| ✅ | [#8](https://github.com/gurvinny/Slo-Fi/issues/8) | **Aurora Animated Background** | CSS keyframe aurora gradient — deep purples and teals breathing behind the glass UI. Six theme variants. Audio-reactive via CSS variables. |
| ✅ | [#11](https://github.com/gurvinny/Slo-Fi/issues/11) | **Animated Glassmorphic Preset Cards** | Preset buttons replaced with rich glass cards — animated on hover, glow on active. Each with its own visual identity and theme. |
| ✅ | [#12](https://github.com/gurvinny/Slo-Fi/issues/12) | **Floating Glass Control Panels** | Three separate drawers: Controls, Effects, and Settings. Float as overlay panels on desktop, stack on mobile for a DAW-like feel. |
| ✅ | [#26](https://github.com/gurvinny/Slo-Fi/issues/26) | **Landing Page** | Animated intro with shimmer title, 3D orbit rings, scan line sweep, and smooth transition to the player on first file load. |
| ✅ | — | **Beat Pulse Site-Wide** | Beat-synced visual reactivity spread across the entire UI — screen-edge bass vignette, aurora breathing, orb expansion — all locked to the kick. |

<br/>

### Mobile & PWA

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| ✅ | [#9](https://github.com/gurvinny/Slo-Fi/issues/9) | **Mobile-First Responsive Layout** | Rebuilt grid for phones and tablets. Touch-sized targets (44px min), swipe-to-scrub waveform, pinch-to-zoom spectrum. Mobile scroll lock. |
| ✅ | [#10](https://github.com/gurvinny/Slo-Fi/issues/10) | **PWA Full-Screen + Haptic Feedback** | Full-screen mode via Fullscreen API. Vibration API feedback (12ms play, 8ms pause, 4ms seek). Media Session lock screen controls. Offline via service worker. |

<br/>

### Audio Engine

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| ✅ | [#13](https://github.com/gurvinny/Slo-Fi/issues/13) | **Beat Detection + BPM Display** | Onset detection via `AnalyserNode` FFT. Real-time BPM readout in the player header, updates as playback speed changes. |
| ✅ | [#14](https://github.com/gurvinny/Slo-Fi/issues/14) | **Loop Region Selection** | Drag handles on the waveform to set in/out loop points. Seamless looping with cross-fade for practice, sampling, or production. |
| ✅ | [#21](https://github.com/gurvinny/Slo-Fi/issues/21) | **8D Audio Effect + Hz Resonance** | Binaural `PannerNode` with `HRTF` model automating a circular rotation path. Optional Solfeggio Hz frequency tuning (e.g. 432 Hz). |
| ✅ | — | **Key Detection** | Offline chromagram analysis using the Krumhansl-Schmuckler algorithm. Detects major/minor key across all 12 roots. Displays under track title. |
| ✅ | — | **Pitch Control** | ±12 semitone pitch shift, fully independent of playback speed. Decouple tempo and key to shape the vibe exactly. |
| ✅ | [#18](https://github.com/gurvinny/Slo-Fi/issues/18) | **Faster-than-Realtime Export** | `OfflineAudioContext` rendering — a 10-minute track exports in seconds with the full effects chain reproduced faithfully. |

<br/>

### Presets & Sessions

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| ✅ | [#20](https://github.com/gurvinny/Slo-Fi/issues/20) | **Hyperpop Preset** | Pitched-up, heavily distorted, tight gated reverb, maxed chorus. Built for the chaotic hyper-compressed sound of hyperpop production. |
| ✅ | [#19](https://github.com/gurvinny/Slo-Fi/issues/19) | **Multi-File Playlist** | Load multiple audio files simultaneously. Switch between tracks instantly with auto-advance — all in-memory, nothing uploaded. |

<br/>

### Quality & Accessibility

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| ✅ | [#17](https://github.com/gurvinny/Slo-Fi/issues/17) | **WCAG 2.1 AA Accessibility** | Full keyboard navigation, ARIA roles, visible focus rings, and colour contrast ratios meeting the AA standard throughout the glass UI. |
| ✅ | [#44](https://github.com/gurvinny/Slo-Fi/issues/44) | **Prefers-Reduced-Motion Support** | Honour the `prefers-reduced-motion` media query across all CSS animations and Three.js transitions. |
| ✅ | [#46](https://github.com/gurvinny/Slo-Fi/issues/46) | **Keyboard Shortcut Help Overlay** | In-app overlay listing all keyboard shortcuts. Discoverable, dismissable, no external docs required. |

<br/>

### Mobile & PWA — Additions

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| ✅ | [#45](https://github.com/gurvinny/Slo-Fi/issues/45) | **iOS PWA Homescreen Assets** | Apple-specific meta tags, splash screen images, and homescreen icon assets for a polished iOS install experience. |

<br/>

### Performance

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| ✅ | [#40](https://github.com/gurvinny/Slo-Fi/issues/40) | **Tree-shake Three.js + Lazy-load Orb** | Import only the Three.js modules in use and defer `AnomalySphere` initialisation until after first file load to reduce initial bundle weight. |
| ✅ | [#41](https://github.com/gurvinny/Slo-Fi/issues/41) | **Throttle Visualiser RAF When Paused** | Pause `requestAnimationFrame` loops for the waveform and spectrum analyser when audio is not playing to eliminate idle CPU usage. |
| ✅ | [#42](https://github.com/gurvinny/Slo-Fi/issues/42) | **Pre-cache Assets in Service Worker** | Cache built JS/CSS assets in `sw.js` at install time so the app shell loads instantly on repeat visits, even offline. |
| ✅ | [#43](https://github.com/gurvinny/Slo-Fi/issues/43) | **Lighthouse CI** | Add Lighthouse to GitHub Actions to track performance, accessibility, PWA, and best-practices scores on every PR. |

<br/>

### Security & Infrastructure

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| ✅ | [#37](https://github.com/gurvinny/Slo-Fi/issues/37) | **HTTP Security Headers** | Enforce `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, and related headers via a Cloudflare Pages `_headers` file. |
| ✅ | [#38](https://github.com/gurvinny/Slo-Fi/issues/38) | **File Size Guard + Decode Progress UI** | Reject audio files above a configurable size threshold before decode begins and show a progress indicator for large files during `decodeAudioData`. |
| ✅ | [#39](https://github.com/gurvinny/Slo-Fi/issues/39) | **Permissions-Policy Header** | Add a `Permissions-Policy` header to restrict browser APIs (camera, microphone, geolocation, etc.) that Slo-Fi never uses. |

<br/>

---

<br/>

## v2.0 — Complete

All 13 planned v2.0 issues shipped. The milestone is closed.

<br/>

---

<br/>

## v3.0 — Meridian

The peak. Shader-driven visuals, on-device AI stem separation, AudioWorklet DSP, WebCodecs multi-format export, persistent sessions, WebGPU rendering, and Web MIDI. Every layer of the stack — visual, audio, storage, and security — reaches further than v2.

Track remaining items on the [v3.0 milestone](https://github.com/gurvinny/Slo-Fi/milestone/3).

<br/>

### Design & UI

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| 🔲 | [#52](https://github.com/gurvinny/Slo-Fi/issues/52) | **Shader-Driven Reactive Orb** | Custom GLSL `ShaderMaterial` in `AnomalySphere.ts` — per-fragment chromatic aberration, iridescent surface shading, and FFT-reactive distortion impossible with the existing `MeshStandardMaterial` + bloom pipeline. |
| 🔲 | [#53](https://github.com/gurvinny/Slo-Fi/issues/53) | **Spectrogram Waterfall View** | Scrolling heat-mapped time-frequency spectrogram panel sharing the existing `AnalyserNode`, toggled alongside the FFT bar display in `SpectrumAnalyzer.ts`. |
| 🔲 | [#54](https://github.com/gurvinny/Slo-Fi/issues/54) | **CSS Houdini Glass Transitions + View Transitions API** | `@property`-animated glass panels and a `document.startViewTransition` wrapper in `App.ts` for hardware-accelerated, declarative UI transitions. |

<br/>

### Mobile & PWA

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| 🔲 | [#55](https://github.com/gurvinny/Slo-Fi/issues/55) | **Unified Pointer Events + Spring-Physics Controls** | `EffectsController.ts` migrated to `PointerEvents` with `pointer-capture`; spring-physics settling model for all sliders across mouse, stylus, and touch. |
| 🔲 | [#56](https://github.com/gurvinny/Slo-Fi/issues/56) | **Web MIDI Controller Support** | `navigator.requestMIDIAccess` CC-to-`AudioParams` mapping with an in-app mapping UI in Settings; event bus integration with `MobileController.ts` for live performance use. |

<br/>

### Audio Engine

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| 🔲 | [#57](https://github.com/gurvinny/Slo-Fi/issues/57) | **AudioWorklet DSP Migration** | Tape saturation and chorus LFO moved from deprecated `ScriptProcessorNode` to `AudioWorkletProcessor` modules, eliminating main-thread audio jank on mobile. |
| 🔲 | [#58](https://github.com/gurvinny/Slo-Fi/issues/58) | **AI On-Device Stem Separation** | Transformers.js + Demucs ONNX in a Worker thread — 4-stem separation (vocals, bass, drums, other) on the in-memory `AudioBuffer`, zero server round-trip. |
| 🔲 | [#59](https://github.com/gurvinny/Slo-Fi/issues/59) | **5-Band Parametric EQ with Visual Curve** | Fully parametric 5-band EQ replacing the 3-band shelf in `EffectsChain.ts`, with a live SVG frequency response curve using `BiquadFilterNode.getFrequencyResponse()`. |
| 🔲 | [#60](https://github.com/gurvinny/Slo-Fi/issues/60) | **WebCodecs Multi-Format Export** | `AudioEncoder`-powered Opus, AAC, and FLAC export extending `Exporter.ts`/`WavEncoder.ts`, with format picker in `ExportController.ts` and WAV fallback. |

<br/>

### Presets & Sessions

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| 🔲 | [#61](https://github.com/gurvinny/Slo-Fi/issues/61) | **Session Save / Restore via IndexedDB + OPFS** | Full session persistence — `AudioBuffer` binary in OPFS, all `AudioParams` and loop points in IndexedDB — surviving page refresh with no re-upload. |
| 🔲 | [#62](https://github.com/gurvinny/Slo-Fi/issues/62) | **Smooth Preset Morphing** | `AudioParam.linearRampToValueAtTime`-driven 1.5s crossfade between presets in `PresetController.ts`, replacing the current instant parameter snap. |

<br/>

### Quality & Accessibility

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| 🔲 | [#63](https://github.com/gurvinny/Slo-Fi/issues/63) | **WCAG 2.2 AA Audit** | Full 2.2 AA audit covering SC 2.4.11 (Focus Not Obscured) and SC 2.5.7 (Dragging Movements) on `Waveform.ts` handles; `:focus-visible` migration throughout. |

<br/>

### Performance

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| 🔲 | [#64](https://github.com/gurvinny/Slo-Fi/issues/64) | **WebGPU Rendering for AnomalySphere** | `AnomalySphere.ts` ported to Three.js `WebGPURenderer` with GPU compute shaders for FFT vertex displacement; `WebGL2` fallback for unsupported hardware. |

<br/>

### Security & Infrastructure

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| 🔲 | [#65](https://github.com/gurvinny/Slo-Fi/issues/65) | **Trusted Types Policy** | Named `TrustedTypes` policy in `App.ts` and `AnomalySphere.ts`; CSP extended with `require-trusted-types-for 'script'` in the `_headers` file. |
| 🔲 | [#66](https://github.com/gurvinny/Slo-Fi/issues/66) | **Subresource Integrity for CDN Assets** | SHA-384 `integrity` attributes on all external resources in `index.html`, automated via a Vite build plugin and enforced in the Lighthouse CI GitHub Actions workflow. |

<br/>

---

<br/>

## v3.0 — In Progress

15 issues planned. Milestone open.

<br/>

---

<br/>

<div align="center">

<sub><a href="README.md">Back to README</a> • <a href="ARCHITECTURE.md">Architecture</a> • <a href="CONTRIBUTING.md">Contributing</a></sub>

</div>
