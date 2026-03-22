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

import * as THREE from 'three'
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

varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vDisp;

void main() {
  // Warp time so slow playback feels more languid and dreamy
  float t = uTime * (0.4 + uSpeed * 0.6);
  // Subtle slowAmp so the shape stays orb-like even at 0.25x speed
  float slowAmp = 1.0 + (1.0 - uSpeed) * 0.18;

  // Keep each layer's amplitude small enough that the sphere always reads as
  // a sphere. Bass gets the biggest bumps but they stay under 20% of radius.
  float d1   = snoise(normal * 1.4 + t * 0.22) * uBass   * 0.20 * slowAmp;
  float d2   = snoise(normal * 3.6 + t * 0.50) * uMid    * 0.10;
  float d4   = snoise(normal * 5.8 + t * 0.38) * uMid    * 0.06;
  float d3   = snoise(normal * 9.2 + t * 1.05) * uTreble * 0.04;
  float idle = snoise(normal * 1.9 + t * 0.16) * 0.028;

  // Hard clamp: total displacement never exceeds 26% of sphere radius.
  // This is the safety net — no matter how loud the track gets, the orb
  // stays recognisably round.
  float disp = clamp(d1 + d2 + d3 + d4 + idle, -0.26, 0.26);
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
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uTime;
uniform float uReverb;  // 0-1 — higher = more iridescent / glowy wash
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
  float r = aRadius + uBass * 0.35;
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
    tDiffuse:  { value: null as THREE.Texture | null },
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
      float ca     = (0.0018 + uBass * 0.008) * dist;
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
const BASS_LERP_UP   = 0.18   // fast attack — orb snaps to the beat immediately
const BASS_LERP_DOWN = 0.025  // slow decay  — energy lingers after the hit
const MID_LERP       = 0.040
const TREBLE_LERP    = 0.060

export class AnomalySphere {
  private renderer:  THREE.WebGLRenderer
  private scene:     THREE.Scene
  private camera:    THREE.PerspectiveCamera
  private mesh:      THREE.Mesh
  private composer:  EffectComposer
  private bloom:     UnrealBloomPass
  private grainPass: ShaderPass
  private clock:     THREE.Clock

  private analyser: AnalyserNode
  private freqData: Uint8Array<ArrayBuffer>

  // Smoothed energy values (all start at 0, decay on stop)
  private bass   = 0
  private mid    = 0
  private treble = 0
  private hueOffset  = 0    // rotating palette hue, advanced each frame by beat energy
  private reverb     = 0.2  // current reverb mix (0-1), set via setReverb()
  private speed      = 1.0  // current playback rate (0.25-1), set via setSpeed()
  private reactivity    = 0.8
  private glowMult      = 1.0
  private colorTheme    = 'prism'
  private themeHueLock  = -1
  private bassPulse     = true
  private rotationSpeed = 1.0
  private orbBaseScale  = 1.0
  private _8DEnabled    = false
  private _8DAngle      = 0    // current panner angle in radians, set by AudioEngine callback
  private particleCount = 500
  private prevBass      = 0   // previous frame bass — used for transient detection
  private _loopPulseAmount = 0  // decays each frame; set to 1 on each loop cycle

  // Visual fade for smooth pause/play transitions
  private visualFade = 0.4   // current rendered brightness (0-1)
  private targetFade = 0.4   // lerp target — 1.0 playing, 0.4 paused

  // Star field
  private stars!: THREE.Points
  private starUniforms!: {
    uTime:       THREE.IUniform<number>
    uTreble:     THREE.IUniform<number>
    uBrightness: THREE.IUniform<number>
  }

  // Sphere uniforms typed for direct access
  private uniforms: {
    uTime:   THREE.IUniform<number>
    uBass:   THREE.IUniform<number>
    uMid:    THREE.IUniform<number>
    uTreble: THREE.IUniform<number>
    uReverb: THREE.IUniform<number>
    uSpeed:  THREE.IUniform<number>
    uColorA: THREE.IUniform<THREE.Color>
    uColorB: THREE.IUniform<THREE.Color>
    uColorC: THREE.IUniform<THREE.Color>
    uColorD: THREE.IUniform<THREE.Color>
  }

  // Particle cloud around the orb
  private particles!: THREE.Points
  private particleUniforms!: {
    uBass:          THREE.IUniform<number>
    uTreble:        THREE.IUniform<number>
    uTime:          THREE.IUniform<number>
    uParticleColor: THREE.IUniform<THREE.Color>
  }

  private container: HTMLElement  // stored so resize() doesn't need parentElement
  private rafId:   number | null = null
  private playing  = false

  // Called each frame with smoothed bass/mid/treble (0-1), same contract
  // as SpectrumAnalyzer.onEnergyUpdate so the aurora still reacts.
  public onEnergyUpdate: ((bass: number, mid: number, treble: number) => void) | null = null

  constructor(container: HTMLElement, analyser: AnalyserNode) {
    this.analyser  = analyser
    this.freqData  = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
    this.clock     = new THREE.Clock()
    this.container = container

    // ── Renderer ────────────────────────────────────────────────────────────
    // Match the page background exactly so removing the CSS box makes the
    // renderer area seamless — the orb appears to float over the page.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3))
    this.renderer.setClearColor(new THREE.Color('#080810'), 1)
    // ACESFilmic gracefully compresses HDR bloom values instead of clipping to white
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.50

    // Size to something non-zero right away so the composer doesn't start at 1x1
    this.renderer.setSize(300, 300, false)

    const canvas = this.renderer.domElement
    canvas.style.display  = 'block'
    canvas.style.position = 'absolute'
    canvas.style.inset    = '0'
    canvas.style.width    = '100%'
    canvas.style.height   = '100%'
    container.appendChild(canvas)

    // ── Scene + camera ───────────────────────────────────────────────────────
    this.scene  = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
    this.camera.position.z = 4.2

    // ── Sphere geometry + material ───────────────────────────────────────────
    // Detail level 6 → ~10k vertices for smooth high-frequency displacement
    const geo = new THREE.IcosahedronGeometry(1, 6)

    this.uniforms = {
      uTime:   { value: 0 },
      uBass:   { value: 0 },
      uMid:    { value: 0 },
      uTreble: { value: 0 },
      uReverb: { value: this.reverb },
      uSpeed:  { value: this.speed },
      uColorA: { value: new THREE.Color('#9b6dff') },
      uColorB: { value: new THREE.Color('#00d4aa') },
      uColorC: { value: new THREE.Color('#ff6eb4') },
      uColorD: { value: new THREE.Color('#ffaa44') },
    }

    const mat = new THREE.ShaderMaterial({
      uniforms:       this.uniforms,
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent:    true,
      side:           THREE.FrontSide,
    })

    mat.wireframe = true   // default on
    this.mesh = new THREE.Mesh(geo, mat)
    this.scene.add(this.mesh)

    // ── Particle cloud + star field ──────────────────────────────────────────
    this.initParticles()
    this.initStars()

    // ── Post-processing ─────────────────────────────────────────────────────
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(300, 300),
      0.45,  // base strength — dimmer; reverb raises this at runtime
      0.38,
      0.22,
    )
    this.composer.addPass(this.bloom)

    this.grainPass = new ShaderPass(GRAIN_CA_SHADER)
    this.composer.addPass(this.grainPass)

    this.composer.addPass(new OutputPass())

    // ── Start loop + defer first resize ─────────────────────────────────────
    window.addEventListener('resize', () => this.resize())
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
      uParticleColor: { value: new THREE.Color('#b08aff') },
    }

    const mat = new THREE.ShaderMaterial({
      uniforms:       this.particleUniforms,
      vertexShader:   PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    })

    this.particles = new THREE.Points(new THREE.BufferGeometry(), mat)
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
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1))
    geo.setAttribute('aPhase',   new THREE.BufferAttribute(phases, 1))
    geo.setAttribute('aRadius',  new THREE.BufferAttribute(radii, 1))
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

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aPhase',   new THREE.BufferAttribute(phases, 1))
    geo.setAttribute('aSpeed',   new THREE.BufferAttribute(speeds, 1))
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes,  1))

    this.starUniforms = {
      uTime:       { value: 0 },
      uTreble:     { value: 0 },
      uBrightness: { value: 0.9 },
    }

    const mat = new THREE.ShaderMaterial({
      uniforms:       this.starUniforms,
      vertexShader:   STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    })

    this.stars = new THREE.Points(geo, mat)
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
    this.onEnergyUpdate?.(0, 0, 0)
  }

  // Called from App.ts whenever the reverb mix slider changes (0-1)
  setReverb(v: number): void { this.reverb = v }

  // Called from App.ts whenever the speed slider changes (0.25-1.0)
  setSpeed(v: number): void { this.speed = v }

  private loop(): void {
    this.rafId = requestAnimationFrame(() => this.loop())

    const elapsed = this.clock.getElapsedTime()

    // Read audio data only while playing
    if (this.playing) {
      this.analyser.getByteFrequencyData(this.freqData)

      // Heavy damping: values creep toward the target slowly
      const rawBass   = this.bandEnergy(20,   250)
      const rawMid    = this.bandEnergy(250,  4000)
      const rawTreble = this.bandEnergy(4000, 20000)

      const bassLerp = rawBass > this.bass ? BASS_LERP_UP : BASS_LERP_DOWN
      this.bass   += (rawBass - this.bass) * bassLerp
      this.mid    += (rawMid    - this.mid)    * MID_LERP
      this.treble += (rawTreble - this.treble) * TREBLE_LERP

      this.onEnergyUpdate?.(this.bass, this.mid, this.treble)
    } else {
      // Decay toward zero so the sphere calms down after stopping
      this.bass   *= 0.96
      this.mid    *= 0.96
      this.treble *= 0.96
    }

    // ── Reactivity scaling ───────────────────────────────────────────────────
    // bVis/mVis/tVis are the "visual" energy values — scaled by reactivity so
    // the user can dial back how much the orb responds without muting the audio.
    const bVis = this.bass   * this.reactivity
    const mVis = this.mid    * this.reactivity
    const tVis = this.treble * this.reactivity

    // ── Spectral color mapping ───────────────────────────────────────────────
    const bN = Math.min(bVis, 1)
    const mN = Math.min(mVis, 1)
    const tN = Math.min(tVis, 1)
    const energy = Math.min((bN + mN + tN) / 1.5, 1)

    if (this.themeHueLock < 0) {
      // Prism mode: hue drifts constantly + jumps on bass transients so the
      // palette visibly cycles with the music rather than sitting on one hue.

      // 1) Constant slow drift — full rainbow every ~55 s at 60 fps
      this.hueOffset = (this.hueOffset + 0.0003) % 1

      // 2) Bass transient → forward hue jump on every kick/hit
      const bassTransient = Math.max(0, this.bass - this.prevBass)
      if (bassTransient > 0.04) {
        this.hueOffset = (this.hueOffset + bassTransient * 0.55) % 1
      }

      // 3) Mid energy pushes hue more gently
      this.hueOffset = (this.hueOffset + mN * 0.0006) % 1
    } else {
      // Locked theme: oscillate around the lock hue driven by the music so
      // the orb still reacts, but stays in the right colour family.
      const target = (this.themeHueLock + bN * 0.08 - tN * 0.06 + 1) % 1
      const diff   = target - this.hueOffset
      const short  = diff - Math.round(diff)
      this.hueOffset = ((this.hueOffset + short * 0.08) + 1) % 1
    }

    this.prevBass = this.bass

    // The 4 palette colours are ALWAYS 90° apart so mixing in the shader
    // produces clearly different colours rather than a single-hue blend.
    // Energy slightly widens the spread and boosts saturation/lightness.
    const isMono = this.colorTheme === 'mono'
    const sat    = isMono ? 0.04 : 0.78 + energy * 0.18
    const light  = 0.40 + energy * 0.14
    const nudge  = energy * 0.04   // tiny spread nudge at loud passages

    this.uniforms.uColorA.value.setHSL( this.hueOffset,                      sat,        light)
    this.uniforms.uColorB.value.setHSL((this.hueOffset + 0.25 + nudge) % 1,  sat,        light + 0.06)
    this.uniforms.uColorC.value.setHSL((this.hueOffset + 0.55 + nudge) % 1,  sat + 0.06, light + 0.12)
    this.uniforms.uColorD.value.setHSL((this.hueOffset + 0.78 - nudge) % 1,  sat,        light - 0.04)

    // Update sphere uniforms — use visual (reactivity-scaled) values
    this.uniforms.uTime.value   = elapsed
    this.uniforms.uBass.value   = bVis
    this.uniforms.uMid.value    = mVis
    this.uniforms.uTreble.value = tVis
    this.uniforms.uReverb.value = this.reverb
    this.uniforms.uSpeed.value  = this.speed

    // Smooth fade for pause/play — slow lerp for an organic, weighty feel
    this.visualFade += (this.targetFade - this.visualFade) * 0.028
    this.renderer.toneMappingExposure = 0.50 * this.visualFade

    // Bloom spikes on bass hits; capped and scaled by glow multiplier + fade
    this.bloom.strength = Math.min(0.20 + this.reverb * 0.28 + bVis * 0.32, 0.62) * this.glowMult * this.visualFade

    // Mesh scale: base size + optional bass pulse + loop cycle pulse (additive, independent)
    const pulseFactor = this.bassPulse ? bVis * 0.14 : 0
    this._loopPulseAmount *= 0.985   // ~1.5 s decay at 60 fps
    const loopPulseFactor  = this._loopPulseAmount * 0.08
    this.mesh.scale.setScalar(this.orbBaseScale * (1.0 + pulseFactor + loopPulseFactor))

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
      this.mesh.rotation.y += (0.0018 + bVis * 0.006) * rotScale
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

    // Update film grain / CA pass uniforms
    this.grainPass.uniforms['uTime'].value = elapsed
    this.grainPass.uniforms['uBass'].value = bVis

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

  setWireframe(v: boolean): void {
    ;(this.mesh.material as THREE.ShaderMaterial).wireframe = v
  }

  // Change the color theme. 'prism' = fully audio-reactive hue cycling.
  // All other themes lock the hue to a specific color family.
  setColorTheme(theme: string): void {
    this.colorTheme = theme
    const hueMap: Record<string, number> = {
      void:  0.72,   // deep violet-indigo
      neon:  0.50,   // cyan-blue
      ember: 0.05,   // red-orange
      frost: 0.62,   // ice blue
      mono:  0.0,    // hue irrelevant — saturation is collapsed in loop
    }
    this.themeHueLock = theme === 'prism' ? -1 : (hueMap[theme] ?? -1)
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.renderer.dispose()
  }
}
