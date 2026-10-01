// Defects tests/unit/OnsetDetector.test.ts must catch.
// Author: gurvinny
export const TARGET = 'src/audio/OnsetDetector.ts'
export const TESTS = 'tests/unit/OnsetDetector.test.ts'
export const CONFIG = 'vitest.config.ts'

export const MUTATIONS = [
  ['the refractory window is dropped, so one kick becomes several ripples',
   '      this.sinceLast >= REFRACTORY_S',
   '      true',
   'does not fire twice while one transient rings'],

  ['the refractory window counts frames instead of seconds',
   '    this.sinceLast += dt',
   '    this.sinceLast += 1 / 60',
   'holds the refractory window in seconds, not frames'],

  ['the threshold stops adapting, so quiet tracks go dead',
   '    const margin = Math.max(MARGIN_FLOOR, this.deviation * MARGIN_DEVIATIONS)\n    const isOnset =\n      this.clock >= WARMUP_S &&\n      flux > this.baseline + margin &&',
   '    const margin = Math.max(MARGIN_FLOOR, this.deviation * MARGIN_DEVIATIONS)\n    const isOnset =\n      this.clock >= WARMUP_S &&\n      flux > 0.3 + margin &&',
   'finds beats in a quiet passage as readily as a loud one'],

  ['a sustained note reads as a continuous beat',
   '    const isOnset =\n      this.clock >= WARMUP_S &&\n      flux > this.baseline + margin &&\n      this.sinceLast >= REFRACTORY_S',
   '    const isOnset =\n      this.clock >= WARMUP_S &&\n      flux > MARGIN_FLOOR &&\n      this.sinceLast >= REFRACTORY_S',
   'stays silent on a flat signal, however loud'],

  ['the baseline absorbs the spike before the spike is tested against it',
   '    const isOnset =\n      this.clock >= WARMUP_S &&\n      flux > this.baseline + margin &&\n      this.sinceLast >= REFRACTORY_S\n\n    const k = alpha(BASELINE_TAU, dt)\n    this.baseline += (flux - this.baseline) * k',
   '    const k = alpha(BASELINE_TAU, dt)\n    this.baseline += (flux - this.baseline) * k\n    const isOnset =\n      this.clock >= WARMUP_S &&\n      flux > this.baseline + margin &&\n      this.sinceLast >= REFRACTORY_S',
   null],

  ['the grid is applied even when the tempo is not trusted',
   '    if (this.beatPeriod <= 0 || this.confidence < MIN_CONFIDENCE) return 1',
   '    if (this.beatPeriod <= 0) return 1',
   'ignores the grid when tempo detection is not confident'],

  ['every onset hits equally, so the grid stops meaning anything',
   '    return 1 - this.confidence * OFF_GRID_PENALTY * offness',
   '    return 1',
   'hits harder on the grid than off it once the tempo is confident'],
]

export const SURVIVORS = {
  'the baseline absorbs the spike before the spike is tested against it':
    'Equivalent at the current BASELINE_TAU of 350ms: one frame moves the baseline by ' +
    'under 5%, so a spike well above it clears the threshold either way and no assertion ' +
    'can separate the orderings. Not a coverage hole. The order is kept deliberately ' +
    'because it stops being harmless as soon as BASELINE_TAU is shortened -- do NOT ' +
    '"simplify" it by folding the update above the test.',
}
