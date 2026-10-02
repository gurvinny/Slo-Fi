// Defects tests/unit/orb-shader.test.ts must catch.
// Author: gurvinny
//
// Every mutation here compiles and renders. That is the point: a displacement
// term can be declared, computed, and then not added to the value that reaches
// gl_Position, and the orb still draws a live, moving, non-blank frame. The
// e2e render checks cannot tell the difference -- the same blind spot that let
// a dead renderer pass the "draws a non-blank frame" test.
export const TARGET = 'src/ui/AnomalySphere.ts'
export const TESTS = 'tests/unit/orb-shader.test.ts'
export const CONFIG = 'vitest.config.ts'

export const MUTATIONS = [
  ['the ripple term is computed and then not summed (layer 2 invisible)',
   'clamp(shimmer + ripple, -0.16, 0.16)',
   'clamp(shimmer, -0.16, 0.16)',
   'sums all three ANOMALY III terms into the displacement it outputs'],

  ['the radius swell is computed and then not summed (layer 1 invisible)',
   '+ d4 + idle + swell,',
   '+ d4 + idle,',
   'sums all three ANOMALY III terms into the displacement it outputs'],

  ['the shimmer term is computed and then not summed (layer 3 invisible)',
   'clamp(shimmer + ripple, -0.16, 0.16)',
   'clamp(ripple, -0.16, 0.16)',
   'sums all three ANOMALY III terms into the displacement it outputs'],

  ['the transient budget is dropped from the output, discarding layers 2 and 3',
   'float disp = (mass + transient)',
   'float disp = (mass)',
   'sums all three ANOMALY III terms into the displacement it outputs'],

  // The regression that actually shipped: one clamp over every term, so the
  // sustained ones eat the whole budget and the transients render as nothing.
  ['the two budgets collapse back into one, starving the transients',
   'float mass      = clamp(dSub + d1 + d2 + d3 + d4 + idle + swell, -0.36, 0.36);\n  float transient = clamp(shimmer + ripple, -0.16, 0.16);',
   'float mass      = clamp(dSub + d1 + d2 + d3 + d4 + idle + swell + shimmer + ripple, -0.52, 0.52);\n  float transient = 0.0;',
   'reserves the transients a budget the sustained terms cannot eat'],

  ['the transient budget is shaved below one ripple\'s amplitude',
   'clamp(shimmer + ripple, -0.16, 0.16)',
   'clamp(shimmer + ripple, -0.05, 0.05)',
   'reserves the transients a budget the sustained terms cannot eat'],

  ['the total displacement bound creeps upward, changing the silhouette',
   'clamp(dSub + d1 + d2 + d3 + d4 + idle + swell, -0.36, 0.36)',
   'clamp(dSub + d1 + d2 + d3 + d4 + idle + swell, -0.52, 0.52)',
   'keeps the total displacement bound the orb was designed around'],

  ['the ripple loop stops short of the bank capacity, dropping the newest ripples',
   'for (int i = 0; i < 4; i++) {',
   'for (int i = 0; i < 2; i++) {',
   'walks every ripple slot the bank can fill'],

  ['the uniform array is declared shorter than pack() writes',
   'uniform vec4 uRipples[8];',
   'uniform vec4 uRipples[4];',
   'declares the ripple uniform at the size RippleBank packs'],

  ['the wavefront is narrowed to where it vanishes between mobile vertices',
   'const float RIPPLE_W = 0.28;',
   'const float RIPPLE_W = 0.04;',
   'keeps the wavefront wide enough to survive the mobile vertex spacing'],

  ['uShimmer is dropped from the fragment shader while staying declared',
   '  float iridMix  = 0.05 + uTreble * 0.08 + uShimmer * 0.10 + uReverb * 0.12;',
   '  float iridMix  = 0.05 + uTreble * 0.08 + uReverb * 0.12;',
   'reads uShimmer rather than only declaring it'],

  // The stage split. Each of these compiles (or, for the GLSL ones, would once
  // the declaration followed) and renders a live orb whose surface is lifted
  // or dead -- the regression measured at 0.053 -> 0.031 local contrast.
  ['the rim gain reads the sustained bass again, lifting the whole surface',
   'color += fresnel * rimColor * (0.50 + uKick * 0.80',
   'color += fresnel * rimColor * (0.50 + uBass * 0.80',
   'takes its brightness from the kick, never from the calm bass'],

  ['the crack veins read the sustained bass again',
   'vein * uCrack * (0.5 + uKick * 0.9)',
   'vein * uCrack * (0.5 + uBass * 0.9)',
   'takes its brightness from the kick, never from the calm bass'],

  ['the kick leaks into displacement, bringing the jitter back',
   'snoise(normal * 1.4 + t * 0.22) * uBass   * 0.40',
   'snoise(normal * 1.4 + t * 0.22) * uKick   * 0.40',
   'leaves the calm bass driving the geometry'],

  ['the fragment stage is fed the calm bass through its own uniform',
   'this.uniforms.uKick.value    = kickVis',
   'this.uniforms.uKick.value    = bVis',
   'feeds the fragment stage the kick and the vertex stage the bass mass'],

  ['the geometry is fed the kick again (the reported jitter)',
   'this.uniforms.uBass.value    = bVis',
   'this.uniforms.uBass.value    = kickVis',
   'feeds the fragment stage the kick and the vertex stage the bass mass'],

  ['the uniform swell is shaded as relief again, lifting the whole surface',
   '  vDisp = disp - swell * (1.0 - uCrystal * 0.90);',
   '  vDisp = disp;',
   'shades the relief, not the uniform breath'],

  ['the swell is dropped from the geometry instead of from the shading',
   'vec3 displaced = position + normal * disp;',
   'vec3 displaced = position + normal * (disp - swell);',
   'shades the relief, not the uniform breath'],

  ['uKick has no JS entry, so the GLSL reads 0 and the surface stops reacting',
   '      uKick:    { value: 0 },\n',
   '',
   'gives uKick a value in the uniforms object, so the GLSL does not read 0'],
]

export const SURVIVORS = {}
