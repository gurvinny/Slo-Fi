// 3D reactive "Anomaly" sphere using Three.js.
// The blob distorts based on live audio energy bands — bass drives heavy
// low-frequency bulges, mid adds ripples, treble shimmers the surface.
// Energy response is heavily damped so the sphere moves like liquid mercury:
// slow, weighty, and slightly behind the beat.
// Post-processing: UnrealBloom for the orb glow, then film grain + chromatic
// aberration for the VHS / retro-slowed aesthetic.
// The renderer clears to the page background color so the container box is
// invisible — the orb appears to float seamlessly over the page.
// Additional effects: 350-particle cloud and 3 energy rings react to the music.

import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Mesh,
  Clock,
  Line,
  LineBasicMaterial,
  Points,
  Color,
  Vector2,
  Vector3,
  IcosahedronGeometry,
  ShaderMaterial,
  BufferGeometry,
  BufferAttribute,
  Texture,
  FrontSide,
  AdditiveBlending,
  ACESFilmicToneMapping,
} from 'three'
import type { IUniform } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// ── Simplex 3D noise (Ashima Arts, MIT) ─────────────────────────────────────
// Embedded so the vertex shader has no external dependencies at runtime.
const GLSL_NOISE = /* glsl */`
vec3 _mod289v3(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 _mod289v4(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 _permute(vec4 x){return _mod289v4(((x*34.)+1.)*x);}
vec4 _taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);
  const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=_mod289v3(i);
  vec4 p=_permute(_permute(_permute(
    i.z+vec4(0.,i1.z,i2.z,1.))
    +i.y+vec4(0.,i1.y,i2.y,1.))
    +i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;
  vec4 s1=floor(b1)*2.+1.;
  vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=_taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`

// ── Sphere vertex shader ─────────────────────────────────────────────────────
// Four displacement layers + idle breath. uSpeed warps time so slow playback
// makes the surface deform more languidly with bigger bulges.
const VERTEX_SHADER = /* glsl */`
${GLSL_NOISE}

uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uSpeed;   // 0.25-1.0 — slower = dreamier, larger distortion
uniform float uCrystal; // 0-1 — flattens displacement toward a perfect sphere when paused
uniform float uSubBass; // isolated 20-80 Hz sub-bass — drives slow ominous 808 rumble

varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vDisp;

void main() {
  // Warp time so slow playback feels more languid and dreamy
  float t = uTime * (0.4 + uSpeed * 0.6);
  // Subtle slowAmp so the shape stays orb-like even at 0.25x speed
  float slowAmp = 1.0 + (1.0 - uSpeed) * 0.18;

  // Sub-bass (808 territory): very low spatial frequency = large slow ominous bulge
  float dSub = snoise(normal * 0.85 + t * 0.10) * uSubBass * 0.28 * slowAmp;
  // Bass gets the biggest bumps; mid adds ripples; treble adds shimmer.
  // Amplitudes are tuned so the orb deforms dramatically but stays readable.
  float d1   = snoise(normal * 1.4 + t * 0.22) * uBass   * 0.40 * slowAmp;
  float d2   = snoise(normal * 3.6 + t * 0.50) * uMid    * 0.12;
  float d4   = snoise(normal * 5.8 + t * 0.38) * uMid    * 0.07;
  float d3   = snoise(normal * 9.2 + t * 1.05) * uTreble * 0.05;
  float idle = snoise(normal * 1.9 + t * 0.16) * 0.028;

  // Crystal flattening: displacement irons toward a perfect sphere when paused.
  float disp = clamp(dSub + d1 + d2 + d3 + d4 + idle, -0.52, 0.52) * (1.0 - uCrystal * 0.90);
  vDisp = disp;

  vNormal   = normalize(normalMatrix * normal);
  vec3 displaced = position + normal * disp;
  vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`

// ── Sphere fragment shader ───────────────────────────────────────────────────
// Fresnel rim + hemisphere gradient + beat-reactive iridescence + core glow.
// Color uniforms rotate each frame so the palette cycles with the beat.
// uReverb adds iridescent wash — high reverb makes the orb look wet and blurry.
const FRAGMENT_SHADER = /* glsl */`
${GLSL_NOISE}

uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uTime;
uniform float uReverb;  // 0-1 — higher = more iridescent / glowy wash
uniform float uCrack;   // 0-1 — fracture vein intensity, peaks on hard bass
uniform float uCrystal; // 0-1 — crystallization, lerps toward 1 when paused
uniform vec3  uColorA;  // hue 0   — cycles each frame
uniform vec3  uColorB;  // hue +0.28 offset
uniform vec3  uColorC;  // hue +0.55 offset
uniform vec3  uColorD;  // hue +0.14 offset (bass warmth)

varying vec3  vNormal;
varying vec3  vWorldPos;
varying float vDisp;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float nDotV  = clamp(dot(vNormal, viewDir), 0.0, 1.0);
  float fresnel = pow(1.0 - nDotV, 3.0);

  // Four palette colors sit 90° apart on the hue wheel (set in JS each frame).
  // Each frequency band governs which color zone dominates which part of the sphere.
  float gradient = vNormal.y * 0.5 + 0.5;           // 0 = bottom pole, 1 = top pole
  float midBand  = 1.0 - abs(gradient * 2.0 - 1.0); // 0 at poles, 1 at equator

  // Bass → bottom hemisphere shifts from A (calm) toward D (excited)
  vec3 colorBot = mix(uColorA, uColorD, clamp(uBass * 2.5, 0.0, 1.0));
  // Treble → top hemisphere shifts from B toward C
  vec3 colorTop = mix(uColorB, uColorC, clamp(uTreble * 2.2, 0.0, 1.0));
  // Mid → equatorial band flashes C on beats
  vec3 colorEq  = mix(uColorB, uColorC, clamp(uMid  * 2.0, 0.0, 1.0));

  vec3 color = mix(colorBot, colorTop, gradient);
  // Equatorial mid-band mixes in proportionally to mid energy
  color = mix(color, colorEq, midBand * (0.35 + uMid * 0.65));

  float dispBright = 0.12 + clamp(vDisp * 1.9, 0.0, 1.0) * 0.55;

  // Subtle iridescent shimmer — kept light so it doesn't hide the palette colors
  float iridHue  = fract(nDotV * 0.40 + vDisp * 0.30 + uTime * 0.035 + uBass * 0.25);
  vec3 iridColor = hsv2rgb(vec3(iridHue, 0.60, 0.65));
  float iridMix  = 0.05 + uTreble * 0.08 + uReverb * 0.12;
  color = mix(color, iridColor, clamp(iridMix, 0.0, 0.28));

  color *= dispBright;

  // Rim glow — dimmer base, reverb boosts it for a wet-echo shimmer
  vec3 rimColor = mix(uColorA, uColorC, clamp(uBass * 2.0, 0.0, 1.0));
  rimColor = mix(rimColor, uColorB, 0.40 + uMid * 0.35);
  color += fresnel * rimColor * (0.50 + uBass * 0.80 + uReverb * 0.30);

  // Core glow
  float coreGlow = pow(nDotV, 6.0) * 0.20;
  color += coreGlow * mix(uColorB, uColorC, uTreble) * 0.35;

  // Surface crack veins — blazing fracture lines that appear on heavy bass hits
  if (uCrack > 0.01) {
    float c1   = snoise(vNormal * 5.5 + uTime * 0.04);
    float c2   = snoise(vNormal * 11.0 + uTime * 0.025);
    float vein = abs(fract(c1 * 3.0 + c2 * 0.4) - 0.5) * 2.0;
    vein = pow(1.0 - smoothstep(0.76, 1.0, vein), 4.0);
    vec3 crackCol = mix(uColorA, uColorC, 0.5) * 3.2;
    color += crackCol * vein * uCrack * (0.5 + uBass * 0.9);
  }

  // Crystallization tint — icy blue-white wash with hardened rim when paused
  if (uCrystal > 0.01) {
    vec3 iceColor = vec3(0.70, 0.88, 1.0);
    color = mix(color, iceColor * (dispBright * 0.8 + 0.25), uCrystal * 0.65);
    color += fresnel * iceColor * uCrystal * 0.55;
  }

  // Reverb also slightly increases alpha — more verb = more ethereal opacity
  float alpha = 0.40 + fresnel * 0.48 + uBass * 0.07 + uReverb * 0.06;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`

// ── Star shaders ─────────────────────────────────────────────────────────────
// Each star has a random twinkle speed and phase so they glisten independently.
// Treble energy makes peaks sharper — hi-hats cause the whole sky to sparkle.
const STAR_VERT = /* glsl */`
uniform float uTime;
uniform float uTreble;
attribute float aPhase;
attribute float aSpeed;
attribute float aSize;
varying float vAlpha;
varying float vSpark;

void main() {
  // Per-star twinkle: power curve makes peaks sharper than troughs (glisten feel)
  float t       = 0.5 + 0.5 * sin(uTime * aSpeed + aPhase);
  float sharpness = 2.2 + uTreble * 2.8;
  float twinkle = pow(t, sharpness);
  vAlpha = 0.22 + twinkle * (0.78 + uTreble * 0.25);
  vSpark = smoothstep(0.75, 1.0, twinkle);  // full sparkle only at peak

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (1.0 + vSpark * 2.2);
  gl_Position  = projectionMatrix * mv;
}
`

const STAR_FRAG = /* glsl */`
uniform float uBrightness;
varying float vAlpha;
varying float vSpark;

void main() {
  vec2  uv = gl_PointCoord - 0.5;
  float d  = length(uv);
  if (d > 0.5) discard;

  // Crisp bright core + soft halo
  float core = pow(1.0 - smoothstep(0.0, 0.22, d), 2.5);
  float halo = (1.0 - smoothstep(0.0, 0.5, d)) * 0.25;

  // Four-pointed diffraction cross — only visible at peak brightness
  float cx = smoothstep(0.08, 0.0, abs(uv.y)) * smoothstep(0.42, 0.25, abs(uv.x));
  float cy = smoothstep(0.08, 0.0, abs(uv.x)) * smoothstep(0.42, 0.25, abs(uv.y));
  float cross = max(cx, cy) * vSpark;

  float shape = max(core + halo, cross);
  // Slightly blue-white star colour
  gl_FragColor = vec4(0.88, 0.93, 1.0, shape * vAlpha * uBrightness);
}
`

// ── Particle vertex shader ───────────────────────────────────────────────────
// Each particle slowly orbits at a random phase; bass pushes them outward and
// treble makes them brighter and larger.
const PARTICLE_VERT = /* glsl */`
uniform float uBass;
uniform float uTreble;
uniform float uTime;

attribute float aSize;
attribute float aPhase;
attribute float aRadius;

varying float vAlpha;

void main() {
  // Bass pushes particles outward from the sphere surface
  float r = aRadius + uBass * 0.50;
  vec3 pos = normalize(position) * r;

  // Y-axis orbit at a per-particle rate and phase
  float angle = uTime * 0.12 + aPhase;
  float cosA = cos(angle);
  float sinA = sin(angle);
  pos = vec3(
    pos.x * cosA - pos.z * sinA,
    pos.y,
    pos.x * sinA + pos.z * cosA
  );

  // Keep alpha low — additive accumulation is the brightness, not alpha
  vAlpha = 0.55 + uTreble * 0.35;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  // Tighter perspective factor + smaller base size = crisp spark appearance
  float persp = clamp(90.0 / max(-mv.z, 0.5), 0.5, 3.5);
  gl_PointSize = aSize * (0.7 + uTreble * 0.8) * persp;
  gl_Position  = projectionMatrix * mv;
}
`

// ── Particle fragment shader ─────────────────────────────────────────────────
// Sharp dot: bright solid core with a tight falloff so particles read as
// crisp sparks rather than blurry blobs.
const PARTICLE_FRAG = /* glsl */`
uniform vec3 uParticleColor;
varying float vAlpha;

void main() {
  vec2  uv = gl_PointCoord - 0.5;
  float d  = length(uv);
  if (d > 0.5) discard;
  // Hard inner core (0–0.18 fully opaque), tight fade to edge
  float glow = 1.0 - smoothstep(0.10, 0.45, d);
  glow = pow(glow, 1.6);
  gl_FragColor = vec4(uParticleColor, glow * vAlpha);
}
`

// ── Film grain + chromatic aberration pass ───────────────────────────────────
// Grain adds a grainy analog texture; CA splits the RGB channels slightly,
// stronger at the image edges and more intense when the bass hits hard.
const GRAIN_CA_SHADER = {
  uniforms: {
    tDiffuse:  { value: null as Texture | null },
    uTime:     { value: 0 },
    uBass:     { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uBass;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      // Chromatic aberration: offset R/B channels away from center.
      // The offset grows toward the edges and pulses slightly with bass.
      vec2  center = vUv - 0.5;
      float dist   = length(center);
      float ca     = (0.0018 + uBass * 0.028) * dist;
      vec2  dir    = normalize(center + 0.0001);

      float r = texture2D(tDiffuse, vUv - dir * ca).r;
      float g = texture2D(tDiffuse, vUv            ).g;
      float b = texture2D(tDiffuse, vUv + dir * ca ).b;

      // Film grain: random noise per-pixel that changes every frame
      float grain = (rand(vUv + fract(uTime * 0.0173)) * 2.0 - 1.0) * 0.028;

      gl_FragColor = vec4(r + grain, g + grain, b + grain, 1.0);
    }
  `,
}

// ── Damping constants ────────────────────────────────────────────────────────
// Bass uses asymmetric lerp (fast attack, slow decay) for punchy impact.
const BASS_LERP_UP   = 0.32   // fast attack — orb snaps to the beat immediately
const BASS_LERP_DOWN = 0.025  // slow decay  — energy lingers after the hit
const MID_LERP       = 0.040
const TREBLE_LERP    = 0.060
// UI beat-pulse values — fast attack + moderate decay for snappy site-wide reactivity
const UI_BASS_UP     = 0.32   // near-instant attack so UI hits land on the beat
const UI_BASS_DOWN   = 0.08   // faster decay than aurora bass (~12 frames)
const UI_TREBLE_LERP = 0.10

// ── Glitch / scanline corruption pass ────────────────────────────────────────
// A post-processing ShaderPass that simulates digital video corruption.
// The screen is divided into thin horizontal bands of random height; a random
// subset of those bands are offset horizontally, mimicking a corrupt VHS or
// dropped-frame glitch artefact.
//
// Design goals:
//   • Subtle by default — the band shift is small (max ±2.75% of screen width)
//     so the effect reads as "interference" rather than pure chaos
//   • Temporally noisy — band heights and which bands shift are re-seeded every
//     few frames (6–12 Hz) so the pattern never settles into a repeating loop
//   • Zero cost when idle — the shader early-exits (uGlitch < 0.001) so there's
//     no per-pixel work unless the effect is actually firing
//   • Kick-driven — uGlitch is driven by kickVis in JS, so glitches only appear
//     on hard transients (loud kick drums / 808 attacks) not sustained bass
//
// uGlitch range: 0 (off) → 1 (maximum band shift). In practice it reaches
// ~0.5 on a strong kick because the kickVis multiplier is conservative.
const GLITCH_SHADER = {
  uniforms: {
    tDiffuse: { value: null as Texture | null }, // input framebuffer from previous pass
    uGlitch:  { value: 0 },   // 0-1 corruption intensity, driven by kick energy each frame
    uTime:    { value: 0 },   // elapsed seconds — seeds temporal randomness in the shader
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uGlitch;
    uniform float uTime;
    varying vec2 vUv;

    // Low-quality but fast hash — adequate for visual noise, not cryptography
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      // Skip all per-pixel work when glitch is effectively zero (toggle off or
      // between kicks). This keeps the pass free when glitchEnabled = false.
      if (uGlitch < 0.001) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      // Divide screen into horizontal bands of randomised height (1.8%–7.3% of
      // screen height). The band height changes at ~6 Hz so the grid constantly
      // re-tiles, preventing any visible periodicity.
      float band    = 0.018 + rand(vec2(floor(uTime * 6.3), 1.0)) * 0.055;
      float bandIdx = floor(vUv.y / band);   // integer band index for this pixel

      // Each band gets a per-frame random seed. Seed changes at ~11 Hz — faster
      // than the band grid so individual bands flicker independently.
      float seed    = rand(vec2(bandIdx, floor(uTime * 11.7)));

      // Only ~28% of bands shift (seed > 0.72). The rest pass through unchanged.
      // Shift magnitude is ±(uGlitch × 2.75%) of screen width — intentionally
      // small so the effect looks like interference rather than full corruption.
      float shift   = seed > 0.72
        ? (rand(vec2(bandIdx + 0.3, floor(uTime * 8.0))) - 0.5) * uGlitch * 0.055
        : 0.0;

      // Sample source with horizontal offset; Y is unchanged so bands stay level
      gl_FragColor = texture2D(tDiffuse, vec2(vUv.x + shift, vUv.y));
    }
  `,
}

// ── Per-theme color palettes ─────────────────────────────────────────────────
// Each entry is [A, B, C, D] where each slot is [hue, saturation, lightness].
// Audio modulates lightness (+bass) and saturation (+treble) at runtime so the
// palette still pulses with the music while staying completely on-theme.
const THEME_PALETTES: Record<string, Array<[number, number, number]>> = {
  void:  [[0.75, 0.88, 0.38], [0.67, 0.78, 0.42], [0.82, 0.72, 0.40], [0.70, 0.62, 0.33]],
  neon:  [[0.50, 0.95, 0.52], [0.40, 0.90, 0.50], [0.88, 0.95, 0.57], [0.57, 0.90, 0.55]],
  ember: [[0.03, 0.95, 0.55], [0.09, 0.92, 0.57], [0.00, 0.88, 0.45], [0.14, 0.85, 0.55]],
  frost: [[0.56, 0.72, 0.65], [0.51, 0.65, 0.70], [0.61, 0.60, 0.68], [0.58, 0.48, 0.78]],
  mono:  [[0.00, 0.04, 0.55], [0.00, 0.04, 0.65], [0.00, 0.04, 0.70], [0.00, 0.04, 0.45]],
}

export class AnomalySphere {
  private renderer:  WebGLRenderer
  private scene:     Scene
  private camera:    PerspectiveCamera
  private mesh:      Mesh
  private composer:  EffectComposer
  private bloom:     UnrealBloomPass
  private grainPass: ShaderPass
  private clock:     Clock

  private analyser: AnalyserNode
  private freqData: Uint8Array<ArrayBuffer>

  // Smoothed energy values (all start at 0, decay on stop)
  private bass   = 0
  private mid    = 0
  private treble = 0
  // Fast-attack/decay values for snappy site-wide UI reactivity
  private uiBass   = 0
  private uiTreble = 0
  private hueOffset  = 0    // rotating palette hue, advanced each frame by beat energy
  private reverb     = 0.2  // current reverb mix (0-1), set via setReverb()
  private speed      = 1.0  // current playback rate (0.25-1), set via setSpeed()
  // Default reactivity starts low so the orb is calm on first load.
  // The user can raise it via the Reactivity slider in Visual Settings.
  private reactivity    = 0.40
  private glowMult      = 1.0
  private colorTheme    = 'prism'
  private themeHueLock  = -1    // -1 = prism mode (free hue cycling), 0 = theme locked
  private bassPulse     = true
  private rotationSpeed = 1.0
  // orbBaseScale starts noticeably below 1.0 so the orb looks small and contained
  // before the music kicks in; bass/kick energy drives it outward from there.
  private orbBaseScale  = 0.55
  private _8DEnabled    = false
  private _8DAngle      = 0    // current panner angle in radians, set by AudioEngine callback
  private particleCount = 500
  private prevBass      = 0   // previous frame bass — used for wide-band transient detection
  // ── Sub-bass / 808 channel ────────────────────────────────────────────────
  // Isolated 20–80 Hz band that tracks the fundamental frequency of 808 bass
  // hits and sub-bass synths. Heavily compressed rap/hip-hop often has very
  // little variation in the full bass band (20–250 Hz) but the 808 region still
  // moves frame-to-frame, so this gives the orb something to react to.
  private subBass       = 0
  private prevSubBass   = 0   // previous frame sub-bass for transient detection
  // ── Adaptive range expansion ──────────────────────────────────────────────
  // Tracks the observed dynamic range of the current track.  For tracks with
  // heavy mastering / limiting (where raw bass barely varies), remapping
  // bassFloor→bassCeiling to 0→1 makes the orb feel alive even when the
  // waveform looks like a solid rectangle in a DAW.
  private bassFloor     = 0   // slow-rising floor: ignores brief dips, tracks silence
  private bassCeiling   = 0.4 // fast-rising ceiling: immediately captures peaks
  // ── Kick detection via spectral flux ─────────────────────────────────────
  // Instead of reacting to sustained bass energy (which is constant on compressed
  // tracks), we measure the per-frame *positive increase* in the 40–150 Hz bin
  // range.  This fires sharply on each kick drum attack regardless of compression,
  // then decays before the next hit.  kickEnergy drives all motion-related
  // visuals (bloom, scale, rotation, cracks, lightning) so the orb pulses exactly
  // on the beat rather than glowing at a constant medium level.
  private kickEnergy    = 0   // smoothed spectral flux, 40-150 Hz, scaled ×2.8 in kickVis
  private prevFreqData: Uint8Array | null = null  // previous FFT frame for flux delta
  private _loopPulseAmount = 0  // decays each frame; set to 1 on each loop cycle

  // ── Orb effect: lightning tendrils ─────────────────────────────────────────
  // Short jagged Line arcs spawn at the orb surface and shoot outward on
  // kick transients. Each arc has a lifespan counter; opacity fades linearly as
  // life drains so they flash and vanish rather than hard-cutting. AdditiveBlending
  // means overlapping arcs brighten each other, giving a cluster-strike feel.
  private lightningArcs: Array<{ mesh: Line; life: number; maxLife: number }> = []
  private lightningMat!: LineBasicMaterial  // shared base material, cloned per arc
  private lightningEnabled = true   // default ON; toggled by UI switch

  // ── Orb effect: glitch corruption ──────────────────────────────────────────
  // Post-processing scanline-shift pass. glitchAmount is lerped toward
  // glitchRaw each frame (fast attack, moderate decay). The GLITCH_SHADER
  // reads uGlitch each frame so the amount tracks the energy smoothly.
  // Default OFF — can be distracting on subtle music, so the user opts in.
  private glitchPass!: ShaderPass
  private glitchAmount = 0          // current smoothed glitch intensity (0-1)
  private glitchEnabled = false     // default OFF; toggled by UI switch

  // ── Orb effect: pause crystallization ──────────────────────────────────────
  // When playback stops, crystalAmount lerps to 1.0 over a few seconds, driving
  // two shader uniforms: uCrystal flattens vertex displacement (orb becomes a
  // smooth sphere) and tints the fragment shader icy blue-white. On resume it
  // slowly melts back. Looks like the orb freezes in place when music stops.
  private crystalAmount = 0         // 0 = molten/active, 1 = fully crystallised
  private crystalEnabled = true     // default ON; toggled by UI switch

  // ── Orb effect: surface crack veins ────────────────────────────────────────
  // Blazing fracture lines rendered in the fragment shader via snoise-based
  // Voronoi-like pattern. They emerge on heavy kick hits (kickVis > 0.30) and
  // fade rapidly so they look like momentary stress fractures in the surface.
  private crackEnabled = true       // default ON; toggled by UI switch

  // Visual fade for smooth pause/play transitions
  private visualFade = 0.4   // current rendered brightness (0-1)
  private targetFade = 0.4   // lerp target — 1.0 playing, 0.4 paused

  // Intro reveal: orb materialises from a point when first created
  private introProgress  = 0    // 0 → 1 (ease-out-back) over ~1.5 s
  private introStartTime = -1   // clock time on first rendered frame

  // Star field
  private stars!: Points
  private starUniforms!: {
    uTime:       IUniform<number>
    uTreble:     IUniform<number>
    uBrightness: IUniform<number>
  }

  // Sphere uniforms typed for direct access
  private uniforms: {
    uTime:    IUniform<number>
    uBass:    IUniform<number>
    uMid:     IUniform<number>
    uTreble:  IUniform<number>
    uReverb:  IUniform<number>
    uSpeed:   IUniform<number>
    uSubBass: IUniform<number>
    uCrack:   IUniform<number>
    uCrystal: IUniform<number>
    uColorA:  IUniform<Color>
    uColorB:  IUniform<Color>
    uColorC:  IUniform<Color>
    uColorD:  IUniform<Color>
  }

  // Particle cloud around the orb
  private particles!: Points
  private particleUniforms!: {
    uBass:          IUniform<number>
    uTreble:        IUniform<number>
    uTime:          IUniform<number>
    uParticleColor: IUniform<Color>
  }

  private container: HTMLElement  // stored so resize() doesn't need parentElement
  private rafId:   number | null = null
  private playing  = false
  private _reducedMotion: boolean
  private _motionMQ: MediaQueryList

  // Called each frame with smoothed bass/mid/treble for the aurora, plus
  // fast-attack uiBass/uiTreble for snappy site-wide UI reactivity.
  public onEnergyUpdate: ((bass: number, mid: number, treble: number, uiBass: number, uiTreble: number) => void) | null = null

  constructor(container: HTMLElement, analyser: AnalyserNode) {
    this.analyser  = analyser
    this.freqData  = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
    this.clock     = new Clock()
    this.container = container

    // ── Renderer ────────────────────────────────────────────────────────────
    // Match the page background exactly so removing the CSS box makes the
    // renderer area seamless — the orb appears to float over the page.
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3))
    this.renderer.setClearColor(new Color('#080810'), 1)
    // ACESFilmic gracefully compresses HDR bloom values instead of clipping to white
    this.renderer.toneMapping         = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.50

    // Size to something non-zero right away so the composer doesn't start at 1x1
    this.renderer.setSize(300, 300, false)

    const canvas = this.renderer.domElement
    canvas.style.display  = 'block'
    canvas.style.position = 'absolute'
    canvas.style.inset    = '0'
    canvas.style.width    = '100%'
    canvas.style.height   = '100%'
    canvas.setAttribute('aria-hidden', 'true')
    canvas.setAttribute('tabindex', '-1')
    container.appendChild(canvas)

    // ── Scene + camera ───────────────────────────────────────────────────────
    this.scene  = new Scene()
    this.camera = new PerspectiveCamera(60, 1, 0.1, 100)
    this.camera.position.z = 4.2

    // ── Sphere geometry + material ───────────────────────────────────────────
    // Detail level 6 → ~10k vertices for smooth high-frequency displacement
    const geo = new IcosahedronGeometry(1, 6)

    this.uniforms = {
      uTime:    { value: 0 },
      uBass:    { value: 0 },
      uMid:     { value: 0 },
      uTreble:  { value: 0 },
      uReverb:  { value: this.reverb },
      uSpeed:   { value: this.speed },
      uSubBass: { value: 0 },
      uCrack:   { value: 0 },
      uCrystal: { value: 0 },
      uColorA:  { value: new Color('#9b6dff') },
      uColorB:  { value: new Color('#00d4aa') },
      uColorC:  { value: new Color('#ff6eb4') },
      uColorD:  { value: new Color('#ffaa44') },
    }

    const mat = new ShaderMaterial({
      uniforms:       this.uniforms,
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent:    true,
      side:           FrontSide,
    })

    mat.wireframe = true   // default on
    this.mesh = new Mesh(geo, mat)
    this.scene.add(this.mesh)

    // ── Particle cloud + star field ──────────────────────────────────────────
    this.initParticles()
    this.initStars()
    this.initLightning()

    // ── Post-processing ─────────────────────────────────────────────────────
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    this.bloom = new UnrealBloomPass(
      new Vector2(300, 300),
      0.45,  // base strength — dimmer; reverb raises this at runtime
      0.38,
      0.22,
    )
    this.composer.addPass(this.bloom)

    this.grainPass = new ShaderPass(GRAIN_CA_SHADER)
    this.composer.addPass(this.grainPass)

    this.glitchPass = new ShaderPass(GLITCH_SHADER)
    this.composer.addPass(this.glitchPass)

    this.composer.addPass(new OutputPass())

    // ── Reduced motion ───────────────────────────────────────────────────────
    // If the OS reduced-motion preference is set, the loop still runs (for the
    // static glowing sphere) but all displacement and animation uniforms are
    // zeroed so the geometry stays a perfect sphere.
    this._motionMQ = window.matchMedia('(prefers-reduced-motion: reduce)')
    this._reducedMotion = this._motionMQ.matches
    this._motionMQ.addEventListener('change', (e) => { this._reducedMotion = e.matches })

    // ── Start loop + defer first resize ─────────────────────────────────────
    window.addEventListener('resize', () => this.resize())
    // orientationchange fires before the browser has applied the new viewport
    // dimensions, so defer resize by 150 ms to let the layout settle first.
    window.addEventListener('orientationchange', () => { setTimeout(() => this.resize(), 150) })
    this.loop()
    requestAnimationFrame(() => this.resize())
  }

  // Builds the particle field spread across the full scene volume.
  // 30% of particles orbit close to the orb; 70% are distributed far enough
  // that they appear across the entire viewport at varying depths.
  private initParticles(): void {
    this.particleUniforms = {
      uBass:          { value: 0 },
      uTreble:        { value: 0 },
      uTime:          { value: 0 },
      uParticleColor: { value: new Color('#b08aff') },
    }

    const mat = new ShaderMaterial({
      uniforms:       this.particleUniforms,
      vertexShader:   PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       AdditiveBlending,
    })

    this.particles = new Points(new BufferGeometry(), mat)
    this.scene.add(this.particles)
    this.rebuildParticleGeo(this.particleCount)
  }

  // Rebuilds the particle geometry with a new count. Called on init and from
  // setParticleCount() when the user adjusts the slider.
  private rebuildParticleGeo(count: number): void {
    const positions = new Float32Array(count * 3)
    const sizes     = new Float32Array(count)
    const phases    = new Float32Array(count)
    const radii     = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      positions[i * 3]     = Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = Math.cos(phi)
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta)

      sizes[i]  = 0.4 + Math.random() * 0.9
      phases[i] = Math.random() * Math.PI * 2

      // Mix: ~30% close to orb, ~70% spread across the whole scene
      radii[i] = Math.random() < 0.30
        ? 1.3 + Math.random() * 1.0     // close shell: 1.3–2.3
        : 2.5 + Math.random() * 7.5     // wide field:  2.5–10.0
    }

    const geo = this.particles.geometry
    geo.setAttribute('position', new BufferAttribute(positions, 3))
    geo.setAttribute('aSize',    new BufferAttribute(sizes, 1))
    geo.setAttribute('aPhase',   new BufferAttribute(phases, 1))
    geo.setAttribute('aRadius',  new BufferAttribute(radii, 1))
    geo.computeBoundingSphere()
  }

  // Builds a 1 400-point starfield spread across a large sphere.
  // Stars sit far behind the orb — perspective makes them fill the full screen.
  private initStars(): void {
    const count     = 1400
    const positions = new Float32Array(count * 3)
    const phases    = new Float32Array(count)
    const speeds    = new Float32Array(count)
    const sizes     = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      // Uniform sphere distribution
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      const r     = 18 + Math.random() * 14   // shell radius 18–32 units

      positions[i * 3]     = Math.sin(phi) * Math.cos(theta) * r
      positions[i * 3 + 1] = Math.cos(phi) * r
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r

      phases[i] = Math.random() * Math.PI * 2
      speeds[i] = 0.4 + Math.random() * 2.8   // twinkle speed 0.4–3.2 Hz
      sizes[i]  = 0.6 + Math.random() * 1.8   // px size before perspective
    }

    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(positions, 3))
    geo.setAttribute('aPhase',   new BufferAttribute(phases, 1))
    geo.setAttribute('aSpeed',   new BufferAttribute(speeds, 1))
    geo.setAttribute('aSize',    new BufferAttribute(sizes,  1))

    this.starUniforms = {
      uTime:       { value: 0 },
      uTreble:     { value: 0 },
      uBrightness: { value: 0.9 },
    }

    const mat = new ShaderMaterial({
      uniforms:       this.starUniforms,
      vertexShader:   STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       AdditiveBlending,
    })

    this.stars = new Points(geo, mat)
    this.scene.add(this.stars)
  }

  // Fire once per loop cycle from App.ts to produce a slow steady pulse,
  // distinct from the audio-reactive bass pulse.
  public triggerLoopPulse(): void {
    this._loopPulseAmount = 1
  }

  start(): void {
    this.playing    = true
    this.targetFade = 1.0
  }

  stop(): void {
    this.playing    = false
    this.targetFade = 0.4
    this.onEnergyUpdate?.(0, 0, 0, 0, 0)
  }

  // Called from App.ts whenever the reverb mix slider changes (0-1)
  setReverb(v: number): void { this.reverb = v }

  // Called from App.ts whenever the speed slider changes (0.25-1.0)
  setSpeed(v: number): void { this.speed = v }

  private loop(): void {
    this.rafId = requestAnimationFrame(() => this.loop())

    const elapsed = this.clock.getElapsedTime()

    // Under reduced motion: render the orb as a static glowing sphere with
    // no vertex displacement or beat-driven animation. The bloom and color
    // still render so the orb remains visible, just motionless.
    if (this._reducedMotion) {
      this.uniforms.uTime.value    = elapsed
      this.uniforms.uBass.value    = 0
      this.uniforms.uMid.value     = 0
      this.uniforms.uTreble.value  = 0
      this.uniforms.uSubBass.value = 0
      this.bloom.strength = 0.25 * this.glowMult
      this.composer.render()
      return
    }

    // Intro animation: orb grows from a point over ~1.5 s with ease-out-back
    // (slight overshoot → spring feel, like the orb is accepting the file)
    if (this.introProgress < 1) {
      if (this.introStartTime < 0) this.introStartTime = elapsed
      const t = Math.min((elapsed - this.introStartTime) / 1.5, 1)
      // ease-out-back: overshoots ~10% at peak then settles at 1.0
      const c1 = 1.70158, c3 = c1 + 1
      this.introProgress = t < 1
        ? 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
        : 1
    }

    // Read audio data only while playing
    if (this.playing) {
      this.analyser.getByteFrequencyData(this.freqData)

      // ── Band energy — three primary frequency channels ──────────────────────
      // Each channel uses asymmetric lerp (fast attack / slow decay) so the
      // sphere jumps to a hit immediately but settles languidly afterwards,
      // giving the illusion of inertia / liquid weight.
      const rawBass   = this.bandEnergy(20,   250)
      const rawMid    = this.bandEnergy(250,  4000)
      const rawTreble = this.bandEnergy(4000, 20000)
      // Isolated 20–80 Hz channel dedicated to 808 / sub-bass fundamentals.
      // Heavy limiting compresses the full 20–250 Hz band to near-constant level,
      // but the sub region still rises and falls with each 808 hit.
      const rawSubBass = this.bandEnergy(20, 80)

      // Bass uses the globally-tuned asymmetric lerp constants so it snaps
      // fast on attack and lingers on decay (punchy but weighty feel).
      const bassLerp = rawBass > this.bass ? BASS_LERP_UP : BASS_LERP_DOWN
      this.bass    += (rawBass    - this.bass)    * bassLerp
      // Sub-bass: fast attack (0.38) so 808 strikes register immediately,
      // very slow decay (0.028) so the energy holds through the long tail.
      this.subBass += (rawSubBass - this.subBass) * (rawSubBass > this.subBass ? 0.38 : 0.028)
      this.mid     += (rawMid    - this.mid)    * MID_LERP
      this.treble  += (rawTreble - this.treble) * TREBLE_LERP

      // ── Adaptive floor / ceiling ────────────────────────────────────────────
      // bassFloor rises very slowly (α = 0.0006 ≈ 1 000+ frames to settle),
      // settling at 70% of the long-term bass level.  This ignores momentary
      // silence and tracks the "noise floor" of the track.
      // bassCeiling chases peaks quickly (α = 0.04 on the way up) and falls
      // slowly (α = 0.003) so transient peaks don't immediately collapse the
      // ceiling back down.
      // Together, floor→ceiling defines the "active range" of this specific track.
      // normalizedBass later remaps this range to 0→1 so the orb always uses its
      // full motion envelope regardless of how hard the master was compressed.
      this.bassFloor   += ((rawBass * 0.7) - this.bassFloor)   * 0.0006
      this.bassCeiling += (rawBass - this.bassCeiling) * (rawBass > this.bassCeiling ? 0.04 : 0.003)
      // Hard minimum gap of 0.12 so the range never collapses to near-zero during
      // a silent section and cause a division-by-near-zero blow-up below.
      this.bassCeiling  = Math.max(this.bassCeiling, this.bassFloor + 0.12)

      // ── Kick detection via spectral flux (40–150 Hz) ────────────────────────
      // Spectral flux = sum of per-bin *positive* differences between consecutive
      // FFT frames.  Negative differences (frequencies that fell) are ignored —
      // we only care about energy arriving, not leaving.
      //
      // Why 40–150 Hz?  This window captures:
      //   • Kick drum fundamental (50–100 Hz)
      //   • 808 bass drum attack transient (60–150 Hz)
      //   • Sub-bass note onset without too much bleed from the mid range
      //
      // The raw flux is normalised by the bin count × max byte value (255) to
      // produce a 0–1 figure per frame, then scaled ×8 so a typical kick drum
      // pushes it toward 1.0 even on a compressed track where absolute values
      // are high but *changes* between frames are small.
      //
      // kickEnergy is then smoothed with a very fast attack (0.55) so the orb
      // responds within one or two frames of the onset, and a moderate decay
      // (0.12) that holds the energy for ~8 frames (~130 ms at 60 fps) before
      // it fades — long enough to feel substantial, short enough not to bleed
      // into the next kick.
      const kickLo = this.freqToBin(40)
      const kickHi = this.freqToBin(150)
      let kickFlux = 0
      if (this.prevFreqData) {
        for (let i = kickLo; i <= kickHi; i++) {
          const d = (this.freqData[i] ?? 0) - this.prevFreqData[i]
          if (d > 0) kickFlux += d   // accumulate only rising bins
        }
        // Normalise to 0-1 and apply ×8 gain to compensate for compression
        kickFlux = Math.min(kickFlux / ((kickHi - kickLo + 1) * 255) * 8.0, 1.0)
      }
      // Asymmetric smoothing: fast attack (0.55), moderate decay (0.12)
      this.kickEnergy += (kickFlux - this.kickEnergy) * (kickFlux > this.kickEnergy ? 0.55 : 0.12)

      // Lazy-allocate the previous-frame buffer on the first playing frame.
      // After allocation, copy current frame so next frame has something to diff.
      if (!this.prevFreqData) this.prevFreqData = new Uint8Array(this.freqData.length)
      this.prevFreqData.set(this.freqData)

      // Fast-attack UI pulse values for site-wide reactivity
      const uiBassLerp = rawBass > this.uiBass ? UI_BASS_UP : UI_BASS_DOWN
      this.uiBass   += (rawBass   - this.uiBass)   * uiBassLerp
      this.uiTreble += (rawTreble - this.uiTreble) * UI_TREBLE_LERP

      this.onEnergyUpdate?.(this.bass, this.mid, this.treble, this.uiBass, this.uiTreble)
    } else {
      // Decay toward zero so the sphere calms down after stopping
      this.bass       *= 0.96
      this.subBass    *= 0.96
      this.mid        *= 0.96
      this.treble     *= 0.96
      this.kickEnergy *= 0.90
      this.uiBass     *= 0.92
      this.uiTreble   *= 0.92
    }

    // ── Reactivity scaling ───────────────────────────────────────────────────
    // bVis — broad bass visual energy, used for colour modulation and particles.
    //   Blends 40% raw bass + 60% adaptively normalised bass so the orb responds
    //   to both absolute loudness (raw) and relative dynamics within the track
    //   (normalised).  Normalised component ensures the orb stays lively even
    //   when a compressor has pushed the entire track to near-maximum level.
    const range          = Math.max(this.bassCeiling - this.bassFloor, 0.12)
    const normalizedBass = Math.max(0, (this.bass - this.bassFloor) / range)
    const expandedBass   = this.bass * 0.40 + normalizedBass * 0.60
    const bVis    = Math.min(expandedBass  * this.reactivity, 1.4)

    // kickVis — motion driver derived from kick/808 spectral flux.
    //   The ×2.8 pre-scale compensates for spectral flux values being naturally
    //   smaller than band-averaged energy; it ensures a strong kick drum reaches
    //   near 1.0 even at the default reactivity of 0.40.
    //   kickVis drives: vertex displacement (uBass), bloom, scale pulse, rotation,
    //   crack veins, glitch, and lightning.  This makes ALL motion effects respond
    //   to individual kick transients rather than sustained bass level.
    const kickVis = Math.min(this.kickEnergy * this.reactivity * 2.8, 1.4)

    // mVis / tVis — mid and treble visual levels; used for colour and particles only.
    const mVis    = this.mid    * this.reactivity
    const tVis    = this.treble * this.reactivity

    // ── Spectral color mapping ───────────────────────────────────────────────
    const bN = Math.min(bVis, 1)
    const mN = Math.min(mVis, 1)
    const tN = Math.min(tVis, 1)
    const energy = Math.min((bN + mN + tN) / 1.5, 1)

    // Sub-bass transient catches 808 attacks that the full-band bassTransient misses
    // in compressed tracks (where the wide-band bass barely moves frame to frame).
    const subBassTransient = Math.max(0, this.subBass - this.prevSubBass)
    const bassTransient = Math.max(
      Math.max(0, this.bass - this.prevBass),
      subBassTransient * 0.75,
    )

    if (this.themeHueLock < 0) {
      // Prism mode: hue advances with song energy so colors visibly cycle
      // fast during loud sections and drift slowly during quiet passages.

      // 1) Base drift + energy-scaled acceleration
      this.hueOffset = (this.hueOffset + 0.0012 + energy * 0.004) % 1

      // 2) Bass transient → sharp hue jump on every kick
      if (bassTransient > 0.04) {
        this.hueOffset = (this.hueOffset + bassTransient * 1.2) % 1
      }

      // 3) Mid energy nudges hue forward continuously
      this.hueOffset = (this.hueOffset + mN * 0.0008) % 1

      const sat   = 0.78 + energy * 0.18
      const light = 0.40 + energy * 0.14
      const nudge = energy * 0.06

      this.uniforms.uColorA.value.setHSL( this.hueOffset,                      sat,        light)
      this.uniforms.uColorB.value.setHSL((this.hueOffset + 0.25 + nudge) % 1,  sat,        light + 0.06)
      this.uniforms.uColorC.value.setHSL((this.hueOffset + 0.55 + nudge) % 1,  sat + 0.06, light + 0.12)
      this.uniforms.uColorD.value.setHSL((this.hueOffset + 0.78 - nudge) % 1,  sat,        light - 0.04)
    } else {
      // Theme mode: set colors directly from the theme palette so the orb
      // completely changes character per preset. Audio modulates lightness
      // (bass brightens) and saturation (treble vivifies) without drifting
      // away from the theme's hue identity.
      const p = THEME_PALETTES[this.colorTheme] ?? THEME_PALETTES.void
      const lBoost = bN * 0.15
      const sBoost = tN * 0.10
      const hShift = bN * 0.03 - tN * 0.02
      this.uniforms.uColorA.value.setHSL((p[0][0] + hShift + 1) % 1, Math.min(1, p[0][1] + sBoost), Math.min(0.90, p[0][2] + lBoost))
      this.uniforms.uColorB.value.setHSL((p[1][0] + hShift + 1) % 1, Math.min(1, p[1][1] + sBoost), Math.min(0.90, p[1][2] + lBoost))
      this.uniforms.uColorC.value.setHSL((p[2][0] + hShift + 1) % 1, Math.min(1, p[2][1] + sBoost), Math.min(0.90, p[2][2] + lBoost))
      this.uniforms.uColorD.value.setHSL((p[3][0] + hShift + 1) % 1, Math.min(1, p[3][1] + sBoost), Math.min(0.90, p[3][2] + lBoost))
    }

    this.prevBass    = this.bass
    this.prevSubBass = this.subBass

    // Update sphere uniforms — use visual (reactivity-scaled) values
    this.uniforms.uTime.value    = elapsed
    this.uniforms.uSubBass.value = Math.min(this.subBass * this.reactivity * 1.4, 1.0)
    this.uniforms.uBass.value    = kickVis
    this.uniforms.uMid.value    = mVis
    this.uniforms.uTreble.value = tVis
    this.uniforms.uReverb.value = this.reverb
    this.uniforms.uSpeed.value  = this.speed

    // Smooth fade for pause/play — slow lerp for an organic, weighty feel
    this.visualFade += (this.targetFade - this.visualFade) * 0.028
    // Clamp introProgress so it never over-brighten the exposure
    const introClamp = Math.min(this.introProgress, 1)
    this.renderer.toneMappingExposure = 0.50 * this.visualFade * introClamp

    // Bloom spikes on bass hits; intro adds a brief acceptance surge (sin arc)
    // peaks at the midpoint of the reveal, fades out as the orb settles
    const introSurge = Math.sin(introClamp * Math.PI) * 0.55
    this.bloom.strength = (Math.min(0.20 + this.reverb * 0.28 + kickVis * 0.72, 1.10) + introSurge) * this.glowMult * this.visualFade * introClamp

    // Mesh scale: intro reveal + base size + optional bass pulse + loop pulse
    // introProgress uses ease-out-back so the orb slightly overshoots before settling
    const pulseFactor = (this.bassPulse ? kickVis * 0.44 : 0) + kickVis * 0.14
    this._loopPulseAmount *= 0.985   // ~1.5 s decay at 60 fps
    const loopPulseFactor  = this._loopPulseAmount * 0.08
    this.mesh.scale.setScalar(this.orbBaseScale * (1.0 + pulseFactor + loopPulseFactor) * this.introProgress)

    // Rotation: when 8D mode is active, the orb tracks the panner angle directly.
    // Otherwise the normal audio-reactive rotation drives it.
    if (this._8DEnabled) {
      // Snap the Y rotation to the panner angle so the orb visually circles
      // the listener in sync with the binaural sound position.
      this.mesh.rotation.y = this._8DAngle
      // Keep a gentle tilt animation on X so the orb stays alive
      const rotScale = (0.35 + this.speed * 0.65) * this.rotationSpeed
      this.mesh.rotation.x += 0.0006 * rotScale
    } else {
      const rotScale = (0.35 + this.speed * 0.65) * this.rotationSpeed
      this.mesh.rotation.y += (0.0018 + kickVis * 0.010) * rotScale
      this.mesh.rotation.x += 0.0006 * rotScale
    }

    // Particle color tracks the palette hue
    this.particleUniforms.uBass.value   = bVis
    this.particleUniforms.uTreble.value = tVis
    this.particleUniforms.uTime.value   = elapsed
    const pHue = (this.hueOffset + 0.1) % 1.0
    this.particleUniforms.uParticleColor.value.setHSL(pHue, 0.85, 0.72)

    // Star field twinkle
    this.starUniforms.uTime.value   = elapsed
    this.starUniforms.uTreble.value = tVis

    // Film grain uses bVis (broad bass) rather than kickVis so the grain texture
    // stays continuously present during sustained bass passages, not just on hits.
    this.grainPass.uniforms['uTime'].value = elapsed
    this.grainPass.uniforms['uBass'].value = bVis

    // ── Effect: crystallization ──────────────────────────────────────────────
    // crystalAmount drives two shader uniforms: uCrystal.
    //   • In the vertex shader it multiplies displacement by (1 - uCrystal×0.9),
    //     flattening the surface toward a perfect sphere as the value rises.
    //   • In the fragment shader it lerps surface colour toward icy blue-white.
    // On pause: target = 1.0, lerp factor 0.005 → reaches ~0.63 in ~100 frames
    //           (~1.7 s), giving a slow "freezing" feel.
    // On play:  target = 0.0, lerp factor 0.010 → melts back in ~50 frames (~0.8 s),
    //           slightly faster so the orb snaps back to life quickly.
    // When the toggle is turned off, crystalAmount drains at ×0.95/frame so it
    // transitions smoothly rather than hard-jumping to zero.
    if (this.crystalEnabled) {
      const crystalTarget = this.playing ? 0.0 : 1.0
      this.crystalAmount += (crystalTarget - this.crystalAmount) * (this.playing ? 0.010 : 0.005)
    } else {
      // Drain smoothly when disabled mid-session (toggle flipped while paused)
      this.crystalAmount += (0 - this.crystalAmount) * 0.05
    }
    this.uniforms.uCrystal.value = this.crystalAmount

    // ── Effect: surface crack veins ──────────────────────────────────────────
    // crackRaw maps kickVis 0.30→0.80 to 0→1 (linear ramp).
    //   — Below 0.30 (light hits): no veins
    //   — 0.30–0.80 (moderate hits): veins grow proportionally
    //   — Above 0.80 (hard hits): veins fully saturate
    // Smoothing: fast attack (0.28) so veins appear instantly on a kick;
    // slow decay (0.10) so they fade over ~10 frames (~170 ms at 60 fps).
    // When the toggle is turned off, the uniform drains at ×0.85/frame.
    if (this.crackEnabled) {
      const crackRaw = Math.max(0, kickVis - 0.30) / 0.50
      this.uniforms.uCrack.value += (crackRaw - this.uniforms.uCrack.value) * (crackRaw > this.uniforms.uCrack.value ? 0.28 : 0.10)
    } else {
      this.uniforms.uCrack.value *= 0.85
    }

    // ── Effect: glitch / scanline corruption ─────────────────────────────────
    // Glitch only fires above 50% kickVis (strong kicks / hard 808 hits).
    // The (kickVis - 0.50) × 2.5 ramp means a kickVis of 0.90 produces
    // glitchRaw = 1.0, while lighter kicks below the threshold produce nothing.
    // This intentionally high threshold keeps glitch as a punctuation mark
    // rather than a constant state — it should feel like a system shock, not noise.
    // Attack: 0.22 (fast snap). Decay: 0.10 (moderate — ~10 frame fade).
    // Default OFF: the toggle must be turned on in Visual Settings.
    // When off, glitchAmount drains at ×0.80/frame — faster drain keeps the
    // screen clean immediately after the toggle is switched off.
    if (this.glitchEnabled) {
      const glitchRaw = kickVis > 0.50 ? Math.min(1.0, (kickVis - 0.50) * 2.5) : 0.0
      this.glitchAmount += (glitchRaw - this.glitchAmount) * (glitchRaw > this.glitchAmount ? 0.22 : 0.10)
    } else {
      this.glitchAmount *= 0.80   // drain quickly so the screen clears on toggle-off
    }
    this.glitchPass.uniforms['uGlitch'].value = this.glitchAmount
    this.glitchPass.uniforms['uTime'].value   = elapsed

    // Lightning tendrils
    if (this.lightningEnabled) {
      this.updateLightning(kickVis, bassTransient)
    } else {
      // Drain any arcs already in flight
      for (let i = this.lightningArcs.length - 1; i >= 0; i--) {
        const arc = this.lightningArcs[i]
        this.scene.remove(arc.mesh)
        arc.mesh.geometry.dispose()
        ;(arc.mesh.material as LineBasicMaterial).dispose()
      }
      this.lightningArcs = []
    }

    this.composer.render()
  }

  private resize(): void {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (w === 0 || h === 0) return

    const aspect     = w / h
    this.camera.aspect = aspect

    // Target a consistent visual size on every display:
    //   Landscape — orb fills 38% of viewport height
    //   Portrait  — orb fills 66% of viewport width (feels balanced on phone)
    // sphere radius = 1 unit; tan(30°) ≈ 0.577 for FOV 60°
    const tanHalfFov = Math.tan((this.camera.fov * Math.PI / 180) / 2)
    const z = aspect >= 1
      ? 1.0 / (0.38 * tanHalfFov)               // landscape: 38% of height
      : 1.0 / (0.66 * aspect * tanHalfFov)       // portrait:  66% of width

    this.camera.position.z = Math.max(3.5, Math.min(z, 7.5))

    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
  }

  // Maps a frequency in Hz to the nearest FFT bin index
  private freqToBin(freq: number): number {
    const binCount  = this.freqData.length
    const sampleRate = this.analyser.context.sampleRate
    return Math.min(binCount - 1, Math.round((freq * binCount * 2) / sampleRate))
  }

  // Average normalized energy (0-1) across a frequency band
  private bandEnergy(minHz: number, maxHz: number): number {
    const lo = this.freqToBin(minHz)
    const hi = this.freqToBin(maxHz)
    if (hi <= lo) return 0
    let sum = 0
    for (let i = lo; i <= hi; i++) sum += this.freqData[i] ?? 0
    return sum / ((hi - lo + 1) * 255)
  }

  setParticleCount(n: number): void {
    this.particleCount = Math.max(0, Math.min(3000, n))
    this.rebuildParticleGeo(this.particleCount)
  }

  set8DMode(enabled: boolean): void  { this._8DEnabled = enabled }
  set8DAngle(angle: number): void   { this._8DAngle = angle }

  setReactivity(v: number): void    { this.reactivity = Math.max(0, Math.min(1, v)) }
  setGlow(v: number): void          { this.glowMult = Math.max(0, Math.min(1.5, v)) }
  setStarBrightness(v: number): void { this.starUniforms.uBrightness.value = Math.max(0, Math.min(1, v)) }
  setBassPulse(v: boolean): void    { this.bassPulse = v }
  setRotationSpeed(v: number): void { this.rotationSpeed = Math.max(0, Math.min(3, v)) }
  setOrbSize(v: number): void       { this.orbBaseScale = Math.max(0.4, Math.min(1.8, v)) }
  setLightning(v: boolean): void    { this.lightningEnabled = v }
  setGlitch(v: boolean): void       { this.glitchEnabled = v }
  setCrack(v: boolean): void        { this.crackEnabled = v }
  setCrystal(v: boolean): void      { this.crystalEnabled = v }

  setWireframe(v: boolean): void {
    ;(this.mesh.material as ShaderMaterial).wireframe = v
  }

  // Change the color theme. 'prism' = fully audio-reactive hue cycling.
  // All other themes lock the hue to a specific color family.
  setColorTheme(theme: string): void {
    this.colorTheme = theme
    this.themeHueLock = theme === 'prism' ? -1 : 0
  }

  private initLightning(): void {
    this.lightningMat = new LineBasicMaterial({
      color:       0xffffff,
      transparent: true,
      opacity:     0.9,
      blending:    AdditiveBlending,
      depthWrite:  false,
    })
    this.lightningArcs = []
  }

  private spawnLightningArc(): void {
    const theta = Math.random() * Math.PI * 2
    const phi   = Math.acos(2 * Math.random() - 1)
    const dir   = new Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    )
    const points: Vector3[] = []
    let cur = dir.clone().multiplyScalar(1.05)
    points.push(cur.clone())
    const segs = 6 + Math.floor(Math.random() * 5)
    for (let i = 0; i < segs; i++) {
      const step   = dir.clone().multiplyScalar(0.16 + Math.random() * 0.14)
      const jitter = new Vector3(
        (Math.random() - 0.5) * 0.28,
        (Math.random() - 0.5) * 0.28,
        (Math.random() - 0.5) * 0.28,
      )
      cur = cur.clone().add(step).add(jitter)
      points.push(cur.clone())
    }
    const geo  = new BufferGeometry().setFromPoints(points)
    const mat  = this.lightningMat.clone() as LineBasicMaterial
    mat.color.copy(this.uniforms.uColorA.value).lerp(this.uniforms.uColorC.value, Math.random())
    const line = new Line(geo, mat)
    this.scene.add(line)
    this.lightningArcs.push({ mesh: line, life: 28, maxLife: 28 })
  }

  private updateLightning(kickVis: number, bassTransient: number): void {
    if ((kickVis > 0.25 || bassTransient > 0.06) && this.lightningArcs.length < 8) {
      const count = 1 + Math.floor(kickVis * 3)
      for (let i = 0; i < count; i++) this.spawnLightningArc()
    }
    for (let i = this.lightningArcs.length - 1; i >= 0; i--) {
      const arc = this.lightningArcs[i]
      arc.life--
      ;(arc.mesh.material as LineBasicMaterial).opacity = (arc.life / arc.maxLife) * 0.90
      if (arc.life <= 0) {
        this.scene.remove(arc.mesh)
        arc.mesh.geometry.dispose()
        ;(arc.mesh.material as LineBasicMaterial).dispose()
        this.lightningArcs.splice(i, 1)
      }
    }
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    for (const arc of this.lightningArcs) {
      this.scene.remove(arc.mesh)
      arc.mesh.geometry.dispose()
      ;(arc.mesh.material as LineBasicMaterial).dispose()
    }
    this.lightningArcs = []
    this.renderer.dispose()
  }
}
