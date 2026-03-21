<div align="center">

<img src="docs/assets/slo-fi-banner.svg" alt="Slo-Fi Banner" width="100%"/>

<br/>

# Security Policy

### ✦ Your audio. Your device. Full stop. ✦

[![Security](https://img.shields.io/badge/Security-Responsible_Disclosure-06B6D4.svg?style=flat-square&logo=shield&logoColor=white)](#reporting-a-vulnerability)
[![Privacy First](https://img.shields.io/badge/Privacy-First-10B981.svg?style=flat-square&logo=lock&logoColor=white)](#security-architecture)
[![License](https://img.shields.io/badge/License-MIT-A855F7.svg?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE)

<p>
  <a href="#security-architecture">Architecture</a> •
  <a href="#supported-versions">Supported Versions</a> •
  <a href="#reporting-a-vulnerability">Report a Vulnerability</a> •
  <a href="#out-of-scope">Out of Scope</a>
</p>

</div>

<br/>

---

<br/>

## Security Architecture

Slo-Fi's security posture is built into the architecture itself. Audio is processed 100% in-browser using the Web Audio API. There is no server component involved in audio handling.

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

| Guarantee | How It's Enforced |
|:---|:---|
| **No audio uploads** | Audio is decoded with `AudioContext.decodeAudioData()` from a local `File` object. No `fetch`, `XHR`, or WebSocket is used for audio data at any point. |
| **No persistent audio storage** | `AudioBuffer` instances live only in memory. No writes to `localStorage`, `IndexedDB`, or the Cache API for audio content. Closing the tab frees all audio memory. |
| **No third-party scripts** | Zero analytics, zero tracking pixels, zero CDN-loaded runtime libraries. All dependencies are bundled and reviewed at build time. |
| **Content Security Policy** | Strict CSP headers restrict resource origins and block inline script injection. |
| **WebRTC collab scope** | The collaborative session feature uses WebRTC for control signal sync only. Audio is never transmitted over the data channel — each participant plays their own local file. |

This architecture makes Slo-Fi safe to use with sensitive, unreleased, or proprietary audio material.

<br/>

---

<br/>

## Supported Versions

| Version | Supported |
|:---:|:---:|
| 1.0.x | Yes — actively maintained |
| < 1.0 | No — please upgrade |

Security patches are applied to the latest release only.

<br/>

---

<br/>

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report security issues through **[GitHub Security Advisories](https://github.com/gurvinny/slo-fi/security/advisories/new)** — this keeps the disclosure private until a fix is ready.

### What to Include

A useful report contains:

- A clear description of the vulnerability
- Steps to reproduce (or a minimal proof of concept)
- The potential impact (data exposure, denial of service, etc.)
- Browser and OS version where applicable
- Any mitigations you are aware of

### Response Timeline

| Stage | Target |
|:---|:---|
| Acknowledgement | Within 48 hours of receipt |
| Triage + severity assessment | Within 7 days |
| Fix developed and reviewed | Within 30 days for critical/high severity |
| Public disclosure | Coordinated with the reporter after the fix ships |

We follow responsible disclosure: fixes ship before public details are released. Reporters are credited in the release notes (with permission).

<br/>

---

<br/>

## Out of Scope

The following are generally not accepted as valid security issues:

- Vulnerabilities in browsers themselves (report those to the relevant browser vendor)
- Theoretical attacks with no working proof of concept
- Issues requiring physical access to the user's machine
- Denial-of-service by loading an extremely large audio file (this is a known UX concern, not a security issue)
- Missing security headers on a non-production, self-hosted development build
- Content injection through the browser's developer tools (the user already has full control of their own browser)

If you are unsure whether your finding is in scope, report it anyway — we would rather evaluate and decline than miss a real issue.

<br/>

---

<br/>

## Responsible Disclosure Policy

Slo-Fi follows a coordinated vulnerability disclosure model:

1. Reporter submits a private advisory with reproduction details.
2. Maintainer acknowledges receipt within 48 hours.
3. Maintainer investigates, develops a fix, and communicates progress with the reporter.
4. Fix is released. Reporter is credited (with permission).
5. A public post-mortem or advisory is published after users have had reasonable time to update.

We appreciate researchers who give us the opportunity to fix issues before public disclosure. Thank you for helping make Slo-Fi more secure.

<br/>

---

<br/>

<div align="center">

<sub><a href="README.md">Back to README</a> • <a href="CONTRIBUTING.md">Contributing</a> • <a href="CODE_OF_CONDUCT.md">Code of Conduct</a></sub>

</div>
