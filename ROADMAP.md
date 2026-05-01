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
  <a href="#v21--obsidian-studio">v2.1 — Obsidian Studio</a> •
  <a href="#v30--meridian">v3.0 — Meridian</a>
</p>

</div>

<br/>

---

<br/>

## v1.0 — Complete

</p>

<br/>

---

<br/>

## v2.0 — Anomaly

<br/>

---

<br/>

## v2.1 — Obsidian Studio

A focused refinement release: a complete visual overhaul ("Obsidian Studio"), waveform compositor fix, audio engine stability hardening, effects quality improvements, and Docker self-hosting support.

<br/>

### Design & UI

| Status | Feature | Description |
|:---:|:---|:---|
| ✅ | **Obsidian Studio redesign** | Near-black palette (`#020208`), 120px waveform, cinematic landing screen — orbit rings removed, mega-type title, luminous glass drop card with gradient border glow. Compact 46px header with purple-to-teal gradient wordmark. |
| ✅ | **Refined transport** | Rounded-rectangle icon buttons, refined Controls/Effects/Playlist pills, tabular-numeral time display, increased waveform height from 96px to 120px. |
| ✅ | **Deeper purple accent** | Accent shifted from `#9b6dff` to `#7c4dff` — cooler, deeper, more intentional use across glows, borders, and hover states. |
| ✅ | **Drawer refinements** | Near-black panels (`rgba(3,3,12,0.97)`) with 44px backdrop blur, 14px border radius, thinner accent scrollbars. |

<br/>

### Bug Fixes

| Status | Feature | Description |
|:---:|:---|:---|
| ✅ | **Waveform canvas compositor fix** | `filter:brightness(1)` on `.waveform-wrap` creates an independent GPU compositing backing store. The parent `backdrop-filter` on `.player-bottom` can no longer clear the canvas bitmap when aurora CSS vars update every animation frame. Previously the canvas disappeared on all non-Prism themes during playback. |
| ✅ | **Audio decode error isolation** | `loadFile()` try-catch split: audio decode errors and UI/sphere init errors are reported separately. Sphere failures are non-fatal and never surface as "Could not decode this file." |
| ✅ | **NaN guard in reverb engine** | `isFinite()` guards on all 6 audio params in `loadSettings()` prevent corrupted localStorage values from reaching `buildIR()` (which would throw `InvalidStateError` on `ctx.createBuffer(2, NaN, sr)`). |
| ✅ | **buildIR try-catch** | `ensureContext()` now wraps the initial `buildIR()` call in a try-catch, matching the existing guard in `rebuildIR()`. |

<br/>

### Audio Quality

| Status | Feature | Description |
|:---:|:---|:---|
| ✅ | **Saturation waveshaper resolution** | WaveShaper curve increased from 256 to 4096 samples, eliminating intermodulation aliasing at high drive settings. |
| ✅ | **Click-free pitch and Hz transitions** | `setPitch()` and `setHzFrequency()` use `setTargetAtTime` instead of direct `.value` assignment, removing audible clicks when parameters change during playback. |

<br/>

### Infrastructure

| Status | Feature | Description |
|:---:|:---|:---|
| ✅ | **Docker containerization** | `Dockerfile` (multi-stage Node build → nginx), `docker-compose.yml`, `nginx.conf` with immutable-asset and no-cache `sw.js` headers, `.dockerignore`. Run the full production build with `docker compose up -d`. |

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
| ✅ | [#57](https://github.com/gurvinny/Slo-Fi/issues/57) | **AudioWorklet DSP Migration** | Tape saturation and chorus moved to dedicated `AudioWorkletProcessor` modules (`saturation-processor.js`, `chorus-processor.js`) running in the real-time audio thread. Graceful fallback to WaveShaperNode/OscillatorNode on non-secure HTTP contexts. |
| 🔲 | [#58](https://github.com/gurvinny/Slo-Fi/issues/58) | **AI On-Device Stem Separation** | Transformers.js + Demucs ONNX in a Worker thread — 4-stem separation (vocals, bass, drums, other) on the in-memory `AudioBuffer`, zero server round-trip. |
| ✅ | [#59](https://github.com/gurvinny/Slo-Fi/issues/59) | **5-Band Parametric EQ with Visual Curve** | Upgraded from 3-band to 5-band fully parametric EQ (80 Hz / 250 Hz / 1 kHz / 4 kHz / 12 kHz) with a live canvas frequency response curve using `BiquadFilterNode.getFrequencyResponse()`. |
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
| ✅ | [#64](https://github.com/gurvinny/Slo-Fi/issues/64) | **WebGPU Rendering for AnomalySphere** | Progressive upgrade from `WebGLRenderer` to `WebGPURenderer`; sphere material converted to TSL `NodeMaterial` (compiles to WGSL on WebGPU, GLSL on WebGL2). Starts on WebGL2 immediately, upgrades in background when WebGPU is available. |

<br/>

### Security & Infrastructure

| Status | Issue | Feature | Description |
|:---:|:---:|:---|:---|
| 🔲 | [#65](https://github.com/gurvinny/Slo-Fi/issues/65) | **Trusted Types Policy** | Named `TrustedTypes` policy in `App.ts` and `AnomalySphere.ts`; CSP extended with `require-trusted-types-for 'script'` in the `_headers` file. |
| 🔲 | [#66](https://github.com/gurvinny/Slo-Fi/issues/66) | **Subresource Integrity for CDN Assets** | SHA-384 `integrity` attributes on all external resources in `index.html`, automated via a Vite build plugin and enforced in the Lighthouse CI GitHub Actions workflow. |

<br/>

---

<br/>

<div align="center">

<sub><a href="README.md">Back to README</a> • <a href="ARCHITECTURE.md">Architecture</a> • <a href="CONTRIBUTING.md">Contributing</a></sub>

</div>
