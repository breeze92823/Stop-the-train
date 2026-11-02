import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  Euler,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Quaternion,
  RGBAFormat,
  SphereGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { VARIANTS } from './config.js'

// Procedural vehicles. A model is one merged geometry with one material, so a rail
// full of cars stays one draw call each: colour lives in vertex colours, and
// roughness / metalness / glow come from a tiny lookup texture addressed by the
// vertex UV ("slot"). Car bodies are lofted from side profiles (real curved
// silhouettes, and enough vertices to crumple); everything else is boxes and
// cylinders. Models face +X and stand on y = 0.

// slot: [roughness, metalness, emissive r, g, b]
const SLOT_DEFS = {
  paint: [0.24, 0.42, 0, 0, 0],
  trim: [0.55, 0.2, 0, 0, 0],
  glass: [0.06, 0.55, 0, 0, 0],
  tire: [0.92, 0, 0, 0, 0],
  rim: [0.3, 0.85, 0, 0, 0],
  chrome: [0.14, 1, 0, 0, 0],
  head: [0.2, 0.2, 1, 0.97, 0.86],
  tail: [0.25, 0.2, 1, 0.08, 0.06],
  amber: [0.25, 0.2, 1, 0.55, 0.1],
  steel: [0.42, 0.72, 0, 0, 0],
  rust: [0.8, 0.3, 0, 0, 0],
  bone: [0.6, 0, 0, 0, 0],
}
const SLOT_NAMES = Object.keys(SLOT_DEFS)
export const SLOT = Object.fromEntries(SLOT_NAMES.map((n, i) => [n, i]))
const slotU = (i) => (i + 0.5) / SLOT_NAMES.length

function slotTextures() {
  const n = SLOT_NAMES.length
  const orm = new Uint8Array(n * 4)
  const glow = new Uint8Array(n * 4)
  SLOT_NAMES.forEach((name, i) => {
    const [r, m, er, eg, eb] = SLOT_DEFS[name]
    orm.set([0, r * 255, m * 255, 255], i * 4)
    glow.set([er * 255, eg * 255, eb * 255, 255], i * 4)
  })
  const make = (data) => {
    const t = new DataTexture(data, n, 1, RGBAFormat)
    t.magFilter = t.minFilter = NearestFilter
    t.needsUpdate = true
    return t
  }
  return { orm: make(orm), glow: make(glow) }
}

let tex = null
export function vehicleMaterial(extra = {}) {
  tex ??= slotTextures()
  return new MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 1,
    roughnessMap: tex.orm,
    metalnessMap: tex.orm,
    emissive: '#ffffff',
    emissiveMap: tex.glow,
    emissiveIntensity: 2.2,
    ...extra,
  })
}
export const sharedMaterial = () => (shared ??= vehicleMaterial())
let shared = null

// Silhouette of a vehicle too heavy to lift: nearly black, matching the reference.
export const lockedMaterial = () => (locked ??= vehicleMaterial({ color: '#17181f', emissiveIntensity: 0.15 }))
let locked = null

// Golden / emerald paint: veins of colour flowing over the bodywork.
const flowUniform = { value: 0 }
export const tickVehicleMaterials = (elapsed) => {
  flowUniform.value = elapsed
}
const flowMats = new Map()
export function variantMaterial(id) {
  let m = flowMats.get(id)
  if (m) return m
  const v = VARIANTS[id]
  m = vehicleMaterial()
  const a = new Color(v.paint)
  const b = new Color(v.paint2)
  const edge = (SLOT.paint + 1) / SLOT_NAMES.length
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = flowUniform
    s.uniforms.uA = { value: a }
    s.uniforms.uB = { value: b }
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying float vSlot;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position; vSlot = uv.x;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying float vSlot; uniform float uTime; uniform vec3 uA; uniform vec3 uB;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vSlot < ${edge.toFixed(5)}) {
          vec3 p = vObj * 1.5;
          float t = uTime * 0.5;
          float n = sin(p.x * 2.1 + sin(p.z * 3.3 + t) * 1.7 + t) + sin(p.z * 2.7 + sin(p.y * 4.1 - t) * 1.4 - t * 0.7);
          float vein = smoothstep(0.1, 0.95, abs(sin(n * 1.7)));
          diffuseColor.rgb = mix(uA, uB, vein);
        }`,
      )
  }
  m.customProgramCacheKey = () => `flow-${id}`
  flowMats.set(id, m)
  return m
}

// --- Geometry kit -----------------------------------------------------------------------
const mat = new Matrix4()
const pos = new Vector3()
const quat = new Quaternion()
const eul = new Euler()
const one = new Vector3(1, 1, 1)
const tint = new Color()

export class Kit {
  constructor(paint) {
    this.geos = []
    this.paint = paint
  }

  // Bakes `geo` with a colour and slot; takes ownership of a non-indexed clone.
  add(geo, slot, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    g.deleteAttribute('uv')
    mat.compose(pos.set(x, y, z), quat.setFromEuler(eul.set(rx, ry, rz)), one)
    g.applyMatrix4(mat)
    const n = g.attributes.position.count
    tint.set(color)
    const col = new Float32Array(n * 3)
    const uv = new Float32Array(n * 2)
    const u = slotU(slot)
    for (let i = 0; i < n; i++) {
      col.set([tint.r, tint.g, tint.b], i * 3)
      uv.set([u, 0.5], i * 2)
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3))
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
    this.geos.push(g)
    return g
  }

  box(w, h, d, x, y, z, slot = SLOT.trim, color = '#222228', rx = 0, ry = 0, rz = 0, seg = 1) {
    return this.add(new BoxGeometry(w, h, d, seg, seg, seg), slot, color, x, y, z, rx, ry, rz)
  }

  // Cylinder along an axis ('x' | 'y' | 'z').
  cyl(r, len, x, y, z, slot = SLOT.trim, color = '#222228', axis = 'z', seg = 14, r2 = r) {
    const g = new CylinderGeometry(r2, r, len, seg)
    const rx = axis === 'z' ? Math.PI / 2 : 0
    const rz = axis === 'x' ? Math.PI / 2 : 0
    return this.add(g, slot, color, x, y, z, rx, 0, rz)
  }

  ball(r, x, y, z, slot, color, sx = 1, sy = 1, sz = 1) {
    const g = new SphereGeometry(r, 12, 10)
    g.scale(sx, sy, sz)
    return this.add(g, slot, color, x, y, z)
  }

  // Lofted skin through stations { x, top, bot, w }; n = squareness of the cross-section.
  skin(stations, slot, color, ring = 14, n = 4) {
    const rows = [
      { ...stations[0], top: (stations[0].top + stations[0].bot) / 2, bot: (stations[0].top + stations[0].bot) / 2, w: 0.001 },
      ...stations,
      { ...stations.at(-1), top: (stations.at(-1).top + stations.at(-1).bot) / 2, bot: (stations.at(-1).top + stations.at(-1).bot) / 2, w: 0.001 },
    ]
    const p = []
    const idx = []
    const pw = 2 / n
    const sp = (v) => Math.sign(v) * Math.abs(v) ** pw
    rows.forEach((s) => {
      const cy = (s.top + s.bot) / 2
      const ry = (s.top - s.bot) / 2
      for (let i = 0; i < ring; i++) {
        const a = (i / ring) * Math.PI * 2
        p.push(s.x, cy + ry * sp(Math.sin(a)), s.w * sp(Math.cos(a)))
      }
    })
    for (let r = 0; r < rows.length - 1; r++) {
      for (let i = 0; i < ring; i++) {
        const a = r * ring + i
        const b = r * ring + ((i + 1) % ring)
        const c = a + ring
        const d = b + ring
        idx.push(a, b, c, b, d, c)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(p, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return this.add(g, slot, color)
  }

  build() {
    const merged = mergeGeometries(this.geos, false)
    for (const g of this.geos) g.dispose()
    merged.computeBoundingSphere()
    return merged
  }
}

// Catmull-Rom through [t, ...values] keys, sampled at u (0..1).
function sample(keys, u, col) {
  let i = 0
  while (i < keys.length - 2 && keys[i + 1][0] < u) i++
  const k0 = keys[Math.max(0, i - 1)]
  const k1 = keys[i]
  const k2 = keys[i + 1]
  const k3 = keys[Math.min(keys.length - 1, i + 2)]
  const t = Math.max(0, Math.min(1, (u - k1[0]) / (k2[0] - k1[0] || 1)))
  const a = k0[col]
  const b = k1[col]
  const c = k2[col]
  const d = k3[col]
  return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)
}

function wheel(kit, x, y, z, r, w, rim = '#b9b4e6') {
  kit.cyl(r, w, x, y, z, SLOT.tire, '#111114', 'z', 18)
  const s = Math.sign(z)
  kit.cyl(r * 0.66, w + 0.04, x, y, z, SLOT.rim, rim, 'z', 12)
  kit.cyl(r * 0.2, w + 0.08, x, y, z + s * 0.01, SLOT.chrome, '#e6e6f0', 'z', 8)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    kit.box(r * 0.5, 0.05, 0.05, x + Math.cos(a) * r * 0.32, y + Math.sin(a) * r * 0.32, z + s * (w / 2 + 0.02), SLOT.chrome, '#dcdce8', 0, 0, a)
  }
}

// --- Cars -------------------------------------------------------------------------------
// t: 0 nose .. 1 tail. body keys [t, top, bot, halfWidth]; cabin keys [t, roof, halfWidth].
const STYLES = {
  sedan: {
    L: 4.9, W: 1.08, r: 0.4, trackX: 0.31, n: 5,
    body: [[0, 0.72, 0.36, 0.84], [0.05, 0.84, 0.28, 0.98], [0.22, 0.94, 0.24, 1.04], [0.45, 1.0, 0.24, 1.06], [0.72, 1.04, 0.24, 1.06], [0.94, 1.02, 0.3, 1], [1, 0.84, 0.42, 0.84]],
    cabin: [[0, 0.98, 0.98], [0.22, 1.36, 0.9], [0.55, 1.56, 0.84], [0.8, 1.5, 0.84], [1, 1.04, 0.96]],
    cabinFrom: 0.28, cabinTo: 0.88, grille: 'kidney',
  },
  supra: {
    L: 4.8, W: 1.1, r: 0.4, trackX: 0.31, n: 4,
    body: [[0, 0.56, 0.34, 0.8], [0.05, 0.72, 0.26, 1], [0.24, 0.86, 0.24, 1.06], [0.46, 0.92, 0.24, 1.1], [0.72, 1.0, 0.24, 1.13], [0.93, 0.98, 0.3, 1.04], [1, 0.8, 0.42, 0.86]],
    cabin: [[0, 0.88, 0.96], [0.25, 1.26, 0.86], [0.55, 1.38, 0.78], [0.85, 1.14, 0.76], [1, 0.96, 0.9]],
    cabinFrom: 0.33, cabinTo: 0.9, grille: 'wide', ducktail: true,
  },
  muscle: {
    L: 5, W: 1.1, r: 0.42, trackX: 0.31, n: 6,
    body: [[0, 0.72, 0.36, 0.86], [0.05, 0.86, 0.28, 1.02], [0.2, 0.96, 0.24, 1.08], [0.45, 1.02, 0.24, 1.1], [0.74, 1.06, 0.24, 1.1], [0.94, 1.04, 0.3, 1.04], [1, 0.86, 0.42, 0.88]],
    cabin: [[0, 1.0, 0.98], [0.22, 1.36, 0.9], [0.55, 1.52, 0.84], [0.8, 1.44, 0.84], [1, 1.06, 0.96]],
    cabinFrom: 0.3, cabinTo: 0.86, grille: 'kidney', quads: true,
  },
  camaro: {
    L: 4.9, W: 1.14, r: 0.42, trackX: 0.32, n: 5,
    body: [[0, 0.66, 0.34, 0.86], [0.05, 0.82, 0.26, 1.04], [0.26, 0.96, 0.24, 1.12], [0.5, 1.0, 0.24, 1.14], [0.74, 1.04, 0.24, 1.16], [0.95, 1.0, 0.3, 1.08], [1, 0.82, 0.4, 0.9]],
    cabin: [[0, 0.98, 0.98], [0.25, 1.26, 0.86], [0.6, 1.36, 0.78], [0.85, 1.14, 0.8], [1, 1.02, 0.96]],
    cabinFrom: 0.34, cabinTo: 0.86, grille: 'wide', stripe: '#17171c',
  },
  gt: {
    L: 4.7, W: 1.1, r: 0.41, trackX: 0.31, n: 4,
    body: [[0, 0.54, 0.32, 0.82], [0.06, 0.72, 0.26, 1.02], [0.24, 0.84, 0.24, 1.08], [0.48, 0.88, 0.24, 1.08], [0.72, 1.02, 0.24, 1.14], [0.93, 1.02, 0.3, 1.08], [1, 0.84, 0.4, 0.88]],
    cabin: [[0, 0.84, 0.9], [0.25, 1.24, 0.8], [0.5, 1.36, 0.74], [0.8, 1.18, 0.74], [1, 0.98, 0.86]],
    cabinFrom: 0.3, cabinTo: 0.95, grille: 'none', wing: 'ducktail',
  },
  hyper: {
    L: 5, W: 1.16, r: 0.42, trackX: 0.31, n: 3.6,
    body: [[0, 0.46, 0.26, 0.86], [0.06, 0.6, 0.22, 1.08], [0.24, 0.72, 0.2, 1.1], [0.48, 0.8, 0.2, 1.12], [0.74, 0.96, 0.22, 1.18], [0.95, 0.94, 0.3, 1.1], [1, 0.74, 0.42, 0.9]],
    cabin: [[0, 0.72, 0.86], [0.28, 1.1, 0.74], [0.5, 1.2, 0.66], [0.8, 1.06, 0.62], [1, 0.9, 0.7]],
    cabinFrom: 0.3, cabinTo: 0.85, grille: 'intakes', wing: 'tall', sideIntake: true,
  },
  wedge: {
    L: 5, W: 1.14, r: 0.42, trackX: 0.31, n: 3,
    body: [[0, 0.42, 0.26, 0.92], [0.08, 0.58, 0.22, 1.08], [0.3, 0.74, 0.2, 1.1], [0.55, 0.84, 0.2, 1.14], [0.8, 0.92, 0.24, 1.14], [1, 0.82, 0.44, 0.94]],
    cabin: [[0, 0.66, 0.84], [0.3, 1.04, 0.72], [0.6, 1.14, 0.64], [0.85, 1.0, 0.66], [1, 0.86, 0.72]],
    cabinFrom: 0.26, cabinTo: 0.84, grille: 'intakes', sideIntake: true, wing: 'low',
  },
  mclaren: {
    L: 4.8, W: 1.14, r: 0.42, trackX: 0.31, n: 3.4,
    body: [[0, 0.5, 0.26, 0.84], [0.06, 0.62, 0.22, 1.04], [0.25, 0.76, 0.2, 1.08], [0.5, 0.82, 0.2, 1.1], [0.76, 0.98, 0.22, 1.16], [0.95, 0.92, 0.3, 1.06], [1, 0.72, 0.42, 0.86]],
    cabin: [[0, 0.76, 0.86], [0.3, 1.12, 0.74], [0.55, 1.22, 0.68], [0.82, 1.08, 0.64], [1, 0.9, 0.72]],
    cabinFrom: 0.3, cabinTo: 0.86, grille: 'intakes', sideIntake: true,
  },
  veyron: {
    L: 4.7, W: 1.16, r: 0.42, trackX: 0.31, n: 4,
    body: [[0, 0.58, 0.28, 0.82], [0.06, 0.74, 0.22, 1.02], [0.26, 0.86, 0.2, 1.1], [0.5, 0.9, 0.2, 1.14], [0.76, 1.02, 0.22, 1.16], [0.95, 0.98, 0.3, 1.04], [1, 0.8, 0.44, 0.84]],
    cabin: [[0, 0.8, 0.86], [0.26, 1.16, 0.76], [0.5, 1.24, 0.7], [0.8, 1.1, 0.7], [1, 0.92, 0.8]],
    cabinFrom: 0.3, cabinTo: 0.86, grille: 'horseshoe', sideIntake: true,
  },
}

function car(kit, style, paint) {
  const S = STYLES[style]
  const { L, W, r } = S
  const X = (t) => L / 2 - t * L
  const rows = 22
  const stations = []
  for (let i = 0; i <= rows; i++) {
    const u = i / rows
    stations.push({ x: X(u), top: sample(S.body, u, 1), bot: sample(S.body, u, 2), w: sample(S.body, u, 3) * W })
  }
  kit.skin(stations, SLOT.paint, paint, 16, S.n)

  // Greenhouse: a glass loft, then a painted roof panel a hair above it.
  const span = S.cabinTo - S.cabinFrom
  const glass = []
  const roof = []
  for (let i = 0; i <= 12; i++) {
    const u = i / 12
    const t = S.cabinFrom + u * span
    const top = sample(S.cabin, u, 1)
    const w = sample(S.cabin, u, 2) * W
    glass.push({ x: X(t), top, bot: sample(S.body, t, 1) - 0.14, w })
  }
  kit.skin(glass, SLOT.glass, '#7fd0f2', 14, 4)
  for (let i = 0; i <= 8; i++) {
    const u = 0.24 + (i / 8) * 0.56
    const t = S.cabinFrom + u * span
    const top = sample(S.cabin, u, 1) + 0.022
    roof.push({ x: X(t), top, bot: top - 0.09, w: sample(S.cabin, u, 2) * W * 0.9 })
  }
  kit.skin(roof, SLOT.paint, paint, 12, 6)
  // Pillars.
  const pillar = (u, tilt) => {
    const t = S.cabinFrom + u * span
    const roofY = sample(S.cabin, u, 1)
    const baseY = sample(S.body, t, 1)
    const w = sample(S.cabin, u, 2) * W
    for (const s of [-1, 1]) kit.box(0.09, roofY - baseY + 0.06, 0.08, X(t), (roofY + baseY) / 2, s * w * 0.95, SLOT.paint, paint, 0, 0, tilt)
  }
  pillar(0.17, -0.9)
  pillar(0.84, 0.75)

  // Wheels in dark arches.
  const wx = L * S.trackX
  const wz = W * 0.99
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.cyl(r * 1.24, 0.08, sx * wx, r + 0.02, sz * (wz - 0.02), SLOT.tire, '#08080a', 'z', 18)
      wheel(kit, sx * wx, r, sz * wz, r, 0.3)
    }
  }
  kit.box(L * 0.7, 0.14, W * 1.86, 0, 0.3, 0, SLOT.trim, '#121216')

  // Face.
  const noseX = X(0.005)
  const faceY = sample(S.body, 0.03, 1) - 0.13
  for (const s of [-1, 1]) {
    kit.box(0.46, 0.09, 0.32, noseX - 0.3, faceY + 0.02, s * W * 0.68, SLOT.head, '#ffffff', 0, s * 0.42, 0.3)
    kit.box(0.09, 0.16, W * 0.52, X(0.985), sample(S.body, 0.97, 1) - 0.18, s * W * 0.5, SLOT.tail, '#ff2018')
    kit.box(0.34, 0.08, 0.18, X(0.46), sample(S.body, 0.46, 1) + 0.16, s * W * 1.08, SLOT.paint, paint) // mirror
  }
  const lowY = sample(S.body, 0.02, 2) + 0.14
  kit.box(0.22, 0.18, W * 1.2, noseX - 0.02, lowY, 0, SLOT.trim, '#0c0c10')
  if (S.grille === 'kidney') for (const s of [-1, 1]) kit.box(0.14, 0.2, W * 0.42, noseX + 0.02, faceY - 0.02, s * W * 0.27, SLOT.trim, '#0c0c10')
  if (S.grille === 'wide') kit.box(0.14, 0.14, W * 1.04, noseX + 0.02, faceY - 0.05, 0, SLOT.trim, '#0c0c10')
  if (S.grille === 'intakes') for (const s of [-1, 1]) kit.box(0.18, 0.2, W * 0.56, noseX - 0.02, lowY + 0.08, s * W * 0.5, SLOT.trim, '#08080a')
  if (S.grille === 'horseshoe') {
    kit.box(0.16, 0.34, 0.5, noseX, faceY - 0.06, 0, SLOT.chrome, '#e6e6ee')
    kit.box(0.2, 0.26, 0.4, noseX + 0.01, faceY - 0.07, 0, SLOT.trim, '#08080a')
  }
  if (S.sideIntake) for (const s of [-1, 1]) kit.box(0.7, 0.22, 0.05, X(0.68), 0.6, s * W * 1.07, SLOT.trim, '#08080a')
  if (S.stripe) for (const s of [-1, 1]) {
    kit.box(1.4, 0.03, 0.34, X(0.18), sample(S.body, 0.2, 1) + 0.0, s * 0.26, SLOT.paint, S.stripe, 0, 0, -0.1)
    kit.box(1.0, 0.03, 0.34, X(0.92), sample(S.body, 0.9, 1) + 0.02, s * 0.26, SLOT.paint, S.stripe)
  }
  if (S.wing === 'tall') {
    kit.box(0.5, 0.06, W * 1.9, X(0.94), 1.42, 0, SLOT.trim, '#16161a', 0, 0, 0.12)
    for (const s of [-1, 1]) kit.box(0.24, 0.5, 0.06, X(0.92), 1.2, s * W * 0.62, SLOT.trim, '#16161a')
  }
  if (S.wing === 'low') kit.box(0.42, 0.06, W * 1.84, X(0.96), 1.04, 0, SLOT.paint, paint, 0, 0, 0.16)
  if (S.ducktail || S.wing === 'ducktail') kit.box(0.3, 0.06, W * 1.74, X(0.97), sample(S.body, 0.96, 1) + 0.05, 0, SLOT.paint, paint, 0, 0, 0.24)
  if (S.quads) for (const s of [-1, 1]) for (const q of [0.3, 0.56]) kit.cyl(0.07, 0.2, X(1) - 0.02, 0.44, s * W * q, SLOT.chrome, '#d8d8e0', 'x', 10)
  return { L, W, H: sample(S.cabin, 0.55, 1) }
}

// --- Machines ----------------------------------------------------------------------------
function forklift(kit, paint) {
  const dark = '#1c1c20'
  kit.box(2.5, 0.72, 1.7, -0.25, 0.86, 0, SLOT.paint, paint)
  kit.box(1.1, 0.9, 1.6, -0.9, 1.5, 0, SLOT.paint, paint)
  for (const s of [-1, 1]) {
    wheel(kit, 0.72, 0.52, s * 0.86, 0.52, 0.42, '#d8a23a')
    wheel(kit, -1.1, 0.4, s * 0.8, 0.4, 0.34, '#d8a23a')
    // Roll cage.
    kit.box(0.09, 1.9, 0.09, 0.42, 2.1, s * 0.74, SLOT.trim, dark)
    kit.box(0.09, 2.1, 0.09, -1.28, 2.2, s * 0.74, SLOT.trim, dark)
  }
  kit.box(1.86, 0.08, 1.6, -0.43, 3.08, 0, SLOT.trim, dark)
  for (let i = 0; i < 6; i++) kit.box(0.06, 0.04, 1.5, -1.2 + i * 0.32, 3.14, 0, SLOT.trim, dark)
  kit.box(0.5, 0.5, 0.9, -0.5, 1.45, 0, SLOT.trim, dark) // seat
  kit.box(0.08, 0.5, 0.08, 0.1, 1.5, 0, SLOT.steel, '#777') // steering
  kit.cyl(0.2, 0.05, 0.05, 1.76, 0, SLOT.tire, '#111', 'y')
  // Mast and forks.
  for (const s of [-1, 1]) {
    kit.box(0.14, 3.5, 0.14, 1.12, 1.78, s * 0.54, SLOT.steel, '#2a2a30')
    kit.box(0.14, 3, 0.14, 1.28, 1.6, s * 0.34, SLOT.steel, '#3a3a42')
    kit.box(1.5, 0.08, 0.16, 2.1, 0.42, s * 0.42, SLOT.steel, '#cfcfd8')
    kit.box(0.08, 0.9, 0.16, 1.38, 0.82, s * 0.42, SLOT.steel, '#cfcfd8')
  }
  for (let i = 0; i < 4; i++) kit.box(0.08, 0.1, 1.4, 1.36, 0.8 + i * 0.3, 0, SLOT.trim, dark)
  kit.box(0.1, 0.1, 1.2, 1.2, 3.46, 0, SLOT.steel, '#2a2a30')
  kit.box(0.12, 0.12, 0.2, 0.44, 3.1, 0.5, SLOT.amber, '#ffa030')
  return { L: 4.2, W: 1.1, H: 3.5 }
}

function chopper(kit, paint) {
  const chrome = '#d8d8e4'
  wheel(kit, 1.5, 0.52, 0, 0.52, 0.2, '#28282e')
  wheel(kit, -1.5, 0.6, 0, 0.6, 0.42, '#28282e')
  kit.box(1.2, 0.5, 0.42, -0.1, 0.92, 0, SLOT.chrome, '#505058') // engine
  for (const s of [-1, 1]) {
    kit.cyl(0.13, 0.5, -0.05, 1.3, s * 0.18, SLOT.chrome, chrome, 'y', 10)
    kit.cyl(0.08, 1.9, -1.0, 0.62, s * 0.3, SLOT.chrome, chrome, 'x', 8)
    kit.box(1.5, 0.06, 0.06, 1.05, 1.5, s * 0.14, SLOT.chrome, chrome, 0, 0, -0.72) // fork
    kit.box(0.5, 0.05, 0.05, 0.72, 2.12, s * 0.5, SLOT.chrome, chrome, 0, s * 0.3, 0)
    kit.box(1, 0.05, 0.05, -1.2, 0.86, s * 0.26, SLOT.chrome, chrome, 0, 0, 0.3)
  }
  const tank = kit.skin([
    { x: 0.5, top: 1.62, bot: 1.3, w: 0.2 },
    { x: 0.1, top: 1.7, bot: 1.26, w: 0.28 },
    { x: -0.4, top: 1.56, bot: 1.24, w: 0.24 },
    { x: -0.8, top: 1.36, bot: 1.2, w: 0.14 },
  ], SLOT.paint, paint, 12, 2.4)
  void tank
  kit.box(1.1, 0.14, 0.44, -1.0, 1.28, 0, SLOT.trim, '#120f0c') // seat
  kit.box(1.1, 0.18, 0.5, -1.45, 1.14, 0, SLOT.paint, paint, 0, 0, 0.1) // fender
  kit.box(0.6, 0.1, 0.36, 1.46, 1.1, 0, SLOT.paint, paint)
  // The skull lamp.
  kit.ball(0.36, 0.86, 1.98, 0, SLOT.bone, '#e5dfcd', 1.05, 1, 0.95)
  kit.box(0.2, 0.26, 0.42, 0.98, 1.74, 0, SLOT.bone, '#d9d2bd')
  for (const s of [-1, 1]) kit.ball(0.11, 1.17, 2.0, s * 0.15, SLOT.trim, '#0a0a0c')
  kit.box(0.1, 0.12, 0.1, 1.2, 1.86, 0, SLOT.trim, '#0a0a0c')
  for (let i = -2; i <= 2; i++) kit.box(0.05, 0.1, 0.04, 1.12, 1.68, i * 0.08, SLOT.trim, '#0a0a0c')
  return { L: 4.2, W: 0.62, H: 2.3 }
}

function firetruck(kit, paint) {
  const white = '#f1f1f4'
  kit.box(2.1, 2.1, 2.3, 2.4, 1.72, 0, SLOT.paint, paint)
  kit.box(0.08, 0.92, 2, 3.47, 2.14, 0, SLOT.glass, '#6fc0ea')
  kit.box(1.4, 0.74, 0.06, 2.46, 2.2, 1.16, SLOT.glass, '#6fc0ea')
  kit.box(1.4, 0.74, 0.06, 2.46, 2.2, -1.16, SLOT.glass, '#6fc0ea')
  kit.box(5.2, 1.9, 2.3, -1.3, 1.82, 0, SLOT.paint, paint)
  kit.box(7.4, 0.32, 2.34, 0.3, 1.2, 0, SLOT.paint, '#f6d21f')
  kit.box(7.4, 0.5, 2.1, 0.3, 0.72, 0, SLOT.trim, '#1a1a1e')
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) kit.box(0.9, 1.1, 0.05, -3.2 + i * 1.02, 2.0, s * 1.17, SLOT.steel, '#c8c8d2')
  // Ladder and roof gear.
  kit.box(5.6, 0.18, 1.3, -1, 3.02, 0, SLOT.steel, '#b8b8c4')
  for (const s of [-1, 1]) kit.box(6.6, 0.12, 0.1, -0.7, 3.42, s * 0.5, SLOT.chrome, white, 0, 0, 0.05)
  for (let i = 0; i < 12; i++) kit.box(0.08, 0.08, 1, -3.7 + i * 0.54, 3.42 + i * 0.027, 0, SLOT.chrome, white)
  kit.box(1.6, 0.14, 0.6, 2.4, 2.9, 0, SLOT.tail, '#ff2a20')
  kit.box(0.5, 0.16, 0.4, 2.4, 2.98, 0.72, SLOT.head, '#88aaff')
  kit.box(0.2, 0.34, 2.4, 3.52, 0.76, 0, SLOT.chrome, white)
  for (const s of [-1, 1]) {
    kit.box(0.08, 0.28, 0.4, 3.48, 1.14, s * 0.84, SLOT.head, '#ffffff')
    wheel(kit, 2.3, 0.56, s * 1.1, 0.56, 0.42)
    wheel(kit, -2.3, 0.56, s * 1.1, 0.56, 0.42)
    wheel(kit, -3.3, 0.56, s * 1.1, 0.56, 0.42)
  }
  return { L: 7.4, W: 1.18, H: 3.5 }
}

function loader(kit, paint) {
  const black = '#16161a'
  kit.box(3.4, 1.1, 1.9, -0.5, 1.5, 0, SLOT.paint, paint)
  kit.box(1.5, 1.3, 1.5, -0.3, 2.68, 0, SLOT.glass, '#3a4a56')
  kit.box(1.8, 0.14, 1.8, -0.3, 3.4, 0, SLOT.paint, paint)
  for (const s of [-1, 1]) {
    for (const px of [1.1, -1.5]) {
      kit.cyl(0.86, 0.64, px, 0.86, s * 1.14, SLOT.tire, black, 'z', 18)
      kit.cyl(0.46, 0.68, px, 0.86, s * 1.14, SLOT.rim, '#e8b220', 'z', 10)
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2
        kit.box(0.2, 0.1, 0.66, px + Math.cos(a) * 0.86, 0.86 + Math.sin(a) * 0.86, s * 1.14, SLOT.tire, black, 0, 0, a)
      }
    }
    kit.box(2.6, 0.2, 0.2, 2.1, 1.7, s * 0.72, SLOT.paint, paint, 0, 0, -0.42) // lift arm
  }
  kit.box(0.74, 1.2, 2.5, 3.2, 0.82, 0, SLOT.steel, '#6a6a72', 0, 0, 0.2)
  kit.box(0.92, 0.12, 2.5, 3.64, 0.3, 0, SLOT.chrome, '#c0c0c8')
  kit.cyl(0.12, 1, -1.5, 2.6, 0.6, SLOT.chrome, '#55555c', 'y', 8)
  kit.box(0.14, 0.14, 0.2, -0.3, 3.56, 0, SLOT.amber, '#ffa030')
  return { L: 6, W: 1.46, H: 3.6 }
}

function tank(kit, paint) {
  const dark = '#23271a'
  kit.box(6.6, 0.9, 2.8, 0, 1.18, 0, SLOT.paint, paint)
  kit.box(1.6, 0.6, 2.7, 3.3, 1, 0, SLOT.paint, paint, 0, 0, -0.5)
  for (const s of [-1, 1]) {
    kit.box(6.8, 1.02, 0.66, 0, 0.56, s * 1.42, SLOT.tire, '#121214')
    for (let i = 0; i < 7; i++) kit.cyl(0.4, 0.7, -2.7 + i * 0.9, 0.46, s * 1.42, SLOT.rim, '#3a3f2d', 'z', 12)
    kit.box(6.9, 0.1, 0.8, 0, 1.14, s * 1.42, SLOT.paint, paint)
  }
  kit.cyl(1.32, 0.86, -0.2, 2.02, 0, SLOT.paint, paint, 'y', 16, 1.14)
  kit.cyl(0.13, 4.4, 3.5, 2.08, 0, SLOT.steel, dark, 'x', 10)
  kit.cyl(0.2, 0.5, 5.6, 2.08, 0, SLOT.steel, dark, 'x', 10)
  kit.cyl(0.3, 0.24, -0.5, 2.54, 0.5, SLOT.paint, paint, 'y', 10)
  kit.box(0.05, 2, 0.05, -1.1, 3.2, -0.6, SLOT.trim, '#111', 0, 0, 0.1)
  return { L: 6.8, W: 1.76, H: 2.6 }
}

function heli(kit, paint) {
  kit.skin([
    { x: 2.5, top: 1.5, bot: 1.1, w: 0.4 },
    { x: 2.1, top: 2.1, bot: 0.8, w: 0.78 },
    { x: 1.0, top: 2.5, bot: 0.66, w: 0.96 },
    { x: -0.4, top: 2.5, bot: 0.74, w: 0.92 },
    { x: -1.5, top: 2.2, bot: 1.3, w: 0.5 },
    { x: -2.6, top: 2.05, bot: 1.76, w: 0.16 },
    { x: -4.6, top: 2.0, bot: 1.86, w: 0.1 },
  ], SLOT.paint, paint, 14, 3)
  kit.skin([
    { x: 2.45, top: 1.86, bot: 1.18, w: 0.36 },
    { x: 2.1, top: 2.32, bot: 1.04, w: 0.76 },
    { x: 1.2, top: 2.52, bot: 1.1, w: 0.92 },
    { x: 0.7, top: 2.36, bot: 1.2, w: 0.92 },
  ], SLOT.glass, '#6fb6dc', 14, 3)
  kit.box(1.2, 0.3, 0.6, -0.2, 2.62, 0, SLOT.trim, '#16161c')
  kit.cyl(0.08, 0.4, 0, 2.9, 0, SLOT.steel, '#777', 'y', 8)
  for (const a of [0.4, 1.97, 3.54, 5.11]) kit.box(3.2, 0.04, 0.24, Math.cos(a) * 1.62, 3.08, Math.sin(a) * 1.62, SLOT.trim, '#121216', 0, -a, 0)
  kit.box(0.9, 1, 0.08, -4.6, 2.4, 0, SLOT.paint, paint, 0, 0, 0.3)
  for (const a of [0, 1.57]) kit.box(0.08, 1.3, 0.08, -4.66, 2.4, 0.14, SLOT.trim, '#121216', a, 0, 0)
  for (const s of [-1, 1]) {
    kit.box(3.6, 0.1, 0.1, 0.5, 0.06, s * 0.96, SLOT.steel, '#2a2a30')
    kit.box(0.08, 0.72, 0.08, 1.4, 0.4, s * 0.9, SLOT.steel, '#2a2a30', 0.2 * s)
    kit.box(0.08, 0.72, 0.08, -0.4, 0.4, s * 0.9, SLOT.steel, '#2a2a30', 0.2 * s)
    kit.box(1.5, 0.18, 0.04, 0, 1.5, s * 0.92, SLOT.bone, '#e4e4ea')
  }
  return { L: 7, W: 1, H: 3.1 }
}

function bat(kit, paint) {
  const S = car(kit, 'wedge', paint)
  const shard = (x, z, w, d, rot, y = 1.1) => kit.box(w, 0.1, d, x, y, z, SLOT.paint, paint, 0, rot, 0)
  for (const s of [-1, 1]) {
    shard(-1.1, s * 1.5, 2.4, 0.5, s * 0.5, 1.2)
    shard(-1.6, s * 2.2, 1.7, 0.42, s * 0.82, 1.42)
    shard(-2.1, s * 2.7, 1.1, 0.34, s * 1.1, 1.6)
    kit.box(1.6, 1.2, 0.08, -2.1, 1.5, s * 0.6, SLOT.paint, paint, 0, 0, 0.5)
  }
  return S
}

const BUILDERS = {
  forklift, chopper, firetruck, loader, tank, heli, bat,
  sedan: (k, p) => car(k, 'sedan', p),
  supra: (k, p) => car(k, 'supra', p),
  muscle: (k, p) => car(k, 'muscle', p),
  camaro: (k, p) => car(k, 'camaro', p),
  gt: (k, p) => car(k, 'gt', p),
  hyper: (k, p) => car(k, 'hyper', p),
  wedge: (k, p) => car(k, 'wedge', p),
  mclaren: (k, p) => car(k, 'mclaren', p),
  veyron: (k, p) => car(k, 'veyron', p),
}

// Models are authored at 4.9 m a car; the bays want them a size up.
const MODEL_SCALE = 1.18

// Model cache: same type + paint shares one geometry until something dents it.
const cache = new Map()
export function vehicleModel(type, paint) {
  const key = `${type}|${paint}`
  let m = cache.get(key)
  if (m) return m
  const kit = new Kit(paint)
  const dims = BUILDERS[type](kit, paint)
  const geometry = kit.build()
  geometry.scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE)
  geometry.computeBoundingSphere()
  const [L, W, H] = [dims.L, dims.W, dims.H].map((v) => v * MODEL_SCALE)
  const bodyH = type === 'forklift' ? 1.9 * MODEL_SCALE : H
  m = { type, paint, geometry, L, W, H, hx: L / 2, hy: bodyH / 2, hz: W, cy: bodyH / 2 }
  cache.set(key, m)
  return m
}

// A movable instance: `root` (bound to a rigid body at its centre) -> `mesh` (y offset to
// the wheels). Locked and variant bays pass their own material.
export function makeVehicle(model, material = sharedMaterial()) {
  const root = new Group()
  const mesh = new Mesh(model.geometry, material)
  mesh.position.y = -model.cy
  mesh.castShadow = true
  mesh.receiveShadow = true
  root.add(mesh)
  return { root, mesh, model }
}

// White inverted hull around a held vehicle.
const outlineMat = new MeshBasicMaterial({ color: '#ffffff', side: BackSide })
export function makeOutline(model) {
  const m = new Mesh(model.geometry, outlineMat)
  m.position.y = -model.cy
  const s = 1.045
  m.scale.set(s, s + 0.02, s + 0.02)
  return m
}

// --- Crumple -------------------------------------------------------------------------------
// Pushes the skin in around a local impact point. Works on a private copy of the geometry;
// the jitter is a function of the original position, so neighbouring triangles stay joined.
const hash = (x, y, z) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
  return s - Math.floor(s) - 0.5
}
const ab = new Vector3()
const ac = new Vector3()
const nrm = new Vector3()
export function crumple(vehicle, lx, ly, lz, dirX, dirY, dirZ, radius, depth) {
  const { mesh } = vehicle
  if (!vehicle.ownGeometry) {
    mesh.geometry = mesh.geometry.clone()
    vehicle.ownGeometry = true
  }
  const p = mesh.geometry.attributes.position
  const n = mesh.geometry.attributes.normal
  const a = p.array
  const y0 = -mesh.position.y
  const moved = new Uint8Array(p.count)
  for (let i = 0; i < p.count; i++) {
    const vx = a[i * 3]
    const vy = a[i * 3 + 1]
    const vz = a[i * 3 + 2]
    const d = Math.hypot(vx - lx, vy - (ly + y0), vz - lz)
    if (d > radius) continue
    const k = 1 - d / radius
    const f = k * k * (3 - 2 * k) * depth
    const j = hash(Math.round(vx * 7), Math.round(vy * 7), Math.round(vz * 7))
    const j2 = hash(Math.round(vz * 7), Math.round(vx * 7), Math.round(vy * 7))
    a[i * 3] += dirX * f * (1 + j) + j2 * f * 0.5
    a[i * 3 + 1] += dirY * f * (1 + j2) + j * f * 0.6
    a[i * 3 + 2] += dirZ * f * (1 + j) + j * j2 * f * 1.4
    moved[i] = 1
  }
  // Faceted shading where the metal folded.
  for (let t = 0; t + 2 < p.count; t += 3) {
    if (!(moved[t] || moved[t + 1] || moved[t + 2])) continue
    ab.set(a[(t + 1) * 3] - a[t * 3], a[(t + 1) * 3 + 1] - a[t * 3 + 1], a[(t + 1) * 3 + 2] - a[t * 3 + 2])
    ac.set(a[(t + 2) * 3] - a[t * 3], a[(t + 2) * 3 + 1] - a[t * 3 + 1], a[(t + 2) * 3 + 2] - a[t * 3 + 2])
    nrm.crossVectors(ab, ac).normalize()
    for (let v = 0; v < 3; v++) n.setXYZ(t + v, nrm.x, nrm.y, nrm.z)
  }
  p.needsUpdate = true
  n.needsUpdate = true
}
