# NEXT — Slo-Fi · ANOMALY III

Handoff written **2026-09-17**, replacing the version from earlier the same day. **The orb is wired
and the reported jitter is fixed. The ripples are not yet legible at default glow — see item 0.**

> ### PR #142 IS GREEN AND DELIBERATELY NOT MERGED
>
> 22 checks pass, `MERGEABLE / CLEAN`, `Browser QA` green across all 8 shards. **The user chose to
> hold the merge** rather than land it, because green is not the same as the feature being worth
> shipping: the layers ANOMALY III exists to add are present in the vertex data and verified, but
> still cannot be told apart from surface noise at the shipped default settings on desktop.
>
> **Do not merge #142 without asking.** Resolving item 0 is the precondition.

**Read first:** `~/.claude/plans/i-want-to-work-fancy-unicorn.md` — the approved plan, with every
settled decision and two addenda. Memory: `project-slofi-anomaly-iii`.

---

## Where things are

| | |
|---|---|
| `main` | `88e26ab` — carries **both defect fixes**, D1 (#143) and D2 (#144), merged by fast-forward |
| Branch | `feat/anomaly-iii` at `e1e1602` — **18 commits** ahead of `main`, rebased onto it, clean tree |
| PR | **#142** — 22 checks pass, `MERGEABLE / CLEAN`, **held unmerged on purpose** |
| Suite | **513 assertions**, floors **unit 195 / browser 37 / dom 281** |
| Mutations | **58 caught / 0 survived**, 2 documented ALLOWED |
| e2e | **19 passed / 2 skipped** (orb + render-matrix) after the last fix; **36 / 3** on the full sweep before it |

No longer an isolated island: `App` constructs `AnomalySphere` with the two orb analysers, and
`AnomalySphere` drives `uRadius`, `uRipples` and `uShimmer` from `OrbSignal`.

### Shipped to production on `main`

- **D1** — the equalizer repaints on a theme change. It only ever failed **while paused**; the EQ's
  spectrum rAF loop repaints it by accident while audio plays. Also fixed a second, independent
  cause of the same symptom: both accent readers accepted only 6-digit hex, so a minified 3-digit
  theme hex fell through to a fallback that *is* Meridian's accent.
- **D2** — **201,644 bytes gzip** no longer fetched at service-worker install time by every visitor.

### Built on the branch

`src/audio/envelope.ts` · `spectrum.ts` · `RippleBank.ts` · `OrbSignal.ts` · `OnsetDetector.ts`
`src/ui/cssColor.ts` · `scripts/precache-lib.mjs` · `scripts/check-precache.mjs`
`tests/unit/orb-shader.test.ts` · `scripts/mutate.mjs` + `tests/mutations/*.mutations.mjs`

### The 18 commits, oldest first

| | |
|---|---|
| `4bb8ef2` | test(mutation): add the curated mutation runner and its first catalogue |
| `51ad875` | feat(audio): add frame-rate-independent smoothing primitives |
| `673fd7d` | feat(audio): extract the spectrum helpers and add centroid band tracking |
| `c567911` | fix(ui): raise control legibility above the WCAG contrast floors |
| `966fe3a` | feat(audio): add the ripple bank that carries the orb's transients |
| `c1ed68b` | ci(browser-qa): shard the e2e suite across four runners |
| `438b714` | feat(audio): add the layered orb signal pipeline |
| `8fe43dc` | ci(browser-qa): raise the shard count to the measured floor |
| `05fce1e` | feat(audio): add the onset detector that fires the ripples |
| `9d186ce` | ci(browser-qa): cache the browser binary and split the heaviest spec |
| `0866fd9` | feat(audio): spawn ripples from onsets and expose the uniform pack |
| `ec358fa` | feat(audio): give the orb its own two analysers on the post-effects tap |
| `2e7623f` | refactor(orb): make every envelope frame-rate independent |
| `98660f6` | test(mutation): catalogue the theme-repaint defects |
| `a0acc22` | feat(orb): drive the sphere from OrbSignal and kill the jitter |
| `2d29c1a` | docs: rewrite the handoff for the wired orb |
| `c3e87fa` | fix(orb): stop the sustained layers starving the transient ones |
| `e1e1602` | docs: record the unresolved ripple-legibility blocker and the disproved cause |

The last four are the ones a reviewer should read first: the wiring, the defect it shipped with, and
the two documentation commits recording what is still unresolved.

### Two decisions waiting on the user

Both were surfaced at the end of the last session and neither should be taken unilaterally.

1. **Merge #142 now, or after ripple legibility is demonstrated?** The branch is green. The
   feature's headline improvement is not yet visible at defaults.
2. **Reduce `d1`?** It is the prime suspect for "the ripple is indistinguishable from the general
   craggy surface noise", and it is a visible change to how the orb looks. Deliberately not made.

---

## The next commit

**Phase 2 — the orb design.** Split `AnomalySphere.ts` (now ~1,950 lines) into
`src/ui/orb/{shaders,geometry,palettes}.ts`, but **keep the file `src/ui/AnomalySphere.ts`** — it is
the name the dynamic import uses (`App.ts`) and the Rollup chunk name that `precache-sw.mjs` and
`check-precache.mjs` both assert on.

- **Wireframe becomes permanent.** Delete `uWireframe`, the solid-shading branches, `DEFAULTS.wireframe`,
  `VisualParams.wireframe`, all writer sites, the 4 preset entries, the panel row and the help-modal
  row. Kept honest by `expect(FRAGMENT_SHADER).not.toContain('uWireframe')` — the shader source is
  already exported for `tests/unit/orb-shader.test.ts`, so this is free.
- **Retune `BASS_TAU_DOWN`** from 0.658 s to ~0.30 s. This is the deliberate, separately-reviewed
  change the dt migration deliberately did *not* make.
- **`d1` now double-counts the bass mass.** `d1 = snoise(...) * uBass * 0.40` was the *old*
  implementation of "bass makes the orb bulge"; `swell` is the designed layer 1 and carries the same
  smoothed signal. Having both means the mass is mostly noise-shaped, which is very likely why the
  ripple reads as "indistinguishable from the general craggy surface noise". Reducing `d1` is the
  obvious lever and it is a visible character change — hence phase 2, not a defect fix.
- **The displacement budget is now explicitly allocated.** `mass` 0.36 + `transient` 0.16 = 0.52.
  A test asserts the sum, so any rebalance here is a deliberate edit to both numbers, not a drift.
- Lighting and particles rebalanced against the new drivers — better placed, not rewritten.

---

## Open, in rough priority order

0. **The ripples are in the vertex data but NOT LEGIBLE at default glow on desktop.**
   This is phase 2's first job and the one thing blocking ANOMALY III from being worth shipping.

   What is established: the displacement fix is real and present in the shipped bundle (verified
   independently by reading `dist/`), and the clamp-starvation defect that hid them is fixed and
   mutation-covered. Two `browser-qa` passes agree the ripples still cannot be told apart from
   surface noise at **Glow 100% / Reactivity 80%** on percussive material, where the orb reads as a
   near-white blob. On the **mobile** path it does *not* white out and the surface is legible — the
   same audio and the same shader, so something in the desktop-only render path is responsible.

   **What is NOT established is the cause, and the obvious hypothesis is wrong.** QA proposed that
   the `kickVis`-driven bloom "is not releasing fast enough to show a dark baseline between
   events". That is disproved numerically with the real constants: `kickEnergy`'s decay tau is
   **0.130 s**, so after a single kick

   | t | kickVis | bloom.strength | meshScale |
   |---|---|---|---|
   | 0.0 s | 1.232 | 1.100 (capped) | 1.72 |
   | 0.2 s | 0.438 | 0.571 | 1.25 |
   | 0.5 s | 0.044 | 0.288 | 1.03 |
   | 1.0 s | 0.001 | 0.257 | 1.00 |

   and the floor in silence is `0.20 + reverb * 0.28` = **0.256** against a 1.10 cap. Bloom is back
   to its floor inside half a second; it cannot be pinned for the 2-3 s that was reported. The
   likelier candidates are therefore **static** brightness, not release time: `toneMappingExposure`
   is a flat `0.50`, and the fragment shader adds rim glow and core glow *additively* on top. Note
   also that a screenshot taken seconds after a `mesh.scale` of up to 1.7 may simply be full of orb.

   **Measure before changing anything.** The honest next step is a numeric capture of the rendered
   luminance histogram over a sparse kick fixture, not another visual pass — QA cannot time frames
   to better than several seconds through the tool round-trip, which is what produced the wrong
   causal claim in the first place.

1. **Phase 5 spike, still carried over:** `anomaly-sphere.spec.ts` skips theme stability on mobile
   because a no-op `setColorTheme` measures 0.0009 against a clean 0.0011. Probe by re-enabling
   grain+glitch on the mobile branch in a **throwaway** build and re-measuring separation. The output
   is an answer, not code to keep. **Do not tune a threshold until it passes.**
2. **A confidence metric for `detectBpm`.** `OnsetDetector.setTempo` wants one and `detectBpm`
   returns a bare number, so `setTempo` is **never called** and on-grid emphasis is dark. Passing
   `1.0` would be worse than passing nothing — a wrong grid applied confidently emphasises the wrong
   moments. This is the one design decision in the plan that is not yet delivered.
3. **The post-effects tap has no behavioural test** and never did. `AudioEngine.tap.test.ts` asserts
   configuration and node identity only, because a real `AudioContext` cannot be driven in the
   browser suite — Chromium's autoplay policy means `ctx.resume()` never settles without a gesture
   (measured: a spike timed out at 15 s). It needs e2e.
4. **PR #139** — `actions/upload-artifact` v4→v7, still open.
5. Still frame-rate dependent, each needing its own thought: the bass/sub-bass **transients**
   (`bass - prevBass`), the lightning arc life decrement, and `EffectsController`'s spectrum loop
   (which also allocates a `Uint8Array` every frame).
6. `mobile-software-gl` › "leaving Lite visual mode…" failed once in a full local run and passes in
   isolation. Load-sensitive, not yet diagnosed. Watch, do not yet call it a flake.

---

## Traps worth not rediscovering

- **`--seed` is not a Vitest 5 flag.** `npm test -- --sequence.shuffle --seed 1`, recorded in every
  previous handoff, dies with `CACError: Unknown option --seed`. Use **`--sequence.seed`**.
- **The floor ratchet conflicts once per commit on every rebase.** Two branches raising `FLOORS`
  independently produced **seven** conflicts on one rebase. Resolve each as *branch value + the
  delta the other side added*, never by taking the higher number — a floor set to the tip's value
  makes every intermediate commit red on its own and destroys bisection.
- **`Clock` cannot serve a dt migration.** `getElapsedTime()` and `getDelta()` both advance the same
  internal `oldTime`, so calling one breaks the other. Use the `_prevFrameT` / `_elapsed` accumulator
  that is there now.
- **e2e cannot see a shader term that is computed and never summed.** It compiles, renders and
  animates, so `frameAdvance`, `nonBlankRatio` and `distinctColors` all pass. That is what
  `tests/unit/orb-shader.test.ts` is for — assert on *use*, not declaration.
- **A driver pinned at its own clamp is not a driver.** `uRadius` shipped with a x2.2 gain against
  a signal that already reaches ~1.0, so it sat saturated at 1.4 and layer 1 became a DC offset.
  Check what a driver actually *reaches* before choosing its gain — measured, not assumed.
- **Reserve budget for transient layers.** One clamp over every displacement term lets the
  sustained terms eat all of it, and the transients then render as nothing while looking perfectly
  correct in the source.
- **`RIPPLE_W = 0.28` rad is set by mobile vertex spacing, not taste.** Mean angular spacing is
  ~0.07 rad at icosahedron detail 4 (the mobile branch) against ~0.018 at detail 6. A narrower
  wavefront does not look thinner on mobile — it falls between vertices and vanishes.
- **A suite per module proves nothing about the edges between modules.** Five island modules were
  each green and mutation-tested while the chain between them was never connected — `positiveFlux`
  had no caller anywhere in `src/`. Grep for public functions with no production caller.
- **Check stale branches before writing a fix.** D1 had already been fixed in May on
  `feat/abyss-filter`, never merged, under the old misattributed git identity.
- **`Browser QA` is a required status check.** The sharded matrix jobs are named `shard N of 8` and
  an aggregate job keeps the name `Browser QA` exactly. Renaming it leaves the required context
  permanently pending and **deadlocks every PR**.
- **`playwright merge-reports` exits 0 on a report full of failures.** The aggregate gates on
  `needs.shard.result`, never on the merge step.
- **Raise the floor in the same commit that raises the count.** `tests/unit` is already in `ROOTS`
  and `collect()` recurses, so new unit files need only a floor bump. `tests/mutations/` is
  deliberately outside `ROOTS`.
- **A mutation catalogue names one TARGET and one TESTS file.** An invariant spanning three files
  needs three catalogues — see `theme-app` / `theme-eq` / `theme-accent`.
- **Fixtures that encode a frame count instead of a duration.** Three separate bugs came from this.
- **A constant fixture cannot detect missing smoothing**; **a downstream compensator masks the thing
  upstream of it**; **an over-loose assertion fails against correct code** (`'255,0,0'` is a
  substring of `rgba(0,255,0,0.85)`).
- **Merge by fast-forward when the branch is a clean ancestor.** A GitHub merge commit is authored
  with the *profile display name*, which leaks a real name onto a public repo.
- Full list in `project-slofi-test-suite` and `reference-browser-qa`.

---

## Reproducing the legibility problem yourself

```bash
npm run build
node scripts/serve-dist.mjs            # :4173 — NOT vite preview
```

The orb is constructed **lazily on file load** and only reacts while playing, so nothing is visible
until a track is in. Seed `localStorage.sf_visited` on a throwaway navigation *before* the real one
(`skipSplash` in `tests/e2e/helpers.ts` — an `evaluate` after navigation is too late), then inject a
WAV via `fetch → File → DataTransfer → input.files` against `input#fileInput`. `makeWavFile()` in
`tests/e2e/fixtures.ts` writes an amplitude-modulated fixture; a **sparse one kick per 3 s** file is
the right tool, because it separates one ripple's whole 1.1 s life from the next beat. The orb canvas
is `#anomaly canvas` — never a first-match `canvas`, two others precede it in the DOM.

Delegate this to the **`browser-qa`** agent (it owns Playwright and keeps screenshots out of the main
context) — but **re-derive any causal claim yourself.** Across two passes it gave correct
observations and an incorrect cause both times, because MCP round-trips take seconds and it cannot
time frames well enough to support a claim like "still bright N seconds later".

---

## Commands

```bash
cd ~/dev/public/Slo-Fi
npm run lint                 # tsc src + tsc tests
npm run test:verify          # THE gate: 3 vitest suites + collection guard + floors
npm run test:mutate          # caught/survived — the acceptance step for new test work
npm run build && npm run test:e2e
node scripts/check-precache.mjs             # the shipped service worker, after a build
node scripts/serve-dist.mjs                 # NOT vite preview — the build is a Worker
npm test -- --sequence.shuffle --sequence.seed 1   # repeat across >=3 seeds
```

Push with `git -c credential.helper='!gh auth git-credential' push`. Local gate green **before**
every push: CI is ~6-16 min for Browser QA alone (it varies with runner contention) and a red run
teaches nothing that `npm run lint` would not have said in 30 seconds.
