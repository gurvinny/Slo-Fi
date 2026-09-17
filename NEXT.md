# NEXT — Slo-Fi · ANOMALY III

Handoff written **2026-09-17**, replacing the version from earlier the same day. **The orb is wired
and the reported jitter is fixed.**

**Read first:** `~/.claude/plans/i-want-to-work-fancy-unicorn.md` — the approved plan, with every
settled decision and two addenda. Memory: `project-slofi-anomaly-iii`.

---

## Where things are

| | |
|---|---|
| `main` | `88e26ab` — carries **both defect fixes**, D1 (#143) and D2 (#144), merged by fast-forward |
| Branch | `feat/anomaly-iii` — 15 commits ahead of `main`, rebased onto it |
| PR | **#142** |
| Suite | **511 assertions**, floors **unit 193 / browser 37 / dom 281** |
| Mutations | **54 caught / 0 survived**, 2 documented ALLOWED |
| e2e | **36 passed / 3 skipped** across all three render projects |

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
- Lighting and particles rebalanced against the new drivers — better placed, not rewritten.

---

## Open, in rough priority order

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
