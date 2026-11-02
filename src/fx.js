import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'
import { FX } from './config.js'
import { paintPuffAtlas, paintScorch } from './textures.js'

// All transient effects. Two instanced billboard pools (additive light: fire, sparks,
// embers; alpha: smoke, dust) simulated on the CPU, instanced debris with ground
// bounce, a small pool of point lights for flashes, shockwave rings and ground
// decals. Colours are ramps sampled over a particle's life, HDR above 1 so fire and
// sparks reach the bloom pass.

const VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec3 iVel;
  attribute vec4 iColor;
  attribute vec4 iData; // size, rotation, stretch, atlas cell
  varying vec2 vUv;
  varying vec2 vLocal;
  varying vec4 vColor;
  varying float vCell;
  varying float vRound;
  void main() {
    vec4 mv = viewMatrix * vec4(iPos, 1.0);
    vec2 q = position.xy;
    float size = iData.x;
    if (iData.z > 0.0) {
      vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
      float sp = length(vv.xy);
      vec2 dir = sp > 0.001 ? vv.xy / sp : vec2(0.0, 1.0);
      float len = size + sp * iData.z;
      mv.xy += dir * q.y * len + vec2(-dir.y, dir.x) * q.x * size;
      vRound = 1.0;
    } else {
      float c = cos(iData.y), s = sin(iData.y);
      mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y) * size;
      vRound = iData.w < 0.0 ? 1.0 : 0.0;
    }
    vLocal = q * 2.0;
    vUv = q + 0.5;
    vCell = iData.w;
    vColor = iColor;
    gl_Position = projectionMatrix * mv;
  }`

const FRAG = /* glsl */ `
  uniform sampler2D atlas;
  uniform float shaded;
  varying vec2 vUv;
  varying vec2 vLocal;
  varying vec4 vColor;
  varying float vCell;
  varying float vRound;
  void main() {
    float a;
    vec3 col = vColor.rgb;
    if (vRound > 0.5) {
      float r = length(vLocal);
      a = smoothstep(1.0, 0.1, r);
    } else {
      float cell = floor(vCell + 0.5);
      vec2 off = vec2(mod(cell, 2.0), floor(cell / 2.0)) * 0.5;
      vec4 t = texture2D(atlas, off + vUv * 0.5);
      a = t.a;
      // Fake volume: the lit top of a puff is paler, its underside darker.
      col *= mix(1.0, t.r * 1.1 * mix(0.72, 1.16, vUv.y), shaded);
    }
    a *= vColor.a;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }`

// Ramps: [t, r, g, b, a]. Values above 1 are HDR.
const RAMPS = {
  spark: [[0, 9, 7, 3.4, 1], [0.35, 7, 3.6, 0.9, 1], [1, 2.2, 0.3, 0.02, 0]],
  fire: [[0, 7, 6, 3.2, 0.9], [0.18, 6.4, 3.3, 0.7, 0.85], [0.5, 3.6, 0.95, 0.12, 0.55], [1, 0.5, 0.06, 0.02, 0]],
  ember: [[0, 6, 2.6, 0.5, 1], [0.7, 3.4, 0.8, 0.1, 0.9], [1, 0.9, 0.1, 0, 0]],
  smoke: [[0, 0.22, 0.2, 0.19, 0], [0.08, 0.2, 0.19, 0.18, 0.62], [0.55, 0.13, 0.12, 0.12, 0.42], [1, 0.3, 0.3, 0.31, 0]],
  blacksmoke: [[0, 0.09, 0.07, 0.06, 0], [0.1, 0.05, 0.04, 0.04, 0.8], [0.6, 0.06, 0.06, 0.06, 0.55], [1, 0.18, 0.18, 0.19, 0]],
  steam: [[0, 0.9, 0.92, 0.95, 0], [0.12, 0.85, 0.87, 0.9, 0.35], [1, 0.95, 0.96, 0.97, 0]],
  dust: [[0, 0.72, 0.68, 0.52, 0], [0.1, 0.68, 0.64, 0.5, 0.5], [1, 0.74, 0.72, 0.62, 0]],
  grass: [[0, 0.3, 0.62, 0.34, 0], [0.1, 0.34, 0.66, 0.36, 0.42], [1, 0.62, 0.74, 0.56, 0]],
  magic: [[0, 5, 2, 5, 1], [0.5, 3.5, 1, 4, 0.8], [1, 0.6, 0.2, 1.4, 0]],
  gold: [[0, 7, 5.6, 1.6, 1], [0.6, 4.4, 2.8, 0.4, 0.8], [1, 1.4, 0.5, 0, 0]],
  emerald: [[0, 2.2, 7, 2.4, 0.9], [0.5, 0.5, 3.2, 0.7, 0.6], [1, 0.05, 0.6, 0.1, 0]],
  flash: [[0, 12, 10, 7, 1], [0.4, 8, 5, 2, 0.7], [1, 2, 0.6, 0.1, 0]],
  electric: [[0, 9, 9, 4, 1], [0.4, 7, 5.6, 0.8, 0.9], [1, 2.4, 1, 0, 0]],
  violet: [[0, 7, 6, 9, 1], [0.4, 3.6, 1.2, 7, 0.8], [1, 0.8, 0.1, 2.2, 0]],
  crimson: [[0, 8, 3, 1.4, 0.9], [0.35, 6.4, 0.5, 0.2, 0.8], [1, 0.8, 0.02, 0.04, 0]],
  cyan: [[0, 2.5, 8, 9, 1], [0.5, 0.5, 3.6, 6, 0.7], [1, 0.05, 0.6, 1.6, 0]],
  mist: [[0, 4, 1.2, 6, 0.5], [1, 0.8, 0.1, 1.6, 0]],
  // Painted (alpha-blended) ramps: on the bright lawn additive light turns yellow-green,
  // these keep their hue. Values stay at or under 1.
  nelectric: [[0, 1, 1, 0.75, 1], [0.35, 1, 0.9, 0.15, 1], [1, 1, 0.55, 0, 0]],
  nember: [[0, 1, 0.8, 0.3, 1], [0.5, 1, 0.42, 0.04, 1], [1, 0.75, 0.1, 0, 0]],
  nfire: [[0, 1, 0.97, 0.6, 1], [0.3, 1, 0.68, 0.06, 1], [0.7, 1, 0.3, 0, 0.8], [1, 0.3, 0.06, 0, 0]],
  ncrimson: [[0, 1, 0.6, 0.3, 1], [0.3, 1, 0.1, 0.08, 1], [0.7, 0.7, 0, 0.04, 0.8], [1, 0.12, 0, 0.02, 0]],
  nviolet: [[0, 0.98, 0.9, 1, 1], [0.3, 0.8, 0.35, 1, 1], [0.7, 0.5, 0.08, 0.95, 0.8], [1, 0.14, 0, 0.35, 0]],
  nmist: [[0, 0.85, 0.3, 1, 0.8], [1, 0.45, 0.05, 0.8, 0]],
  ngreen: [[0, 0.8, 1, 0.75, 1], [0.5, 0.25, 1, 0.3, 1], [1, 0, 0.5, 0.2, 0]],
  ncyan: [[0, 0.8, 1, 1, 1], [0.5, 0.15, 0.8, 1, 1], [1, 0, 0.25, 0.8, 0]],
  npink: [[0, 1, 0.8, 0.95, 1], [0.5, 1, 0.2, 0.7, 1], [1, 0.5, 0, 0.5, 0]],
}
const RAMP_SIZE = 32
const rampIndex = {}
const rampData = new Float32Array(Object.keys(RAMPS).length * RAMP_SIZE * 4)
Object.keys(RAMPS).forEach((name, r) => {
  rampIndex[name] = r
  const keys = RAMPS[name]
  for (let i = 0; i < RAMP_SIZE; i++) {
    const t = i / (RAMP_SIZE - 1)
    let k = 0
    while (k < keys.length - 2 && keys[k + 1][0] < t) k++
    const a = keys[k]
    const b = keys[k + 1]
    const f = (t - a[0]) / (b[0] - a[0] || 1)
    for (let c = 0; c < 4; c++) rampData[(r * RAMP_SIZE + i) * 4 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * Math.min(1, Math.max(0, f))
  }
})

class Pool {
  constructor(scene, capacity, atlas, blending, shaded) {
    this.cap = capacity
    this.head = 0
    const n = capacity
    this.life = new Float32Array(n)
    this.maxLife = new Float32Array(n)
    this.px = new Float32Array(n * 3)
    this.vx = new Float32Array(n * 3)
    this.sizeA = new Float32Array(n)
    this.sizeB = new Float32Array(n)
    this.rot = new Float32Array(n)
    this.spin = new Float32Array(n)
    this.drag = new Float32Array(n)
    this.grav = new Float32Array(n)
    this.ramp = new Uint8Array(n)
    this.stretch = new Float32Array(n)
    this.bounce = new Float32Array(n)
    this.cell = new Float32Array(n)
    this.alpha = new Float32Array(n)

    const g = new InstancedBufferGeometry()
    const quad = new PlaneGeometry(1, 1)
    g.setAttribute('position', quad.attributes.position)
    g.setIndex(quad.index)
    const attr = (name, size) => {
      const a = new InstancedBufferAttribute(new Float32Array(n * size), size)
      a.setUsage(DynamicDrawUsage)
      g.setAttribute(name, a)
      return a
    }
    this.aPos = attr('iPos', 3)
    this.aVel = attr('iVel', 3)
    this.aColor = attr('iColor', 4)
    this.aData = attr('iData', 4)
    g.instanceCount = 0
    this.geometry = g
    this.mesh = new Mesh(
      g,
      new ShaderMaterial({
        uniforms: { atlas: { value: atlas }, shaded: { value: shaded } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending,
      }),
    )
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 5
    scene.add(this.mesh)
  }

  emit(o) {
    const i = this.head
    this.head = (i + 1) % this.cap
    const life = o.life ?? 1
    this.life[i] = life
    this.maxLife[i] = life
    this.px[i * 3] = o.x
    this.px[i * 3 + 1] = o.y
    this.px[i * 3 + 2] = o.z
    this.vx[i * 3] = o.vx ?? 0
    this.vx[i * 3 + 1] = o.vy ?? 0
    this.vx[i * 3 + 2] = o.vz ?? 0
    this.sizeA[i] = o.size ?? 1
    this.sizeB[i] = o.size2 ?? o.size ?? 1
    this.rot[i] = o.rot ?? Math.random() * 6.28
    this.spin[i] = o.spin ?? 0
    this.drag[i] = o.drag ?? 0
    this.grav[i] = o.grav ?? 0
    this.ramp[i] = rampIndex[o.ramp ?? 'spark']
    this.stretch[i] = o.stretch ?? 0
    this.bounce[i] = o.bounce ?? 0
    this.cell[i] = o.round ? -1 : Math.floor(Math.random() * 4)
    this.alpha[i] = o.alpha ?? 1
  }

  update(dt) {
    let w = 0
    const P = this.aPos.array
    const V = this.aVel.array
    const C = this.aColor.array
    const D = this.aData.array
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue
      this.life[i] -= dt
      if (this.life[i] <= 0) continue
      const a = i * 3
      const k = Math.exp(-this.drag[i] * dt)
      this.vx[a] *= k
      this.vx[a + 1] = this.vx[a + 1] * k + this.grav[i] * dt
      this.vx[a + 2] *= k
      this.px[a] += this.vx[a] * dt
      this.px[a + 1] += this.vx[a + 1] * dt
      this.px[a + 2] += this.vx[a + 2] * dt
      if (this.bounce[i] > 0 && this.px[a + 1] < 0.03) {
        this.px[a + 1] = 0.03
        this.vx[a + 1] = -this.vx[a + 1] * this.bounce[i]
        this.vx[a] *= 0.7
        this.vx[a + 2] *= 0.7
      }
      this.rot[i] += this.spin[i] * dt
      const t = 1 - this.life[i] / this.maxLife[i]
      const u = Math.min(RAMP_SIZE - 1, Math.floor(t * RAMP_SIZE))
      const r = (this.ramp[i] * RAMP_SIZE + u) * 4
      P[w * 3] = this.px[a]
      P[w * 3 + 1] = this.px[a + 1]
      P[w * 3 + 2] = this.px[a + 2]
      V[w * 3] = this.vx[a]
      V[w * 3 + 1] = this.vx[a + 1]
      V[w * 3 + 2] = this.vx[a + 2]
      C[w * 4] = rampData[r]
      C[w * 4 + 1] = rampData[r + 1]
      C[w * 4 + 2] = rampData[r + 2]
      C[w * 4 + 3] = rampData[r + 3] * this.alpha[i]
      D[w * 4] = this.sizeA[i] + (this.sizeB[i] - this.sizeA[i]) * Math.sqrt(t)
      D[w * 4 + 1] = this.rot[i]
      D[w * 4 + 2] = this.stretch[i]
      D[w * 4 + 3] = this.cell[i]
      w++
    }
    this.geometry.instanceCount = w
    if (w) {
      this.aPos.needsUpdate = this.aVel.needsUpdate = this.aColor.needsUpdate = this.aData.needsUpdate = true
    }
  }
}

const rnd = (a, b) => a + Math.random() * (b - a)
const m4 = new Matrix4()
const v3 = new Vector3()
const q5 = new Quaternion()
const s3 = new Vector3()
const axis = new Vector3()
const col = new Color()

export function createFx(scene, preset) {
  const quality = preset.particles ?? 1
  let spawnScale = quality
  const atlasTex = new CanvasTexture(paintPuffAtlas(256))
  const light = new Pool(scene, Math.floor(FX.additive * Math.min(1.2, Math.max(0.5, quality))), atlasTex, AdditiveBlending, 0)
  const smoke = new Pool(scene, Math.floor(FX.smoke * Math.min(1.2, Math.max(0.5, quality))), atlasTex, NormalBlending, 1)
  const count = (n) => Math.max(1, Math.round(n * spawnScale))

  // --- Debris --------------------------------------------------------------------------
  const makeDebris = (geo, capacity, matOpts) => {
    const mesh = new InstancedMesh(geo, new MeshStandardMaterial(matOpts), capacity)
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.castShadow = true
    mesh.frustumCulled = false
    m4.makeScale(0, 0, 0)
    for (let i = 0; i < capacity; i++) {
      mesh.setMatrixAt(i, m4)
      mesh.setColorAt(i, col.set('#ffffff'))
    }
    scene.add(mesh)
    const items = Array.from({ length: capacity }, () => ({ life: 0, p: new Vector3(), v: new Vector3(), q: new Quaternion(), w: new Vector3(), s: new Vector3(1, 1, 1), bounces: 0 }))
    return { mesh, items, head: 0, capacity }
  }
  const shards = makeDebris(new BoxGeometry(1, 1, 1), FX.debris, { roughness: 0.45, metalness: 0.6 })
  const wheels = makeDebris(new CylinderGeometry(0.42, 0.42, 0.32, 12).rotateX(Math.PI / 2), FX.wheels, { roughness: 0.9, metalness: 0.1 })
  const onLand = { fn: null }

  const throwPiece = (set, p, v, color, sx, sy, sz, life) => {
    const i = set.head
    set.head = (i + 1) % set.capacity
    const d = set.items[i]
    d.life = life
    d.total = life
    d.p.copy(p)
    d.v.copy(v)
    d.q.setFromAxisAngle(axis.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(), rnd(0, 6))
    d.w.set(rnd(-14, 14), rnd(-14, 14), rnd(-14, 14))
    d.s.set(sx, sy, sz)
    d.bounces = 0
    set.mesh.setColorAt(i, col.set(color))
    set.mesh.instanceColor.needsUpdate = true
  }
  const stepDebris = (set, dt) => {
    let any = false
    for (let i = 0; i < set.capacity; i++) {
      const d = set.items[i]
      if (d.life <= 0) continue
      any = true
      d.life -= dt
      if (d.life <= 0) {
        m4.makeScale(0, 0, 0)
        set.mesh.setMatrixAt(i, m4)
        continue
      }
      d.v.y -= 24 * dt
      d.p.addScaledVector(d.v, dt)
      const hx = Math.max(d.s.x, d.s.z) * 0.4
      if (d.p.y < hx) {
        d.p.y = hx
        if (d.v.y < -3 && d.bounces < 3) {
          d.bounces++
          onLand.fn?.(d.p, -d.v.y)
        }
        d.v.y *= -0.34
        d.v.x *= 0.62
        d.v.z *= 0.62
        d.w.multiplyScalar(0.5)
        if (Math.abs(d.v.y) < 1) {
          d.v.y = 0
          d.w.multiplyScalar(0.7)
        }
      }
      const wl = d.w.length()
      if (wl > 0.01) {
        q5.setFromAxisAngle(axis.copy(d.w).divideScalar(wl), wl * dt)
        d.q.premultiply(q5)
      }
      const fade = Math.min(1, d.life / 0.5)
      m4.compose(d.p, d.q, s3.copy(d.s).multiplyScalar(fade))
      set.mesh.setMatrixAt(i, m4)
    }
    if (any) set.mesh.instanceMatrix.needsUpdate = true
  }

  // --- Flash lights -----------------------------------------------------------------------
  const lights = []
  for (let i = 0; i < FX.lights; i++) {
    const l = new PointLight('#ffb36a', 0, 70, 1.7)
    l.position.set(0, -50, 0)
    scene.add(l)
    lights.push({ l, power: 0, decay: 1, flicker: 0, hold: 0 })
  }

  // --- Rings -----------------------------------------------------------------------------
  const rings = []
  const ringGeo = new RingGeometry(0.965, 1, 72)
  ringGeo.rotateX(-Math.PI / 2)
  for (let i = 0; i < 6; i++) {
    const m = new Mesh(ringGeo, new MeshBasicMaterial({ color: '#fff0d0', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }))
    m.visible = false
    scene.add(m)
    rings.push({ m, t: 0, dur: 1, r: 1 })
  }

  // --- Decals -----------------------------------------------------------------------------
  const scorchTex = new CanvasTexture(paintScorch())
  const decalGeo = new PlaneGeometry(1, 1)
  decalGeo.rotateX(-Math.PI / 2)
  const decals = Array.from({ length: FX.decals }, () => {
    const m = new Mesh(decalGeo, new MeshBasicMaterial({ map: scorchTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }))
    m.visible = false
    scene.add(m)
    return { m, fading: false, a: 1 }
  })
  let decalHead = 0

  // --- Emitters (burning wrecks, flame auras, exhausts) -------------------------------------
  const emitters = []

  const fx = {
    light,
    smoke,
    setQuality(q) {
      spawnScale = q
    },
    onDebrisLand(fn) {
      onLand.fn = fn
    },
    sparks(x, y, z, n, speed = 14, dx = 0, dy = 0.4, dz = 0, ramp = 'spark') {
      for (let i = 0, c = count(n); i < c; i++) {
        const s = speed * rnd(0.25, 1.2)
        light.emit({
          x, y, z,
          vx: (dx + rnd(-1, 1)) * s,
          vy: (dy + rnd(-0.3, 1)) * s,
          vz: (dz + rnd(-1, 1)) * s,
          life: rnd(0.3, 1.15),
          size: rnd(0.04, 0.1),
          size2: 0.015,
          grav: -19,
          drag: 0.7,
          stretch: 0.028,
          bounce: 0.45,
          ramp,
          round: true,
        })
      }
    },
    fireball(x, y, z, radius = 3, n = 26) {
      for (let i = 0, c = count(n); i < c; i++) {
        const a = rnd(0, 6.28)
        const e = rnd(-0.3, 1)
        const s = radius * rnd(0.5, 2.1)
        light.emit({
          x: x + Math.cos(a) * radius * 0.25,
          y: y + rnd(-0.3, 0.6),
          z: z + Math.sin(a) * radius * 0.25,
          vx: Math.cos(a) * s * (1 - Math.abs(e)),
          vy: Math.abs(e) * s + rnd(0.5, 3),
          vz: Math.sin(a) * s * (1 - Math.abs(e)),
          life: rnd(0.55, 1.25),
          size: radius * rnd(0.7, 1.1),
          size2: radius * rnd(1.5, 2.3),
          spin: rnd(-1.2, 1.2),
          drag: 2.4,
          grav: 2.5,
          ramp: 'fire',
        })
      }
      light.emit({ x, y: y + 0.4, z, life: 0.2, size: radius * 3.4, size2: radius * 6, ramp: 'flash', round: true })
    },
    smokeBurst(x, y, z, n = 14, size = 3, kind = 'blacksmoke') {
      for (let i = 0, c = count(n); i < c; i++) {
        smoke.emit({
          x: x + rnd(-1, 1) * size * 0.5,
          y: y + rnd(0, 1) * size * 0.4,
          z: z + rnd(-1, 1) * size * 0.5,
          vx: rnd(-2, 2),
          vy: rnd(1.4, 5),
          vz: rnd(-2, 2),
          life: rnd(2, 4.6),
          size: size * rnd(0.6, 1),
          size2: size * rnd(2.2, 3.6),
          spin: rnd(-0.5, 0.5),
          drag: 0.8,
          grav: 0.8,
          ramp: kind,
        })
      }
    },
    dustRing(x, z, radius = 3, n = 26, kind = 'grass') {
      for (let i = 0, c = count(n); i < c; i++) {
        const a = rnd(0, 6.28)
        const s = radius * rnd(1.2, 3.4)
        smoke.emit({
          x: x + Math.cos(a) * radius * 0.4,
          y: rnd(0.1, 0.5),
          z: z + Math.sin(a) * radius * 0.4,
          vx: Math.cos(a) * s,
          vy: rnd(0.4, 2.2),
          vz: Math.sin(a) * s,
          life: rnd(0.7, 1.7),
          size: radius * rnd(0.3, 0.55),
          size2: radius * rnd(0.9, 1.5),
          spin: rnd(-0.8, 0.8),
          drag: 3.2,
          grav: 0.3,
          ramp: kind,
        })
      }
    },
    glass(x, y, z, n = 18, dx = 0, dz = 0) {
      for (let i = 0, c = count(n); i < c; i++) {
        v3.set((dx + rnd(-1, 1)) * rnd(3, 11), rnd(1, 10), (dz + rnd(-1, 1)) * rnd(3, 11))
        const s = rnd(0.05, 0.16)
        throwPiece(shards, new Vector3(x, y, z), v3, '#bfe9ff', s, s * 0.3, s, rnd(0.9, 1.9))
        if (i % 2) {
          light.emit({ x, y, z, vx: v3.x, vy: v3.y, vz: v3.z, life: rnd(0.2, 0.55), size: 0.18, size2: 0.05, grav: -18, drag: 0.5, ramp: 'gold', round: true })
        }
      }
    },
    debris(x, y, z, n, color, speed = 12, dx = 0, dz = 0, size = 0.5) {
      for (let i = 0, c = count(n); i < c; i++) {
        v3.set((dx + rnd(-1, 1)) * speed * rnd(0.3, 1), rnd(2, speed * 1.1), (dz + rnd(-1, 1)) * speed * rnd(0.3, 1))
        const s = size * rnd(0.3, 1.2)
        throwPiece(shards, new Vector3(x + rnd(-0.6, 0.6), y + rnd(-0.3, 0.5), z + rnd(-0.6, 0.6)), v3, Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color, s * rnd(0.7, 1.6), s * rnd(0.12, 0.5), s * rnd(0.5, 1.2), rnd(2.5, 5))
      }
    },
    wheel(x, y, z, vx, vy, vz) {
      throwPiece(wheels, new Vector3(x, y, z), v3.set(vx, vy, vz), '#1a1a1e', 1, 1, 1, rnd(4, 6.5))
    },
    flash(x, y, z, power = 400, decay = 3, color = '#ffb36a') {
      let best = lights[0]
      for (const e of lights) if (e.power < best.power) best = e
      best.l.position.set(x, y, z)
      best.l.color.set(color)
      best.power = power
      best.decay = decay
      best.flicker = 0
    },
    shockwave(x, y, z, radius = 22, dur = 0.45, color = '#ffe6bd') {
      const r = rings.find((e) => !e.m.visible) ?? rings[0]
      r.m.position.set(x, y, z)
      r.m.material.color.set(color)
      r.m.visible = true
      r.t = 0
      r.dur = dur
      r.r = radius
    },
    scorch(x, z, size = 8, yaw = 0, stretch = 1, opacity = 0.9) {
      const d = decals[decalHead]
      decalHead = (decalHead + 1) % decals.length
      d.m.position.set(x, 0.035 + decalHead * 0.0006, z)
      d.m.scale.set(size * stretch, 1, size)
      d.m.rotation.y = yaw
      d.m.material.opacity = opacity
      d.a = opacity
      d.m.visible = true
      d.fading = false
    },
    fadeDecals() {
      for (const d of decals) d.fading = true
    },
    // A sustained source. o: { rate (per s), tick(scratchVector, count) -> false to stop, duration }
    addEmitter(o) {
      const e = { acc: 0, age: 0, duration: Infinity, ...o }
      emitters.push(e)
      return e
    },
    removeEmitter(e) {
      const i = emitters.indexOf(e)
      if (i >= 0) emitters.splice(i, 1)
    },
    flame(p, size, kind = 'fire', vy = 3.4, alpha = 1) {
      light.emit({
        x: p.x + rnd(-size, size) * 0.5,
        y: p.y + rnd(-0.2, 0.2),
        z: p.z + rnd(-size, size) * 0.5,
        vx: rnd(-0.6, 0.6),
        vy: vy * rnd(0.7, 1.4),
        vz: rnd(-0.6, 0.6),
        life: rnd(0.35, 0.8),
        size: size * rnd(0.7, 1.2),
        size2: size * 0.34,
        spin: rnd(-1, 1),
        drag: 1.2,
        grav: 3,
        ramp: kind,
        alpha,
      })
    },
    puff(p, size, kind = 'smoke', vy = 2.4, life = 2.6, alpha = 1, vx = 0, vz = 0) {
      smoke.emit({
        x: p.x + rnd(-0.2, 0.2),
        y: p.y,
        z: p.z + rnd(-0.2, 0.2),
        vx: vx + rnd(-0.6, 0.6),
        vy: vy * rnd(0.7, 1.3),
        vz: vz + rnd(-0.6, 0.6),
        life: life * rnd(0.7, 1.3),
        size: size * rnd(0.7, 1.1),
        size2: size * rnd(2.6, 3.8),
        spin: rnd(-0.5, 0.5),
        drag: 0.6,
        grav: 0.5,
        ramp: kind,
        alpha,
      })
    },
    sparkle(p, kind, spread = 1.5) {
      light.emit({
        x: p.x + rnd(-spread, spread),
        y: p.y + rnd(-spread, spread) * 0.6,
        z: p.z + rnd(-spread, spread),
        vx: rnd(-1, 1),
        vy: rnd(-0.5, 1.6),
        vz: rnd(-1, 1),
        life: rnd(0.4, 1),
        size: rnd(0.12, 0.3),
        size2: 0.02,
        ramp: kind,
        round: true,
      })
    },
    update(dt) {
      for (let i = emitters.length - 1; i >= 0; i--) {
        const e = emitters[i]
        e.age += dt
        if (e.age > e.duration) {
          emitters.splice(i, 1)
          continue
        }
        e.acc += e.rate * dt * spawnScale
        const n = Math.floor(e.acc)
        e.acc -= n
        if (n > 0 && e.tick(v3, n) === false) emitters.splice(i, 1)
      }
      light.update(dt)
      smoke.update(dt)
      stepDebris(shards, dt)
      stepDebris(wheels, dt)
      for (const e of lights) {
        if (e.power <= 0.5) {
          if (e.l.intensity !== 0) e.l.intensity = 0
          continue
        }
        e.power *= Math.exp(-e.decay * dt)
        e.l.intensity = e.power
      }
      for (const r of rings) {
        if (!r.m.visible) continue
        r.t += dt
        const t = r.t / r.dur
        if (t >= 1) {
          r.m.visible = false
          continue
        }
        const k = 1 - (1 - t) ** 3
        r.m.scale.setScalar(Math.max(0.01, r.r * k))
        r.m.material.opacity = (1 - t) ** 2 * 0.55
      }
      for (const d of decals) {
        if (!d.fading || !d.m.visible) continue
        d.m.material.opacity -= dt * 0.25
        if (d.m.material.opacity <= 0) d.m.visible = false
      }
    },
  }
  return fx
}
