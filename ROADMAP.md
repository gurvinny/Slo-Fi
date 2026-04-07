<div align="center">

<img src="docs/assets/slo-fi-banner.svg" alt="Slo-Fi Banner" width="100%"/>

<br/>

# Roadmap

### ✦ Where Slo-Fi has been and where it's going ✦

[![Current](https://img.shields.io/badge/Current-v2.1.0-A855F7.svg?style=flat-square&logo=semanticversioning&logoColor=white)](https://github.com/gurvinny/Slo-Fi/releases)
[![Milestone](https://img.shields.io/badge/v2.1-Obsidian_Studio-06B6D4.svg?style=flat-square)](https://github.com/gurvinny/Slo-Fi/milestone/3)
[![Open Issues](https://img.shields.io/github/issues/gurvinny/Slo-Fi?style=flat-square&color=A855F7&label=Open%20Issues)](https://github.com/gurvinny/Slo-Fi/issues)

<p>
  <a href="#v10--complete">v1.0 — Complete</a> •
  <a href="#v20--anomaly">v2.0 — Anomaly</a> •
  <a href="#v21--obsidian-studio">v2.1 — Obsidian Studio</a>
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

<div align="center">

<sub><a href="README.md">Back to README</a> • <a href="ARCHITECTURE.md">Architecture</a> • <a href="CONTRIBUTING.md">Contributing</a></sub>

</div>
