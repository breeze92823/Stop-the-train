import {
  CanvasTexture,
  DodecahedronGeometry,
  DoubleSide,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  BoxGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three'
import { GYM, LOBBY, SET, TRACK, YARD } from './config.js'
import { RAPIER, addFixed } from './physics.js'
import { bake } from './bake.js'
import { buildVoxels } from './voxels.js'
import { mulberry32, paintLego, paintPlanet, paintRings, paintTerrace, toTexture } from './textures.js'
import { onTheme, themeColors, themeMaterial } from './theme.js'

// The ground of the lobby: the studded lawn, the checkered terraces walling it in,
// the two purple tunnel mountains the railway runs through, the rails, the spawn
// plaza and the yard markings. Everything here is static; the set pieces standing
// on it are in lobby.js.

const legoTex = { top: null, side: null }
function legoMaterials() {
  const white = paintLego({ a: '#ffffff', b: '#f1f1f1', size: 256, perCell: 4, ring: 0.14, lit: 0.2 })
  const terrace = paintTerrace()
  const metres = 1 / 6
  legoTex.top = new MeshLambertMaterial({
    map: toTexture(white.color, { repeat: metres, srgb: true }),
    vertexColors: true,
  })
  const sideMap = toTexture(terrace.color, { repeat: 1 / 6, srgb: true })
  // A touch of self-light: walls facing away from the sun stay as warm as the reference's.
  legoTex.side = new MeshLambertMaterial({ map: sideMap, emissive: '#ffffff', emissiveMap: sideMap, emissiveIntensity: 0.3 })
  themeMaterial(legoTex.side, 'terraceWall', (look) => {
    const map = toTexture(paintTerrace(look).color, { repeat: 1 / 6, srgb: true })
    return { map, emissiveMap: map }
  })
  // Bands of the terrace use the plain top material: their tint comes from vertex colours.
  return legoTex
}

// --- Terrace shape -----------------------------------------------------------------
// Layers of blocks at a world point; blocky chunks climbing away from the lawn.
const chunkNoise = (x, z, seed) => {
  const a = Math.sin(Math.floor(x) * 127.1 + Math.floor(z) * 311.7 + seed) * 43758.5453
  return a - Math.floor(a)
}
export function terraceLayers(x, z) {
  const { west, east, north, south } = LOBBY
  const d = Math.max(west - x, x - east, north - z, z - south)
  if (d <= 0) return 0
  const n = chunkNoise(x / 24, z / 24, 1)
  const m = chunkNoise(x / 12, z / 12, 7)
  if (d < 18) return 5 + (n > 0.62 ? 1 : 0) + (m > 0.82 ? -1 : 0)
  if (d < 42) return 7 + (n > 0.5 ? 1 : 0)
  if (d < 70) return 9 + (m > 0.5 ? 1 : 0)
  return 11
}
export const terraceTop = (x, z) => terraceLayers(x, z) * LOBBY.terraceStep

function tunnelCorridor(x, z, y) {
  return Math.abs(x) > TRACK.mouth - 1 && Math.abs(z - TRACK.z) < 4.8 && y < 8.6
}

function buildTerraces(root, mats) {
  const { terraceCell: c, terraceStep: h } = LOBBY
  const ox = LOBBY.west - 170
  const oz = LOBBY.north - 170
  const nx = Math.ceil((LOBBY.east - LOBBY.west + 340) / c)
  const nz = Math.ceil((LOBBY.south - LOBBY.north + 340) / c)
  const center = (i, k) => [ox + (i + 0.5) * c, oz + (k + 0.5) * c]
  const layers = new Int8Array(nx * nz)
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const [x, z] = center(i, k)
      layers[k * nx + i] = terraceLayers(x, z)
    }
  }
  const [tops, sides] = buildVoxels({
    nx,
    ny: 12,
    nz,
    cell: [c, h, c],
    origin: [ox, 0, oz],
    materials: 2,
    cap: 1.1,
    solid: (i, j, k) => {
      if (j >= layers[k * nx + i]) return false
      const [x, z] = center(i, k)
      return !tunnelCorridor(x, z, j * h)
    },
    paint: (i, j, k, face, band) => {
      if (face === 'side' && band === 'body') return { mat: 1, color: '#ffffff' }
      const n = chunkNoise(i * 0.5, k * 0.5, 3)
      return { mat: 0, color: n > 0.5 ? '#35c95f' : '#2fbd56' }
    },
  })
  const t = new Mesh(themeColors(tops, 'terraceTop'), mats.top)
  const s = new Mesh(sides, mats.side)
  t.receiveShadow = s.receiveShadow = true
  root.add(t, s)
}

// --- Tunnel mountains ---------------------------------------------------------------
function buildMountain(root, mats, sign) {
  const cell = 1.5
  const depth = 46
  const halfZ = 26
  const height = 22
  const nx = Math.ceil(depth / cell)
  const ny = Math.ceil(height / cell)
  const nz = Math.ceil((halfZ * 2) / cell)
  const rand = mulberry32(sign > 0 ? 41 : 97)
  const jag = new Float32Array(nx * nz)
  for (let i = 0; i < jag.length; i++) jag[i] = rand()
  const ox = sign > 0 ? TRACK.mouth : -TRACK.mouth - nx * cell
  const oz = TRACK.z - halfZ
  const heightAt = (i, k) => {
    const depthIn = sign > 0 ? i * cell : (nx - 1 - i) * cell
    const off = Math.abs((k + 0.5) * cell - halfZ)
    const front = 10 + depthIn * 2.1 // leans back from the mouth
    const shoulder = (halfZ - off) * 1.25 + 2
    const peak = 19 - off * 0.08
    return Math.min(front, shoulder, peak) + (jag[k * nx + i] - 0.5) * 2.4
  }
  const carved = (i, j, k) => {
    const off = Math.abs((k + 0.5) * cell - halfZ)
    const y = j * cell
    const seed = jag[(k * nx + j * 7) % jag.length]
    return off < 4.3 + seed * 0.6 && y < 7.6 + seed * 1.2 - off * 0.05
  }
  const solid = (i, j, k) => (j + 0.5) * cell < heightAt(i, k) && !carved(i, j, k)
  const [geo] = buildVoxels({
    nx,
    ny,
    nz,
    cell: [cell, cell, cell],
    origin: [ox, 0, oz],
    solid,
    paint: (i, j, k, face, _b, dx, dz) => {
      const ni = i + (dx ?? 0)
      const nk = k + (dz ?? 0)
      if (ni >= 0 && nk >= 0 && ni < nx && nk < nz && carved(ni, j, nk)) return { mat: 0, color: '#04040a' }
      if (face === 'bottom') return { mat: 0, color: '#04040a' }
      const shade = jag[k * nx + i]
      if (face === 'top') return { mat: 0, color: shade > 0.5 ? '#8f88ee' : '#857de6' }
      return { mat: 0, color: shade > 0.5 ? '#6a62d6' : '#5f57c9' }
    },
  })
  const m = new Mesh(themeColors(geo, 'mountain'), mats.top)
  m.castShadow = m.receiveShadow = true
  root.add(m)
  const floor = new Mesh(new PlaneGeometry(depth, 11), new MeshBasicMaterial({ color: '#06060c' }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(sign * (TRACK.mouth + depth / 2 + 0.6), 0.02, TRACK.z)
  root.add(floor)
  // The far end of the bore: the train slips out of the dark through this.
  const plate = new Mesh(new PlaneGeometry(20, 16), new MeshBasicMaterial({ color: '#000000', fog: false }))
  plate.position.set(sign * (TRACK.mouth + depth - 4), 7, TRACK.z)
  plate.rotation.y = -sign * Math.PI * 0.5
  root.add(plate)
}

// --- Railway ------------------------------------------------------------------------
function buildTrack(root) {
  const count = Math.ceil((TRACK.end * 2) / TRACK.tieEvery)
  const tieGeo = new BoxGeometry(0.62, 0.16, TRACK.tieLength)
  const tieMat = themeMaterial(new MeshStandardMaterial({ roughness: 0.8, color: '#ffffff' }), 'ties')
  const ties = new InstancedMesh(tieGeo, tieMat, count)
  const rand = mulberry32(5)
  const m = new Matrix4()
  const tone = new MeshBasicMaterial().color
  for (let i = 0; i < count; i++) {
    m.makeTranslation(-TRACK.end + i * TRACK.tieEvery, 0.08, TRACK.z + (rand() - 0.5) * 0.08)
    ties.setMatrixAt(i, m)
    ties.setColorAt(i, tone.set(i % 3 === 0 ? '#d7824a' : i % 3 === 1 ? '#c8703b' : '#bc6535'))
  }
  ties.castShadow = false
  ties.receiveShadow = true
  root.add(ties)

  // A rail is an I-beam: foot, web and a polished head.
  const steel = new MeshStandardMaterial({ color: '#a7a3bd', metalness: 0.75, roughness: 0.34 })
  const shiny = new MeshStandardMaterial({ color: '#d9d7e6', metalness: 0.9, roughness: 0.2 })
  const L = TRACK.end * 2
  for (const side of [-1, 1]) {
    const z = TRACK.z + (side * TRACK.gauge) / 2
    const foot = new Mesh(new BoxGeometry(L, 0.04, 0.3), steel)
    foot.position.set(0, 0.18, z)
    const web = new Mesh(new BoxGeometry(L, 0.08, 0.1), steel)
    web.position.set(0, 0.23, z)
    const head = new Mesh(new BoxGeometry(L, 0.07, 0.2), shiny)
    head.position.set(0, 0.268, z)
    foot.castShadow = head.castShadow = true
    foot.receiveShadow = head.receiveShadow = true
    root.add(foot, web, head)
  }
}

// --- Painted lawn markings ------------------------------------------------------------
function decalTexture(draw, w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new CanvasTexture(c)
  t.magFilter = NearestFilter
  t.generateMipmaps = false
  t.minFilter = NearestFilter
  return t
}

function flat(root, w, d, x, z, mat, y = 0.012, yaw = 0) {
  const m = new Mesh(new PlaneGeometry(w, d), mat)
  m.rotation.set(-Math.PI / 2, 0, yaw)
  m.position.set(x, y, z)
  m.receiveShadow = true
  root.add(m)
  return m
}

function chevronTexture(color) {
  return decalTexture((ctx) => {
    // Pixel-stepped arrow pointing up the canvas (north).
    ctx.fillStyle = color
    for (let i = 0; i < 7; i++) {
      ctx.fillRect(14 - i * 2, 4 + i * 2, 4, 6)
      ctx.fillRect(14 + i * 2, 4 + i * 2, 4, 6)
    }
  }, 32, 32)
}

function buildChevrons(root) {
  const { x, zFrom, zTo, count } = SET.chevrons
  const mat = new MeshLambertMaterial({ map: chevronTexture('#04572c'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  themeMaterial(mat, 'chevron', (look) => ({ map: chevronTexture(look.arrow) }))
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0
    flat(root, 6, 6, x, zFrom + (zTo - zFrom) * t, mat)
  }
}

function dashedLine(root, x0, z0, x1, z1, mat, dash = 1.5, gap = 1.1, width = 0.26) {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const n = Math.floor(len / (dash + gap))
  const yaw = Math.atan2(-(x1 - x0), -(z1 - z0))
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    flat(root, width, dash, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, mat, 0.02, yaw)
  }
}
export function dashedRect(root, x0, z0, x1, z1, mat, opts = {}) {
  dashedLine(root, x0, z0, x1, z0, mat, opts.dash, opts.gap, opts.width)
  dashedLine(root, x1, z0, x1, z1, mat, opts.dash, opts.gap, opts.width)
  dashedLine(root, x1, z1, x0, z1, mat, opts.dash, opts.gap, opts.width)
  dashedLine(root, x0, z1, x0, z0, mat, opts.dash, opts.gap, opts.width)
}

function buildYardMarkings(root) {
  const white = new MeshBasicMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -2 })
  const black = themeMaterial(new MeshBasicMaterial({ color: '#0a0a0c', polygonOffset: true, polygonOffsetFactor: -2 }), 'bayLine')
  const b = YARD.border
  dashedRect(root, b.x0, b.z0, b.x1, b.z1, white, { dash: 1.8, gap: 1.3, width: 0.3 })
  const { width: W, length: L, line } = YARD.bay
  for (const row of YARD.rows) {
    row.bays.forEach((_, i) => {
      const x = row.x - i * row.step
      flat(root, W + line, line, x, row.z - L / 2, black, 0.02)
      flat(root, W + line, line, x, row.z + L / 2, black, 0.02)
      flat(root, line, L, x - W / 2, row.z, black, 0.02)
      flat(root, line, L, x + W / 2, row.z, black, 0.02)
    })
  }
}

function buildGymMarkings(root) {
  const white = new MeshBasicMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -2 })
  const black = themeMaterial(new MeshBasicMaterial({ color: '#0a0a0c', polygonOffset: true, polygonOffsetFactor: -2 }), 'bayLine')
  const b = GYM.border
  dashedRect(root, b.x0, b.z0, b.x1, b.z1, white, { dash: 1.8, gap: 1.3, width: 0.3 })
  const { width: W, length: L, line } = GYM.bay
  for (const cfg of GYM.benches) {
    const x = GYM.firstX + cfg.slot * GYM.step
    const z = GYM.rows[cfg.row].z
    flat(root, W + line, line, x, z - L / 2, black, 0.02)
    flat(root, W + line, line, x, z + L / 2, black, 0.02)
    flat(root, line, L, x - W / 2, z, black, 0.02)
    flat(root, line, L, x + W / 2, z, black, 0.02)
  }
}

function buildPlaza(root) {
  const { x0, x1, z0, z1, height, pad } = SET.plaza
  const lego = paintLego({ a: '#7c72d6', b: '#958bea', size: 512, perCell: 4, strength: 2.6, ring: 0.2, lit: 0.22 })
  const w = x1 - x0
  const d = z1 - z0
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const tile = 5.6 // a 2x2 checker of 2.8 m cells
  const box = (bw, bh, bd, y, mats) => {
    const m = new Mesh(new BoxGeometry(bw, bh, bd), mats)
    m.position.set(cx, y, cz)
    m.receiveShadow = true
    root.add(m)
    return m
  }
  const topTex = toTexture(lego.color, { srgb: true, anisotropy: 16 })
  const nrm = toTexture(lego.normal)
  topTex.repeat.set(w / tile, d / tile)
  nrm.repeat.set(w / tile, d / tile)
  const top = new MeshLambertMaterial({ map: topTex, normalMap: nrm })
  const edge = new MeshLambertMaterial({ color: '#4c42b0' })
  const lilac = new MeshLambertMaterial({ color: '#c9b6f5' })
  box(w + 1.3, 0.08, d + 1.3, 0.04, lilac) // the pale outer lip
  box(w + 0.5, 0.2, d + 0.5, 0.1, edge)
  box(w, height, d, height / 2, [edge, edge, top, edge, edge, edge])

  // The spawn pad: a dark inlay inside a raised lilac frame.
  const fh = 0.16
  const rim = new MeshLambertMaterial({ color: '#5a4fbf' })
  const pale = new MeshLambertMaterial({ color: '#bfaef2' })
  const padMat = new MeshLambertMaterial({ color: '#3a3478' })
  const pz = (z0 + z1) / 2
  const frame = (size, t, mat, y, h) => {
    for (const [fx, fz, sx, sz] of [[0, -size / 2, size + t, t], [0, size / 2, size + t, t], [-size / 2, 0, t, size], [size / 2, 0, t, size]]) {
      const m = new Mesh(new BoxGeometry(sx, h, sz), mat)
      m.position.set(cx + fx, y, pz + fz)
      m.receiveShadow = true
      root.add(m)
    }
  }
  frame(pad + 1.1, 0.5, rim, height + fh / 2, fh)
  frame(pad, 0.14, pale, height + 0.02, 0.05)
  const inlay = new Mesh(new BoxGeometry(pad, 0.03, pad), padMat)
  inlay.position.set(cx, height + 0.01, pz)
  inlay.receiveShadow = true
  root.add(inlay)
  addFixed(RAPIER.ColliderDesc.cuboid(w / 2, height / 2, d / 2), { x: cx, y: height / 2, z: cz })
}

// The whole static lobby.
export function buildGround(root) {
  const lawn = paintLego({ a: '#0fbb60', b: '#19c86d', size: 512, perCell: 4, strength: 2.2, ring: 0.22, lit: 0.22 })
  const size = LOBBY.groundSize
  const rep = size / LOBBY.tile
  const colorMap = toTexture(lawn.color, { repeat: rep, srgb: true, anisotropy: 16 })
  const normalMap = toTexture(lawn.normal, { repeat: rep, anisotropy: 16 })
  const ground = new Mesh(new PlaneGeometry(size, size), new MeshLambertMaterial({ map: colorMap, normalMap, normalScale: new Vector2(0.8, 0.8) }))
  themeMaterial(ground.material, 'lawn', ({ a, b }) => {
    const studs = paintLego({ a, b, size: 512, perCell: 4, strength: 2.2, ring: 0.22, lit: 0.22 })
    return { map: toTexture(studs.color, { repeat: rep, srgb: true, anisotropy: 16 }), normalMap: toTexture(studs.normal, { repeat: rep, anisotropy: 16 }) }
  })
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  root.add(ground)

  const mats = legoMaterials()
  buildTerraces(root, mats)
  buildMountain(root, mats, 1)
  buildMountain(root, mats, -1)
  buildTrack(root)
  buildChevrons(root)
  buildPlaza(root)
  const marks = new Group()
  buildYardMarkings(marks)
  buildGymMarkings(marks)
  root.add(bake(marks, false))
}

export { legoTex }

// Collision: the lawn, the rail bed, a fence along every edge and a block for each mountain.
export function landColliders() {
  const half = LOBBY.groundSize / 2
  addFixed(RAPIER.ColliderDesc.cuboid(half, 2, half), { x: 0, y: -2, z: 0 }, null, { friction: 0.7 })
  addFixed(RAPIER.ColliderDesc.cuboid(TRACK.end, TRACK.top / 2, TRACK.bedHalfWidth), { x: 0, y: TRACK.top / 2, z: TRACK.z }, null, { friction: 0.75 })
  const { west, east, north, south, fenceHeight: h } = LOBBY
  const fence = (hx, hz, x, z) => addFixed(RAPIER.ColliderDesc.cuboid(hx, h, hz), { x, y: h, z })
  fence((east - west) / 2 + 4, 1, (east + west) / 2, north - 1)
  fence((east - west) / 2 + 4, 1, (east + west) / 2, south + 1)
  fence(1, (south - north) / 2 + 4, west - 1, (south + north) / 2)
  fence(1, (south - north) / 2 + 4, east + 1, (south + north) / 2)
  for (const sign of [1, -1]) {
    addFixed(RAPIER.ColliderDesc.cuboid(20, 11, 25), { x: sign * (TRACK.mouth + 20.5), y: 11, z: TRACK.z })
  }
}

function makeClouds() {
  const rand = mulberry32(2024)
  const geo = new IcosahedronGeometry(1, 3)
  const mat = new MeshLambertMaterial({ color: '#ffffff', emissive: '#e6f2ff', emissiveIntensity: 0.72, fog: false })
  const group = new Group()
  for (let i = 0; i < 30; i++) {
    const ang = rand() * Math.PI * 2
    const dist = 290 + rand() * 150
    const cloud = new Group()
    const puffs = 6 + Math.floor(rand() * 5)
    const len = 44 + rand() * 50
    for (let p = 0; p < puffs; p++) {
      const t = p / (puffs - 1) - 0.5
      const r = (1 - Math.abs(t) * 1.1) * (17 + rand() * 12)
      const puff = new Mesh(geo, mat)
      puff.scale.set(r, r * 0.8, r)
      puff.position.set(t * len, r * 0.25 + rand() * 6, (rand() - 0.5) * 14)
      cloud.add(puff)
    }
    const flatBase = new Mesh(geo, mat)
    flatBase.scale.set(len * 0.62, 6, 16)
    cloud.add(flatBase)
    cloud.position.set(Math.cos(ang) * dist, 50 + rand() * 90, Math.sin(ang) * dist)
    cloud.lookAt(0, cloud.position.y, 0)
    group.add(cloud)
  }
  return group
}

// What hangs over the Galaxy: lit planets, and a belt of rocks turning slowly round the whole map.
function makeSpace({ planets, belt }) {
  const group = new Group()
  const sphere = new SphereGeometry(1, 40, 24)
  const turning = []
  for (const p of planets) {
    const map = new CanvasTexture(paintPlanet(p.bands, p.seed))
    map.colorSpace = SRGBColorSpace
    const planet = new Mesh(sphere, new MeshLambertMaterial({ map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.34, fog: false }))
    planet.scale.setScalar(p.r)
    planet.position.set(p.x, p.y, p.z)
    planet.rotation.z = p.tilt
    group.add(planet)
    turning.push(planet)
    if (p.ring) {
      const bands = new CanvasTexture(paintRings(p.ring.color, p.ring.inner / p.ring.outer, p.seed))
      bands.colorSpace = SRGBColorSpace
      const ring = new Mesh(new RingGeometry(p.r * p.ring.inner, p.r * p.ring.outer, 96), new MeshBasicMaterial({ map: bands, transparent: true, side: DoubleSide, depthWrite: false, fog: false }))
      ring.position.copy(planet.position)
      ring.rotation.set(p.ring.tiltX, p.ring.tiltY, 0)
      group.add(ring)
    }
  }
  const rand = mulberry32(3)
  const rock = new MeshLambertMaterial({ color: belt.color, fog: false })
  const rocks = new InstancedMesh(new DodecahedronGeometry(1, 0), rock, belt.count)
  rocks.frustumCulled = false
  const m = new Matrix4()
  const q = new Quaternion()
  const e = new Euler()
  const at = new Vector3()
  const size = new Vector3()
  for (let i = 0; i < belt.count; i++) {
    const a = rand() * Math.PI * 2
    const r = belt.inner + rand() * (belt.outer - belt.inner)
    at.set(Math.cos(a) * r, belt.low + rand() * (belt.high - belt.low), Math.sin(a) * r)
    const s = belt.size[0] + rand() * (belt.size[1] - belt.size[0])
    size.set(s, s * (0.6 + rand() * 0.4), s * (0.7 + rand() * 0.5))
    m.compose(at, q.setFromEuler(e.set(rand() * 6, rand() * 6, rand() * 6)), size)
    rocks.setMatrixAt(i, m)
  }
  group.add(rocks)
  return {
    group,
    update(dt) {
      rocks.rotation.y += belt.spin * dt
      for (const planet of turning) planet.rotation.y += 0.02 * dt
    },
  }
}

export function createWorld(scene) {
  const clouds = makeClouds()
  scene.add(clouds)
  let space = null
  onTheme((world) => {
    clouds.visible = world.clouds
    if (world.planets && !space) {
      space = makeSpace(world)
      scene.add(space.group)
    }
    if (space) space.group.visible = !!world.planets
  })
  return {
    update(dt) {
      if (space?.group.visible) space.update(dt)
    },
  }
}
