<br/>

<div align="center">

<img src="docs/assets/slo-fi-banner.svg" alt="Slo-Fi Banner" width="100%"/>

<br/>

# 𝚂 𝙻 𝙾 - 𝙵 𝙸

### ✦ Your Browser Is the Studio ✦

> *Drop a track. Slow it down. Drown it in reverb.*
> *No installs. No uploads. No limits.*
> *Just you, your music, and a late-night vibe.*

<br/>

[![Version](https://img.shields.io/badge/Version-1.0.0-A855F7.svg?style=flat-square&logo=semanticversioning&logoColor=white)](https://github.com/gurvinny/Slo-Fi/releases/tag/v1.0.0)
[![License](https://img.shields.io/badge/License-MIT-A855F7.svg?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF.svg?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Privacy First](https://img.shields.io/badge/Privacy-First-10B981.svg?style=flat-square&logo=lock&logoColor=white)](#-privacy--security)
[![Contributing](https://img.shields.io/badge/PRs-Welcome-10B981.svg?style=flat-square&logo=github&logoColor=white)](CONTRIBUTING.md)
[![Code of Conduct](https://img.shields.io/badge/Code_of_Conduct-Contributor_Covenant-ff69b4.svg?style=flat-square)](CODE_OF_CONDUCT.md)
[![Security](https://img.shields.io/badge/Security-Responsible_Disclosure-06B6D4.svg?style=flat-square&logo=shield&logoColor=white)](SECURITY.md)

<br/>

<p>
  <a href="#-what-is-slo-fi">What is Slo-Fi?</a> •
  <a href="#-features">Features</a> •
  <a href="#-privacy--security">Privacy</a> •
  <a href="#-get-started">Get Started</a> •
  <a href="#-whats-next">What's Next</a> •
  <a href="#-contributing--community">Contributing</a>
</p>

<br/>

</div>

---

<br/>

## ✦ What is Slo-Fi?

Slo-Fi is a **professional-grade audio processing tool that lives entirely in your browser.** No app to download, no account to create, no files uploaded anywhere. Open the page, drop a track, and start shaping sound.

It was built for the producers, the late-night listeners, the slow-reverb obsessives — anyone who wants to hear music differently. Whether you're crafting a slowed + reverb edit, building an ambient texture, or just chilling with a vaporwave vibe, Slo-Fi gives you the tools to do it in seconds.

The engine is powered by the **Web Audio API** — the same technology used in professional browser-based DAWs — so everything you hear is processed at native audio quality with sub-10ms latency. No compromises.

> Want to understand exactly how it works under the hood? See [ARCHITECTURE.md](ARCHITECTURE.md).

<br/>

---

<br/>

## ✦ Features

### Slow it down. Keep it perfect.

Dial your track anywhere from **full speed down to 25%** without a single pitch artifact. The tempo changes — the key stays exactly where it should. No chipmunks. No demons. Just the music, stretched into something new.

---

### Reverb that actually breathes.

Slo-Fi doesn't use cheap delay-line reverb. It uses **true convolution reverb** — the same algorithm in professional studio plugins — to produce reverb tails that feel physically real. Crank the Room Size and Decay and disappear into a cathedral. Dial it tight for a warm studio booth. The space is yours to sculpt.

---

### One click to a vibe.

Four built-in presets get you there instantly:

- **Lo-Fi** — warm, slow, intimate. Coffee-shop at 2am.
- **Vaporwave** — saturated, dreamy, nostalgic. Mallsoft forever.
- **Ambient** — open, spacious, endless. Just breathe.
- **Custom** — your settings, saved your way.

---

### A full effects chain, not just sliders.

Go deeper with a built-in studio-grade effects stack:

- **3-Band EQ** — shape your tone from sub to air
- **Chorus** — shimmer, widen, float
- **Tape Saturation** — warmth, grit, and that analog edge

---

### See the music.

An interactive **seekable waveform** and a live **FFT spectrum analyzer** let you watch the frequency content move in real time. Click anywhere on the waveform to jump to that moment. Understanding your audio has never looked this good.

---

### Play it live with MIDI.

Plug in any MIDI controller and map hardware knobs and faders to speed, reverb, volume, or any effect parameter. Automate a slowdown. Sweep the reverb mix in real time. **Perform your edit, don't just set it.**

---

### Export what you made.

When the vibe is right, hit export and get a **WAV download** of your fully processed, slowed, reverbed track — ready to post, sample, or keep.

---

### Collaborate in real time.

Share a session link and sync with another person over **WebRTC**. Same playback position, same controls, two sets of ears. Build the vibe together.

---

### Install it. Take it offline.

Slo-Fi is a **Progressive Web App**. Install it to your home screen on any device and use it with no internet connection. It works the same whether you're online or not.

<br/>

---

<br/>

## 🔒 Privacy & Security

**Your audio never leaves your device. Full stop.**

Everything in Slo-Fi is processed inside your browser using the Web Audio API. There is no server receiving your files, no analytics watching your session, no third-party scripts. Close the tab and every byte of audio is gone — nothing is stored anywhere.

This makes Slo-Fi safe to use with sensitive, unreleased, or proprietary material. Your files are your files.

| Guarantee | |
|:---|:---:|
| Audio processed entirely on-device | ✅ |
| Zero network requests for audio data | ✅ |
| No accounts, no tracking, no telemetry | ✅ |
| All dependencies bundled — no CDN calls | ✅ |
| Audio cleared from memory on tab close | ✅ |

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

Open `http://localhost:5173`, drop a track, and you're in.

```bash
npm run build    # production build
npm run preview  # preview the build locally
```

### How to use it

1. Drop any `.mp3`, `.wav`, `.flac`, `.ogg`, or `.aac` file onto the interface
2. Pick a preset — or start from scratch
3. Adjust speed, reverb, and effects to taste
4. Hit play
5. Export your track as a WAV when you're done

<br/>

---

<br/>

## 🗺️ What's Next

**v1.0 is complete** — every feature is shipped and the engine is solid.

**v2.0 is in planning** — a full dark glassmorphism redesign, mobile-first layout, beat detection, 8D audio, multi-file sessions, a Hyperpop preset, and much more.

See the full roadmap, including all v1 features and every v2.0 item: **[ROADMAP.md](ROADMAP.md)**

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
| [ROADMAP.md](ROADMAP.md) | v1 complete + full v2.0 plans |

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
