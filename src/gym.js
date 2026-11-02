import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GYM, SET } from './config.js'
import { player, resetPlayer } from './player.js'
import { syncYawToPlayer } from './camera.js'
import { addPower, buyShop, compact, owns, powerBoost, shopPrice, state as progress } from './progress.js'
import { fontReady, paintRainbow, solidBox } from './propkit.js'
import { drawBicep } from './yard.js'

// The gym in the east: eight benches in black bays, hold-E to lie down, then reps that
// pour Strength in until STOP TRAINING. Every frame, pad and idle plate in one merged
// mesh would stop a bar from moving, so frames and pads share one mesh and each barbell
// is its own. One material throughout: colours are vertex colours, and values above 1
// are what makes the high tiers look lit from inside.

const REBIRTH_ARC = new Path2D('M50 6a40 40 0 0 1 38 28L48 46C34 36 24 38 12 46 12 26 30 6 50 6z')
const REBIRTH_WAVE = new Path2D('M12 48c14-8 30-6 42 8 10 12 24 12 34-2-4 20-20 32-38 32-20 0-38-16-38-38z')
function drawRebirth(ctx, x, y, s) {
  ctx.save()
  ctx.translate(x - 50 * s, y - 46 * s)
  ctx.scale(s, s)
  ctx.lineWidth = 6
  ctx.strokeStyle = '#1d0a3a'
  ctx.lineJoin = 'round'
  ctx.fillStyle = '#f2f6ff'
  ctx.beginPath()
  ctx.arc(50, 46, 40, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#7a35e0'
  ctx.fill(REBIRTH_ARC)
  ctx.stroke(REBIRTH_ARC)
  ctx.fillStyle = '#7fd4ff'
  ctx.fill(REBIRTH_WAVE)
  ctx.stroke(REBIRTH_WAVE)
  ctx.restore()
}

function line(ctx, s, x, y, size, fill, outline, weight = 0.2) {
  ctx.font = `700 ${size}px Fredoka, "Arial Black", sans-serif`
  ctx.lineJoin = 'round'
  ctx.lineWidth = size * weight
  ctx.strokeStyle = outline
  ctx.strokeText(s, x, y)
  const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2)
  g.addColorStop(0.1, fill[0])
  g.addColorStop(0.9, fill[1])
  ctx.fillStyle = g
  ctx.fillText(s, x, y)
}

const RAINBOW = ['#ffe63a', '#46e04a', '#29c8ff', '#7a5cff', '#ff3fb4', '#ff7a1e']

function benchLabel(cfg) {
  const c = document.createElement('canvas')
  c.width = 720
  c.height = 520
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  const scale = cfg.coins ? 9.4 : 7
  sprite.scale.set(scale, (scale * 520) / 720, 1)
  const draw = () => {
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, 720, 520)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (cfg.coins) {
      paintRainbow(ctx, cfg.title, 360, 120, 150, RAINBOW, '#16100a')
      paintRainbow(ctx, `x${cfg.mult} POWER`, 360, 280, 96, ['#7dff5a', '#fff36a', '#ff5cf2', '#ff8a1e'], '#16100a')
      line(ctx, owns(cfg.id) ? 'OWNED' : compact(cfg.coins), 360, 410, 92, ['#ffe36b', '#ff2a10'], '#16100a')
      return
    }
    if (cfg.title) {
      line(ctx, cfg.title, 360, 280, 112, cfg.titleColors, '#14141c')
      line(ctx, `x${cfg.mult} POWER`, 360, 400, 76, cfg.powerColors, '#2b1500')
      return
    }
    drawRebirth(ctx, 360, 96, 1.5)
    line(ctx, `${cfg.rebirths} REBIRTHS`, 360, 262, 104, ['#ff8af5', '#d818e8'], '#1d0a3a')
    line(ctx, `x${cfg.mult} POWER`, 360, 386, 84, ['#efff5a', '#5fe02a'], '#123008')
  }
  draw()
  fontReady.then(() => {
    draw()
    tex.needsUpdate = true
  })
  sprite.userData.redraw = () => {
    draw()
    tex.needsUpdate = true
  }
  return sprite
}

function trainPowerSign() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 400
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  const h = SET.trainPower.height * 1.9
  sprite.scale.set((h * 1024) / 400, h, 1)
  const draw = () => {
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, 1024, 400)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    drawBicep(ctx, 512, 120, 1.7)
    line(ctx, 'TRAIN POWER', 512, 300, 148, ['#ffe94a', '#ff8a10'], '#1c1006', 0.16)
  }
  draw()
  fontReady.then(() => {
    draw()
    tex.needsUpdate = true
  })
  return sprite
}

// --- Geometry ---------------------------------------------------------------------------
const tint = new Color()
const m4 = new Matrix4()
const q4 = new Quaternion()
const eu = new Euler()
const v = new Vector3()
const unit = new Vector3(1, 1, 1)

// A coloured part. color: a CSS colour, or fn(x, y, z) -> Color for the rainbow plates.
function piece(list, geo, color, x, y, z, rx = 0, ry = 0, rz = 0, gain = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone()
  g.deleteAttribute('uv')
  m4.compose(v.set(x, y, z), q4.setFromEuler(eu.set(rx, ry, rz)), unit)
  g.applyMatrix4(m4)
  const p = g.attributes.position
  const out = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    if (typeof color === 'function') color(p.getX(i), p.getY(i), p.getZ(i), tint)
    else tint.set(color)
    out[i * 3] = tint.r * gain
    out[i * 3 + 1] = tint.g * gain
    out[i * 3 + 2] = tint.b * gain
  }
  g.setAttribute('color', new BufferAttribute(out, 3))
  list.push(g)
}
const box = (w, h, d) => new BoxGeometry(w, h, d)
const barrel = (r, len, seg = 24) => new CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2)

const rainbowAt = (x, y, z, c) => c.setHSL(((Math.atan2(y, z) / (Math.PI * 2) + 1) % 1), 0.95, 0.55)
const rainbowAlong = (x, y, z, c) => c.setHSL(((z + 2) / 3.8 + 1) % 1, 0.95, 0.55)

// Bench space: origin on the floor at the bay's centre, +z toward the feet, rack at -z.
function buildFrame(list, cfg) {
  const metal = '#a4a8c6'
  const shade = '#73779a'
  const { rackZ, rackY } = GYM
  for (const s of [-1, 1]) {
    const x = s * 1.02
    piece(list, box(0.16, 0.14, 2.3), shade, x, 0.07, rackZ, 0, 0, 0)
    // The A-frame of the rack, leaning in to the cradle.
    piece(list, box(0.16, 2.44, 0.16), metal, x, rackY / 2, rackZ - 0.4, 0.38)
    piece(list, box(0.16, 2.44, 0.16), metal, x, rackY / 2, rackZ + 0.4, -0.38)
    piece(list, box(0.26, 0.12, 0.34), shade, x, rackY - 0.12, rackZ)
    piece(list, box(0.08, 0.2, 0.08), shade, x, rackY - 0.02, rackZ - 0.15)
    piece(list, box(0.08, 0.2, 0.08), shade, x, rackY - 0.02, rackZ + 0.15)
    // Pad trestle legs.
    piece(list, box(0.12, 1, 0.12), metal, s * 0.26, 0.42, 1.25, 0, 0, s * 0.42)
    piece(list, box(0.12, 1, 0.12), metal, s * 0.26, 0.42, -0.75, 0, 0, s * 0.42)
  }
  // Cross bracing between the uprights.
  piece(list, box(2.32, 0.11, 0.11), metal, 0, 0.82, rackZ + 0.3, 0, 0, 0.5)
  piece(list, box(2.32, 0.11, 0.11), metal, 0, 0.82, rackZ + 0.3, 0, 0, -0.5)
  piece(list, box(1.3, 0.12, 0.14), shade, 0, 0.07, 1.25)
  piece(list, box(1.3, 0.12, 0.14), shade, 0, 0.07, -0.75)
  piece(list, box(0.2, 0.1, 3.5), shade, 0, 0.8, -0.1)
  const pad = cfg.rainbow ? rainbowAlong : cfg.pad
  const glow = cfg.padGlow ?? 1
  piece(list, box(1, 0.14, 3.7), pad, 0, GYM.padTop - 0.13, -0.15, 0, 0, 0, glow)
  piece(list, box(0.9, 0.06, 3.6), pad, 0, GYM.padTop - 0.03, -0.15, 0, 0, 0, glow * 1.15)
}

function barbellGeometry(cfg) {
  const list = []
  const R = cfg.plateR
  const rim = cfg.rainbow ? rainbowAt : cfg.rim
  const face = cfg.rainbow ? (x, y, z, c) => rainbowAt(x, y, z, c).multiplyScalar(0.4) : cfg.face
  const glow = cfg.padGlow ?? 1
  piece(list, barrel(0.055, 3.9, 10), '#585a6e', 0, 0, 0)
  for (const s of [-1, 1]) {
    piece(list, barrel(R, 0.17), rim, s * 1.42, 0, 0, 0, 0, 0, glow)
    piece(list, barrel(R * 0.72, 0.2), face, s * 1.42, 0, 0)
    piece(list, barrel(R * 0.82, 0.13), rim, s * 1.26, 0, 0, 0, 0, 0, glow)
    piece(list, barrel(R * 0.56, 0.16), face, s * 1.26, 0, 0)
    piece(list, barrel(0.15, 0.1, 12), '#2c2d38', s * 1.56, 0, 0)
    piece(list, barrel(0.15, 0.1, 12), '#2c2d38', s * 1.14, 0, 0)
  }
  return mergeGeometries(list)
}

// Three tilted bands round the bench; the shader runs bright arcs along them.
function swirlGeometry() {
  const parts = []
  for (const [radius, width, tilt, roll, seed] of [[2.5, 0.8, 0.2, 0, 0], [2.9, 0.6, -0.42, 1.4, 0.35], [2.2, 1, 0.75, 2.6, 0.7]]) {
    const seg = 44
    const pos = []
    const uv = []
    const idx = []
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2
      for (const side of [0, 1]) {
        const r = radius + (side - 0.5) * width
        pos.push(Math.cos(a) * r, (side - 0.5) * width * 0.4, Math.sin(a) * r * 1.18)
        uv.push(i / seg + seed, side)
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    g.setIndex(idx)
    g.applyMatrix4(m4.makeRotationFromEuler(eu.set(tilt, roll, tilt * 0.5)))
    parts.push(g)
  }
  return mergeGeometries(parts)
}

const SWIRL_VERT = /* glsl */ `
  varying vec2 vUv;
  uniform float time;
  void main() {
    vUv = uv;
    float a = time;
    vec3 p = vec3(position.x * cos(a) - position.z * sin(a), position.y, position.x * sin(a) + position.z * cos(a));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`
// Painted, not added: a red arc has to stay red over green.
const SWIRL_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 c1;
  uniform vec3 c2;
  uniform float time;
  uniform float gain;
  void main() {
    float f = fract(vUv.x * 3.0 + time * 0.8 + vUv.y * 0.5);
    float tail = pow(f, 1.8) * smoothstep(1.0, 0.95, f);
    float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float wisp = 0.6 + 0.4 * sin(vUv.x * 46.0 + time * 7.0 + vUv.y * 9.0);
    float a = tail * pow(across, 1.2) * wisp * gain * 2.2;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(c2, c1, tail * across), min(1.0, a));
  }`

function softDisc() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.4)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new CanvasTexture(c)
}

const MAX_BOLT_SEGMENTS = 150
const rnd = (a, b) => a + Math.random() * (b - a)
const ease = (t) => t * t * (3 - 2 * t)
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)
const a3 = new Vector3()
const b3 = new Vector3()
const d3 = new Vector3()
const s3 = new Vector3()
const c3 = new Vector3()
const e3 = new Vector3()

export function createGym(scene, fx, sound, hud) {
  const root = new Group()
  scene.add(root)
  const benchMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.28 })

  const benches = GYM.benches.map((cfg, i) => {
    const row = GYM.rows[cfg.row]
    const b = { cfg, index: i, x: GYM.firstX + cfg.slot * GYM.step, z: row.z, yaw: row.yaw, dir: Math.cos(row.yaw) > 0 ? 1 : -1, near: false, emitter: null, swirl: null }
    b.wx = (lx) => b.x + lx * b.dir
    b.wz = (lz) => b.z + lz * b.dir
    return b
  })

  // Frames and pads: one mesh for the whole gym.
  const statics = []
  for (const b of benches) {
    const list = []
    buildFrame(list, b.cfg)
    const g = mergeGeometries(list)
    g.applyMatrix4(m4.compose(v.set(b.x, 0, b.z), q4.setFromEuler(eu.set(0, b.yaw, 0)), unit))
    statics.push(g)
    solidBox(0.55, 0.5, 1.9, b.x, 0.5, b.wz(-0.15))
    solidBox(1.15, 1.2, 0.95, b.x, 1.2, b.wz(GYM.rackZ))
  }
  const frames = new Mesh(mergeGeometries(statics), benchMat)
  frames.castShadow = frames.receiveShadow = true
  root.add(frames)

  // Ground glow: one quad per lit bench, the cheap stand-in for a light per bench.
  const glowParts = []
  for (const b of benches) {
    if (!b.cfg.aura?.c2) continue
    const q = new PlaneGeometry(10, 12).rotateX(-Math.PI / 2).translate(b.x, 0.05, b.z)
    const col = new Float32Array(q.attributes.position.count * 3)
    tint.set(b.cfg.aura.c2)
    for (let i = 0; i < col.length; i += 3) col.set([tint.r, tint.g, tint.b], i)
    q.setAttribute('color', new BufferAttribute(col, 3))
    q.deleteAttribute('normal')
    glowParts.push(q)
  }
  const groundGlow = new Mesh(mergeGeometries(glowParts), new MeshBasicMaterial({ map: softDisc(), vertexColors: true, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, toneMapped: false }))
  // A shared UV 0..1 per quad: the soft disc lands once on each.
  groundGlow.renderOrder = 1
  root.add(groundGlow)

  const swirlGeo = swirlGeometry()
  for (const b of benches) {
    const { cfg } = b
    const bar = new Mesh(barbellGeometry(cfg), benchMat)
    bar.castShadow = true
    bar.position.set(b.x, GYM.rackY + 0.06, b.wz(GYM.rackZ))
    root.add(bar)
    b.bar = bar
    const sign = benchLabel(cfg)
    sign.position.set(b.x, cfg.coins ? 6.6 : 5.6, b.z + b.dir * -0.4)
    root.add(sign)
    b.sign = sign
    const A = cfg.aura
    if (!A) continue
    if (A.swirl) {
      const u = { time: { value: 0 }, c1: { value: new Color(A.c1).convertLinearToSRGB() }, c2: { value: new Color(A.c2).convertLinearToSRGB() }, gain: { value: A.swirl } }
      const s = new Mesh(swirlGeo, new ShaderMaterial({ uniforms: u, vertexShader: SWIRL_VERT, fragmentShader: SWIRL_FRAG, transparent: true, depthWrite: false, side: DoubleSide }))
      s.position.set(b.x, 1.7, b.z)
      s.frustumCulled = true
      s.renderOrder = 4
      root.add(s)
      b.swirl = s
    }
    b.emitter = fx.addEmitter({ rate: A.rate, tick: (p, n) => auraTick(b, p, n) })
  }

  // Lightning: a pool of camera-facing segments, redrawn a dozen times a second.
  const boltPos = new Float32Array(MAX_BOLT_SEGMENTS * 18)
  const boltCol = new Float32Array(MAX_BOLT_SEGMENTS * 18)
  const boltGeo = new BufferGeometry()
  const boltPosAttr = new BufferAttribute(boltPos, 3).setUsage(DynamicDrawUsage)
  const boltColAttr = new BufferAttribute(boltCol, 3).setUsage(DynamicDrawUsage)
  boltGeo.setAttribute('position', boltPosAttr)
  boltGeo.setAttribute('color', boltColAttr)
  boltGeo.setDrawRange(0, 0)
  const bolts = new Mesh(boltGeo, new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false }))
  bolts.frustumCulled = false
  bolts.renderOrder = 6
  root.add(bolts)
  let boltCd = 0
  let boltSegs = 0

  function segment(a, b, width, color, camera) {
    if (boltSegs >= MAX_BOLT_SEGMENTS) return
    d3.subVectors(b, a)
    s3.subVectors(camera.position, a).cross(d3).normalize().multiplyScalar(width)
    const at = boltSegs * 18
    const verts = [a.x - s3.x, a.y - s3.y, a.z - s3.z, a.x + s3.x, a.y + s3.y, a.z + s3.z, b.x + s3.x, b.y + s3.y, b.z + s3.z, a.x - s3.x, a.y - s3.y, a.z - s3.z, b.x + s3.x, b.y + s3.y, b.z + s3.z, b.x - s3.x, b.y - s3.y, b.z - s3.z]
    for (let i = 0; i < 18; i++) boltPos[at + i] = verts[i]
    for (let i = 0; i < 18; i += 3) {
      boltCol[at + i] = color.r
      boltCol[at + i + 1] = color.g
      boltCol[at + i + 2] = color.b
    }
    boltSegs++
  }

  function bolt(b, camera) {
    const A = b.cfg.aura
    const R = b.cfg.plateR
    const side = Math.random() < 0.5 ? -1 : 1
    const bar = b.bar.position
    a3.set(bar.x + side * 1.4, bar.y + rnd(-R, R), bar.z + rnd(-R, R))
    const ang = rnd(0, 6.28)
    const reach = rnd(1.4, 3)
    b3.set(a3.x + Math.cos(ang) * reach, a3.y + rnd(-1.5, 1.2), a3.z + Math.sin(ang) * reach)
    b3.y = Math.max(0.1, b3.y)
    const steps = 6
    tint.set(Math.random() < 0.3 ? '#ffffff' : A.c1)
    const from = c3.copy(a3)
    const to = e3
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      to.lerpVectors(a3, b3, t)
      if (i < steps) to.set(to.x + rnd(-0.34, 0.34), to.y + rnd(-0.34, 0.34), to.z + rnd(-0.34, 0.34))
      segment(from, to, 0.085 * (1.2 - t), tint, camera)
      from.copy(to)
    }
  }

  const RAINBOW_RAMPS = ['ngreen', 'nviolet', 'ncyan', 'nelectric', 'npink']
  const S = fx.smoke
  function flame(p, size, ramp, vy) {
    S.emit({ x: p.x + rnd(-size, size) * 0.6, y: p.y, z: p.z + rnd(-size, size) * 0.6, vx: rnd(-0.8, 0.8), vy: vy * rnd(0.7, 1.4), vz: rnd(-0.8, 0.8), life: rnd(0.35, 0.75), size: size * rnd(1, 1.7), size2: size * 0.4, drag: 1.2, grav: 3, ramp, round: true })
  }
  function streak(x, y, z, vx, vy, vz, ramp, life, size, stretch = 0.12) {
    S.emit({ x, y, z, vx, vy, vz, life, size: size * 1.7, size2: size * 0.5, stretch, drag: 0.8, ramp, round: true })
  }
  function auraTick(b, p, n) {
    if (!b.near) return
    const kind = b.cfg.aura.kind
    const bar = b.bar.position
    const R = b.cfg.plateR
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1
      const a = rnd(0, 6.28)
      p.set(bar.x + side * 1.4, bar.y + Math.sin(a) * R, bar.z + Math.cos(a) * R)
      if (kind === 'mist') {
        S.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-0.5, 0.5), vy: rnd(0.3, 1.2), vz: rnd(-0.5, 0.5), life: rnd(0.5, 1), size: rnd(0.1, 0.2), size2: 0.03, ramp: 'nmist', round: true })
      } else if (kind === 'electric') {
        const s = rnd(2, 7)
        streak(p.x, p.y, p.z, Math.cos(a) * s, rnd(-3, 5), Math.sin(a) * s, 'nelectric', rnd(0.14, 0.4), rnd(0.08, 0.16), 0.1)
      } else if (kind === 'ember') {
        // Thin slashes running round the bench.
        const r = rnd(1.8, 3.2)
        const sp = rnd(7, 12)
        streak(b.x + Math.cos(a) * r, rnd(0.3, 3.2), b.z + Math.sin(a) * r * 1.2, -Math.sin(a) * sp, rnd(0.5, 3), Math.cos(a) * sp, i % 2 ? 'nember' : 'ncrimson', rnd(0.2, 0.5), rnd(0.08, 0.14), 0.14)
      } else if (kind === 'violet') {
        const r = rnd(1, 3.4)
        const sp = rnd(7, 13)
        const px = b.x + Math.cos(a) * r
        const pz = b.z + Math.sin(a) * r * 1.2
        streak(px, rnd(0.2, 3.4), pz, -Math.sin(a) * sp - Math.cos(a) * 2, rnd(-1, 2), Math.cos(a) * sp - Math.sin(a) * 2, 'nviolet', rnd(0.2, 0.5), rnd(0.1, 0.2), 0.13)
        if (Math.random() < 0.1) fx.puff(p.set(px, 0.4, pz), 0.55, 'blacksmoke', 1, 1.5, 0.55)
      } else if (kind === 'fire') {
        // A star of flame bursting from the bench, with soot on top.
        if (i % 2) {
          const u = rnd(-0.3, 1)
          const sp = rnd(8, 16)
          streak(b.x, 1.7, b.z, Math.cos(a) * sp * (1 - Math.abs(u)), u * sp, Math.sin(a) * sp * (1 - Math.abs(u)), 'nfire', rnd(0.16, 0.34), rnd(0.16, 0.3), 0.14)
        } else flame(p, 0.72, 'nfire', 3.4)
        if (Math.random() < 0.07) fx.puff(p.set(b.x + rnd(-1.5, 1.5), 1.2, b.z + rnd(-2, 2)), 0.7, 'blacksmoke', 1.4, 1.8, 0.6)
      } else if (kind === 'crimson') {
        if (i % 2) flame(p, 0.8, 'ncrimson', 3.4)
        else {
          const r = rnd(2.2, 3.4)
          const sp = rnd(8, 13)
          streak(b.x + Math.cos(a) * r, rnd(0.3, 3.2), b.z + Math.sin(a) * r * 1.2, -Math.sin(a) * sp, rnd(0, 2), Math.cos(a) * sp, i % 4 ? 'ncrimson' : 'nember', rnd(0.2, 0.5), rnd(0.1, 0.18), 0.14)
        }
        if (Math.random() < 0.08) fx.puff(p.set(b.x + rnd(-1.5, 1.5), 0.6, b.z + rnd(-2, 2)), 0.7, 'blacksmoke', 1.2, 1.8, 0.6)
      } else {
        const ramp = RAINBOW_RAMPS[Math.floor(Math.random() * RAINBOW_RAMPS.length)]
        if (i % 2) flame(p, 0.46, ramp, 2.6)
        else {
          const u = rnd(-0.1, 1)
          const sp = rnd(5, 13)
          streak(b.x, 1.7, b.z, Math.cos(a) * sp * (1 - u * 0.7), u * sp, Math.sin(a) * sp * (1 - u * 0.7), ramp, rnd(0.2, 0.5), rnd(0.12, 0.22), 0.13)
        }
      }
    }
    return true
  }

  const sign = trainPowerSign()
  sign.position.set(SET.trainPower.x, SET.trainPower.y, SET.trainPower.z)
  root.add(sign)

  // --- Training --------------------------------------------------------------------------
  const t = { bench: null, stage: 'none', k: 0, phase: 0.5, reps: 0, from: new Vector3(), spot: new Vector3(), yawFrom: 0 }
  const anim = { w: 0, rep: 1 }
  const gainOf = (b) => Math.round(GYM.baseGain * b.cfg.mult * progress.multiplier * progress.powerMult * powerBoost())
  const active = () => t.bench !== null
  let crackleCd = 1

  function begin(b) {
    t.bench = b
    t.stage = 'down'
    t.k = 0
    t.phase = 0.5
    t.reps = 0
    t.yawFrom = player.facing
    t.from.set(player.renderPosition.x, player.renderPosition.y, player.renderPosition.z)
    // The capsule waits beside the pad; the camera eases over with it.
    t.spot.set(b.wx(1.55), 0, b.wz(0.4))
    resetPlayer(t.spot, b.yaw)
    player.locked = true
    if (b.emitter) b.emitter.rate = b.cfg.aura.rate * 1.8
    hud.showStop(true)
    sound.benchLie(b.x, b.z)
  }

  function stop(now = false) {
    if (!t.bench || (t.stage === 'up' && !now)) return
    if (now) return release()
    t.stage = 'up'
    hud.showStop(false)
    sound.benchRise(t.bench.x, t.bench.z)
  }

  function release() {
    const b = t.bench
    if (b.emitter) b.emitter.rate = b.cfg.aura.rate
    b.bar.position.set(b.x, GYM.rackY + 0.06, b.wz(GYM.rackZ))
    t.bench = null
    t.stage = 'none'
    t.k = 0
    anim.w = 0
    player.locked = false
    player.facing = b.yaw
    syncYawToPlayer()
    hud.showStop(false)
  }

  function rep(top) {
    const b = t.bench
    const n = gainOf(b)
    addPower(n)
    hud.gainFloat(n)
    t.reps++
    sound.gainPop(t.reps)
    const pos = b.bar.position
    if (top) {
      sound.repTop(b.x, b.z, b.cfg.plateR)
      if (b.cfg.aura?.kind && b.cfg.aura.kind !== 'mist') fx.flash(b.x, 2.6, b.z, 34, 7, b.cfg.aura.c1)
    } else {
      sound.repBottom(b.x, b.z, b.cfg.plateR)
      fx.dustRing(b.x, b.z, 1, 3, 'grass')
    }
    const hit = { mist: 'nmist', electric: 'nelectric', ember: 'nember', violet: 'nviolet', fire: 'nfire', crimson: 'ncrimson', rainbow: 'ngreen' }[b.cfg.aura?.kind] ?? 'nelectric'
    for (let i = 0; i < 6; i++) {
      const sx = i % 2 ? 1.4 : -1.4
      S.emit({ x: pos.x + sx, y: pos.y, z: pos.z, vx: rnd(-3, 3), vy: top ? rnd(1, 5) : rnd(-1, 3), vz: rnd(-3, 3), life: rnd(0.2, 0.45), size: rnd(0.08, 0.16), size2: 0.02, grav: -6, stretch: 0.05, ramp: hit, round: true })
    }
    // Every twentieth half rep lands a little harder.
    if (t.reps % 20 === 0) {
      fx.shockwave(b.x, 0.2, b.z, 7, 0.5, b.cfg.aura?.c1 ?? '#fff0d0')
      sound.milestone()
      hud.pulsePower()
    }
  }

  function stepTraining(dt) {
    const b = t.bench
    if (!b) return
    const { rackZ, rackY, barZ, barLow, barHigh, transition, gainEvery } = GYM
    let barY
    let barZNow = barZ
    if (t.stage === 'down') {
      t.k = Math.min(1, t.k + dt / transition)
      const lift = ease(clamp01((t.k - 0.55) / 0.45))
      barY = rackY + 0.06 + (barHigh - rackY - 0.06) * lift
      barZNow = rackZ + (barZ - rackZ) * lift
      anim.w = ease(clamp01((t.k - 0.3) / 0.7))
      anim.rep = 1
      if (t.k >= 1) t.stage = 'train'
    } else if (t.stage === 'train') {
      const before = t.phase
      t.phase = (t.phase + dt / (gainEvery * 2)) % 1
      // phase 0 = chest, 0.5 = lockout: the press is quick, the descent controlled.
      const up = t.phase < 0.5
      const u = up ? t.phase * 2 : (t.phase - 0.5) * 2
      anim.rep = up ? ease(u) : 1 - ease(u)
      barY = barLow + (barHigh - barLow) * anim.rep
      if (before < 0.5 && t.phase >= 0.5) rep(true)
      else if (t.phase < before) rep(false)
    } else {
      t.k = Math.max(0, t.k - dt / transition)
      const lift = ease(clamp01((t.k - 0.55) / 0.45))
      barY = rackY + 0.06 + (barHigh - rackY - 0.06) * lift
      barZNow = rackZ + (barZ - rackZ) * lift
      anim.w = ease(clamp01((t.k - 0.3) / 0.7))
      anim.rep = 1
      if (t.k <= 0) {
        sound.barRack(b.x, b.z, b.cfg.plateR)
        release()
        return
      }
    }
    b.bar.position.set(b.x, barY, b.wz(barZNow))
  }

  // Draws the avatar on the bench; called after the player group is placed for the frame.
  function placeAvatar(group) {
    const b = t.bench
    group.rotation.order = 'YXZ'
    if (!b) {
      group.rotation.x = 0
      return
    }
    const k = ease(t.k)
    const lx = b.x
    const lz = b.wz(GYM.feetZ)
    const up = t.stage === 'up'
    const sx = up ? t.spot.x : t.from.x
    const sy = up ? 0 : t.from.y
    const sz = up ? t.spot.z : t.from.z
    group.position.set(sx + (lx - sx) * k, sy + (GYM.feetY - sy) * k + Math.sin(k * Math.PI) * 0.5, sz + (lz - sz) * k)
    const yawA = up ? b.yaw : t.yawFrom
    const dy = Math.atan2(Math.sin(b.yaw - yawA), Math.cos(b.yaw - yawA))
    group.rotation.y = yawA + dy * k
    group.rotation.x = (-Math.PI / 2) * k
  }

  // What the prompt offers near a bench.
  function want() {
    if (t.bench) return null
    let best = null
    let bestD = GYM.reach
    const p = player.position
    for (const b of benches) {
      const d = Math.hypot(p.x - b.x, p.z - b.wz(-0.15))
      if (d < bestD) {
        bestD = d
        best = b
      }
    }
    if (!best) return null
    const { cfg } = best
    const base = { bay: best, x: best.x, y: 3.1, z: best.z }
    if (cfg.coins && !owns(cfg.id)) {
      return {
        ...base,
        kind: 'bench-buy',
        text: `Buy ${compact(shopPrice(cfg.id))} Coins`,
        instant: true,
        act() {
          if (buyShop(cfg.id)) {
            sound.buy()
            best.sign.userData.redraw()
            hud.toast(`${cfg.title} bench unlocked!`)
          } else {
            sound.deny()
            hud.toast(`You need ${compact(shopPrice(cfg.id))} coins for this bench`)
          }
        },
      }
    }
    if (!cfg.coins && progress.rebirths < cfg.rebirths) {
      return {
        ...base,
        kind: 'bench-locked',
        text: `Needs ${cfg.rebirths} Rebirths`,
        instant: true,
        act() {
          sound.deny()
          hud.toast(`This bench needs ${cfg.rebirths} rebirths. You have ${progress.rebirths}.`)
        },
      }
    }
    return { ...base, kind: 'bench', text: 'Train', act: () => begin(best) }
  }

  function update(dt, elapsed, camera) {
    stepTraining(dt)
    const px = camera.position.x
    const pz = camera.position.z
    groundGlow.material.opacity = 0.2 + Math.sin(elapsed * 3.1) * 0.05
    let nearest = null
    let nearestD = 26
    for (const b of benches) {
      const d = Math.hypot(b.x - px, b.z - pz)
      b.near = d < GYM.auraReach
      if (b.cfg.coins && b.owned !== owns(b.cfg.id)) {
        b.owned = owns(b.cfg.id)
        b.sign.userData.redraw()
      }
      b.sign.visible = Math.hypot(d, b.sign.position.y - camera.position.y) > 7 // never a wall of text in the lens
      if (b.swirl) {
        b.swirl.visible = b.near
        const u = b.swirl.material.uniforms
        u.time.value = elapsed * 1.4
        u.gain.value = b.cfg.aura.swirl * (t.bench === b ? 1.5 : 1)
      }
      if (b.cfg.rainbow && !(t.bench === b)) b.bar.rotation.x = elapsed * 0.7
      const pd = Math.hypot(b.x - player.position.x, b.z - player.position.z)
      if (b.cfg.aura && b.cfg.aura.kind !== 'mist' && pd < nearestD) {
        nearestD = pd
        nearest = b
      }
    }
    boltCd -= dt
    if (boltCd <= 0) {
      boltCd = 0.075
      boltSegs = 0
      for (const b of benches) {
        const count = b.cfg.aura?.bolts ?? 0
        if (!count || !b.near) continue
        const n = t.bench === b ? count * 2 : count
        for (let i = 0; i < n; i++) if (Math.random() < 0.7) bolt(b, camera)
      }
      boltGeo.setDrawRange(0, boltSegs * 6)
      boltPosAttr.needsUpdate = boltColAttr.needsUpdate = true
    }
    // The nearest lit bench is the one you hear.
    crackleCd -= dt
    if (crackleCd <= 0 && nearest) {
      crackleCd = rnd(0.22, 0.6)
      sound.aura(nearest.cfg.aura.kind, nearest.x, nearest.z)
    }
  }

  // The bench in use and the bar's height phase, for the others to see (net.js presence); null when not training.
  const training = () => (t.bench ? { bench: t.bench.index, rep: anim.rep } : null)
  return { update, want, stop, active, anim, placeAvatar, benches, training }
}
