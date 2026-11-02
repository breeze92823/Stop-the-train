import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ADS, FUSE, LOBBY, MAILBOX_REACH, SET, TRACK, WORLDS } from './config.js'
import { bake } from './bake.js'
import * as bloxity from './bloxity.js'
import { ICONS } from './hud.js'
import { label, liveLabel, neon, put, rainbowLabel, solidBox, solidPole, std } from './propkit.js'
import { chestLeft, claimChest, compact, onChange, refillChest, state as progress } from './progress.js'
import { claimChestOnServer, net, requestAdReward } from './net.js'
import { player } from './player.js'
import { mulberry32, paintHazard, paintLego, toTexture } from './textures.js'
import { currentWorld, onTheme, themeMaterial } from './theme.js'
import { dashedRect, terraceTop } from './world.js'
import { makeVehicle, sharedMaterial, variantMaterial, vehicleModel } from './vehicles.js'

// Everything standing on the lawn: the Upgrade stall and its NPC, the Fuse Machine, the
// FREE COINS chest, the mailbox, the galaxy portal, trees, palms, rocks and the floating
// signs. Static meshes are baked to a handful of draw calls; what moves stays apart.

const box = (w, h, d) => new BoxGeometry(w, h, d)

function legoMaps(a, b, tile) {
  const t = paintLego({ a, b, size: 256, perCell: 3, strength: 2.6 })
  return { map: toTexture(t.color, { repeat: 1 / tile, srgb: true }), normalMap: toTexture(t.normal, { repeat: 1 / tile }) }
}
function legoMat(a, b, tile = 4) {
  return new MeshStandardMaterial({ ...legoMaps(a, b, tile), roughness: 0.6 })
}
// Greenery in a world's own colours (config WORLDS looks).
const themedLego = (key, a, b, tile) => themeMaterial(legoMat(a, b, tile), key, (look) => legoMaps(look.a, look.b, tile))
const themedStd = (key, color, extra) => themeMaterial(std(color, extra), key)

// The turning dashed rings on the lawn: n arcs in one mesh.
function dashRing(r, width, n, fill, material) {
  const arcs = []
  for (let i = 0; i < n; i++) arcs.push(new RingGeometry(r - width, r, 24, 1, (i / n) * Math.PI * 2, ((Math.PI * 2) / n) * fill))
  const m = new Mesh(mergeGeometries(arcs), material)
  m.rotation.x = -Math.PI / 2
  return m
}

// A built set piece as a few merged meshes, standing where the group stood.
function settle(root, group) {
  const out = bake(group, true)
  out.position.copy(group.position)
  out.rotation.copy(group.rotation)
  root.add(out)
  return out
}

// BoxGeometry whose UVs run in metres, so studs stay one size on any box.
function legoBox(w, h, d) {
  const g = new BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const at = f * 4 + i
      uv.setXY(at, uv.getX(at) * sizes[f][0], uv.getY(at) * sizes[f][1])
    }
  }
  return g
}

// --- Upgrade stall ---------------------------------------------------------------------
function buildNpc() {
  const g = new Group()
  const black = std('#16161a')
  const red = std('#d61f26')
  const white = std('#f4f4f4')
  put(g, box(0.9, 0.95, 0.5), black, 0, 0.62, 0)
  put(g, box(0.34, 0.26, 0.04), white, 0, 0.74, 0.26)
  put(g, box(0.22, 0.12, 0.05), red, 0, 0.74, 0.28)
  const head = put(g, box(0.72, 0.68, 0.68), white, 0, 1.46, 0)
  put(g, box(0.76, 0.2, 0.72), red, 0, 1.84, 0)
  put(g, box(0.76, 0.16, 0.72), white, 0, 1.98, 0)
  put(g, box(0.5, 0.14, 0.08), std('#111111'), 0, 1.46, 0.36)
  put(g, box(0.2, 0.2, 0.06), new MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 }), -0.18, 1.46, 0.4)
  put(g, box(0.2, 0.2, 0.06), new MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 }), 0.18, 1.46, 0.4)
  put(g, box(0.3, 0.05, 0.05), std('#8a1a20'), 0, 1.24, 0.36)
  // Arms out, legs dangling over the counter, as in the reference.
  const armL = put(g, box(0.3, 0.86, 0.3), red, -0.62, 0.72, 0.1)
  const armR = put(g, box(0.3, 0.86, 0.3), red, 0.62, 0.72, 0.1)
  armL.rotation.z = -0.7
  armR.rotation.z = 0.7
  const legL = put(g, box(0.34, 0.9, 0.34), red, -0.22, 0.05, 0.42)
  const legR = put(g, box(0.34, 0.9, 0.34), red, 0.22, 0.05, 0.42)
  legL.rotation.x = legR.rotation.x = 1.25
  head.userData.isHead = true
  return g
}

function buildStall(root) {
  const { x, z, yaw } = SET.stall
  const s = new Group()
  s.position.set(x, 0, z)
  s.rotation.y = yaw
  const wood = legoMat('#ef9130', '#e8872a', 2)
  const post = std('#e8862b')
  const W = 8.6
  const D = 4.4
  put(s, legoBox(W, 0.42, D), wood, 0, 0.21, 0)
  put(s, legoBox(W - 0.4, 1.3, 0.5), wood, 0, 1.03, D / 2 - 0.45)
  put(s, legoBox(0.5, 1.3, D - 1.4), wood, -W / 2 + 0.45, 1.03, -0.3)
  put(s, legoBox(0.5, 1.3, D - 1.4), wood, W / 2 - 0.45, 1.03, -0.3)
  put(s, legoBox(W + 0.3, 0.34, 1.1), wood, 0, 1.86, D / 2 - 0.45)
  for (const [px, pz] of [[-W / 2 + 0.4, D / 2 - 0.4], [W / 2 - 0.4, D / 2 - 0.4], [-W / 2 + 0.4, -D / 2 + 0.4], [W / 2 - 0.4, -D / 2 + 0.4]]) {
    put(s, box(0.34, 4.6, 0.34), post, px, 2.5, pz)
  }
  // Striped awning, sloping down to the front.
  const pink = legoMat('#f4216d', '#ef1c66', 2)
  const white = legoMat('#ffffff', '#f4f4f4', 2)
  const aw = new Group()
  aw.position.set(0, 5.05, 0.5)
  aw.rotation.x = 0.42
  const n = 9
  const sw = (W + 1.4) / n
  for (let i = 0; i < n; i++) {
    const m = i % 2 ? white : pink
    put(aw, legoBox(sw, 0.2, 6.2), m, -(W + 1.4) / 2 + sw * (i + 0.5), 0, 0)
    put(aw, legoBox(sw, 0.72, 0.16), m, -(W + 1.4) / 2 + sw * (i + 0.5), -0.42, 3.05)
  }
  s.add(aw)
  // The crate leaning at the corner.
  const crate = put(s, legoBox(1.5, 1.5, 1.5), legoMat('#e39a3c', '#d68a2f', 2), -W / 2 - 0.5, 0.7, 2)
  crate.rotation.set(0.1, 0.5, 0.16)
  const baked = settle(root, s)
  const npcRaw = buildNpc()
  const npc = bake(npcRaw, true)
  npc.position.set(0.2, 2.03, 1.72)
  baked.add(npc)
  solidBox(W / 2, 2, D / 2, x, 2, z, yaw)
  return { npc }
}

// --- Fuse machine -----------------------------------------------------------------------
function buildFuse(root) {
  const { x, z, yaw } = SET.fuse
  const f = new Group()
  f.position.set(x, 0, z)
  f.rotation.y = yaw
  const body = std('#8d91cc', { metalness: 0.35, roughness: 0.5 })
  const dark = std('#555a92', { metalness: 0.45, roughness: 0.5 })
  const steel = std('#a9aee0', { metalness: 0.5, roughness: 0.4 })
  const cyan = neon('#22e6ff', 2.4)
  const hazard = new MeshStandardMaterial({ map: toTexture(paintHazard(), { srgb: true }), roughness: 0.5 })
  hazard.map.repeat.set(6, 1)
  const trays = [] // the three feeder ramps: where inserted vehicles sit
  // The stepped hull.
  put(f, box(8.4, 0.6, 7.4), dark, 0, 0.3, 0)
  put(f, box(7, 2.6, 6), body, 0, 1.9, -0.2)
  put(f, box(5.8, 2, 4.6), body, 0, 4.1, -0.7)
  put(f, box(4.4, 0.9, 3.4), steel, 0, 5.5, -1.1)
  // The sloped front: dark window over the hazard stripe, a lit tray under it.
  const front = new Group()
  front.position.set(0, 3.4, 2.1)
  front.rotation.x = -0.42
  put(front, box(6.2, 2.8, 0.5), steel, 0, 0, 0)
  put(front, box(5.3, 1.1, 0.14), new MeshStandardMaterial({ color: '#0d2348', emissive: '#123a78', emissiveIntensity: 0.7, metalness: 0.3, roughness: 0.15 }), 0, 0.42, 0.28)
  put(front, box(5.5, 0.12, 0.16), cyan, 0, 1.1, 0.28, false)
  put(front, box(5.3, 0.3, 0.16), hazard, 0, -0.38, 0.28)
  f.add(front)
  put(f, box(5.4, 0.2, 1.5), neon('#6df4ff', 1.6), 0, 1.5, 3)
  put(f, box(5.8, 0.5, 1.7), dark, 0, 1.2, 3)
  for (const s2 of [-1, 1]) {
    put(f, box(0.16, 0.16, 5.6), cyan, s2 * 3.56, 2.6, -0.2, false)
    put(f, box(0.14, 1.1, 0.14), cyan, s2 * 2.96, 4.3, 1.6, false)
  }
  // The stacks on top.
  for (const [px, pz, r, h] of [[-1.5, -1.6, 0.86, 2.8], [1.5, -1.6, 0.86, 2.8], [0, -2.2, 0.6, 2]]) {
    put(f, new CylinderGeometry(r, r * 1.08, h, 16), steel, px, 5.9 + h / 2, pz)
    put(f, new CylinderGeometry(r * 1.14, r * 1.14, 0.3, 16), dark, px, 5.9 + h, pz)
    put(f, new CylinderGeometry(r * 0.7, r * 0.7, 0.05, 16), std('#14162c'), px, 6.08 + h, pz)
  }
  // Three louvred feeder wings fanned round the front.
  for (const a of [-1.3, 0, 1.3]) {
    const w = new Group()
    w.rotation.y = a
    const ramp = new Group()
    ramp.position.set(0, 0.95, 5.6)
    ramp.rotation.x = 0.3
    put(ramp, box(3.5, 0.5, 3.9), body, 0, 0, 0)
    put(ramp, box(3.1, 0.1, 3.5), dark, 0, 0.28, 0)
    for (let i = 0; i < 6; i++) put(ramp, box(2.9, 0.12, 0.24), std('#2c2f58'), 0, 0.36, -1.45 + i * 0.58)
    for (const s2 of [-1, 1]) put(ramp, box(0.12, 0.12, 3.8), cyan, s2 * 1.7, 0.27, 0, false)
    w.add(ramp)
    f.add(w)
  }
  settle(root, f)
  // The ramps again, unbaked and empty: inserted vehicles are parented to these.
  const show = new Group()
  show.position.set(x, 0, z)
  show.rotation.y = yaw
  for (const a of [-1.3, 0, 1.3]) {
    const w = new Group()
    w.rotation.y = a
    const tray = new Group()
    tray.position.set(0, 0.95, 5.6)
    tray.rotation.x = 0.3
    trays.push(tray)
    w.add(tray)
    show.add(w)
  }
  root.add(show)
  solidBox(4.2, 3.2, 3.6, x, 3.2, z, yaw)

  const r = SET.fuse.ring
  const ring = dashRing(r.r, 0.42, 4, 0.62, neon('#27e9ff', 2, { side: DoubleSide }))
  ring.position.set(r.x, 0.03, r.z)
  root.add(ring)
  const title = label('FUSE MACHINE', 3.3, { colors: [['#8df2ff', '#2172ff']], outline: '#07224f', outlineWidth: 12 })
  title.position.set(x, 12, z)
  const count = liveLabel('0/3', 2.7, { colors: [['#ffffff', '#dfe6ff']], outline: '#0b1a3a', outlineWidth: 12 })
  count.position.set(x, 9.9, z)
  root.add(title, count)
  return { ring, cyan, count, trays }
}

// --- Mailbox + portal + boards ------------------------------------------------------------
function buildMailbox(root) {
  const { x, z } = SET.mailbox
  const m = new Group()
  m.position.set(x, 0, z)
  const white = legoMat('#ffffff', '#eef0f6', 2)
  const red = std('#c9151f')
  put(m, box(0.42, 3.2, 0.42), red, 0, 1.6, 0)
  put(m, legoBox(1.3, 0.2, 2.2), white, 0, 3.26, 0)
  put(m, legoBox(1.3, 0.8, 2.2), white, 0, 3.7, 0)
  const lid = put(m, new CylinderGeometry(0.65, 0.65, 2.2, 16, 1, false, 0, Math.PI), white, 0, 4.1, 0)
  lid.rotation.set(Math.PI / 2, 0, Math.PI / 2)
  put(m, box(1.32, 1.1, 0.06), std('#ff6b75'), 0, 3.8, 1.12)
  const flag = put(m, box(0.08, 1.2, 0.34), red, 0.72, 4.3, 0.1)
  flag.rotation.x = 0.2
  settle(root, m)
  solidPole(0.35, 3.2, x, z)
  const white2 = new MeshBasicMaterial({ color: '#ffffff' })
  const dash = new Group()
  dashedRect(dash, x - 3.2, z - 3, x + 3.2, z + 3, white2, { dash: 1, gap: 0.7, width: 0.24 })
  root.add(bake(dash, false))
  const a = label('FEEDBACKS', 1.5, { colors: [['#fff36a', '#ffb400']], outline: '#2c1a00' })
  a.position.set(x, 6.7, z)
  const b = label('LEAVE YOUR FEEDBACK!', 0.76, { color: '#ffffff', outline: '#0b0b12' })
  b.position.set(x, 5.5, z)
  root.add(a, b)
  return { pos: new Vector3(x, 0, z), reach: MAILBOX_REACH }
}

const PORTAL_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float time;
  uniform vec3 deep;
  uniform vec3 pink;
  uniform vec3 pale;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    // Logarithmic arms: a galaxy winding in on itself.
    float arm = sin(a * 2.0 + log(r + 0.04) * 5.5 - time * 1.8) * 0.5 + 0.5;
    float fine = sin(a * 5.0 + log(r + 0.04) * 11.0 - time * 3.1) * 0.5 + 0.5;
    vec3 col = mix(deep, pink, smoothstep(0.25, 0.85, arm) * smoothstep(1.02, 0.25, r));
    col = mix(col, pale, pow(arm, 3.0) * (0.35 + fine * 0.65) * smoothstep(0.95, 0.2, r));
    col += pale * pow(max(0.0, 1.0 - r * 2.6), 2.0) * 1.6;
    gl_FragColor = vec4(col * 1.25, 1.0);
  }`

function buildPortal(root) {
  const { x, z, yaw } = SET.portal
  const p = new Group()
  p.position.set(x, 4, z)
  p.rotation.y = yaw
  p.scale.setScalar(0.82)
  const uniforms = { time: { value: 0 }, deep: { value: new Color() }, pink: { value: new Color() }, pale: { value: new Color() } }
  const disc = new Mesh(
    new CircleGeometry(3.5, 48),
    new ShaderMaterial({
      uniforms,
      side: DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: PORTAL_FRAG,
    }),
  )
  p.add(disc)
  // The rim is rough blocks of dark void, not a ring.
  const rand = mulberry32(13)
  const rim = new Group()
  const voidA = std('#3b1c9e', { emissive: '#5420d8', emissiveIntensity: 0.55 })
  const voidB = std('#26126e', { emissive: '#3a14a8', emissiveIntensity: 0.4 })
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2
    const s = 0.7 + rand() * 0.55
    const d = 3.72 + rand() * 0.42
    const m = put(rim, box(s, s, 0.7 + rand() * 0.5), i % 3 ? voidA : voidB, Math.cos(a) * d, Math.sin(a) * d, 0, false)
    m.rotation.z = a + rand() * 0.5
  }
  p.add(bake(rim, true))
  const shardMat = std('#2c1570', { emissive: '#4416b8', emissiveIntensity: 0.8 })
  const SHARDS = 16
  const shards = new InstancedMesh(box(1, 1, 1), shardMat, SHARDS)
  shards.frustumCulled = false
  const items = []
  for (let i = 0; i < SHARDS; i++) items.push({ a: rand() * Math.PI * 2, d: 4.9 + rand() * 1.4, v: 0.12 + rand() * 0.2, s: rand() * 0.5 + 0.3, z: (rand() - 0.5) * 1.2 })
  p.add(shards)
  root.add(p)
  const ringCfg = SET.portal.ring
  const ring = dashRing(ringCfg.r, 0.3, 4, 0.7, themeMaterial(new MeshBasicMaterial({ color: '#1426e0', side: DoubleSide }), 'portalRing'))
  ring.position.set(ringCfg.x, 0.03, ringCfg.z)
  root.add(ring)
  // The portal shows the world it leads to.
  let shown = currentWorld().portal
  const titleOf = (look) => [WORLDS[look.to].title, { colors: [look.colors], outline: look.outline }]
  const subOf = (look) => [look.sub, { colors: [look.subColors], outline: look.outline }]
  const a = liveLabel(titleOf(shown)[0], 1.5, titleOf(shown)[1])
  a.position.set(x, 9.3, z)
  const b = liveLabel(subOf(shown)[0], 1.3, subOf(shown)[1])
  b.position.set(x, 8, z)
  root.add(a, b)
  onTheme(({ portal: look }) => {
    uniforms.deep.value.setRGB(...look.deep)
    uniforms.pink.value.setRGB(...look.mid)
    uniforms.pale.value.setRGB(...look.pale)
    if (look === shown) return
    shown = look
    a.setText(...titleOf(look))
    b.setText(...subOf(look))
  })
  return { uniforms, shards, items, ring, pos: new Vector3(ringCfg.x, 0, ringCfg.z), reach: ringCfg.r }
}

// The leaderboards: the server's top ten per stat (net.js `leaderboard`), the local player alone offline.
let serverBoards = null
function boardCanvas(entry) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 700
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  let shown = null
  const draw = () => {
    const name = String(bloxity.authState?.user?.username ?? bloxity.authState?.user?.name ?? 'You')
    const value = progress[entry.stat] ?? 0
    const rows = serverBoards?.boards?.[entry.stat] ?? null
    const key = rows ? JSON.stringify(rows) : `${name}|${value}`
    if (key === shown) return
    shown = key
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#f9b858'
    ctx.fillRect(0, 0, 512, 700)
    ctx.textBaseline = 'middle'
    for (let i = 0; i < 10; i++) {
      const y = 12 + i * 68
      ctx.fillStyle = i % 2 ? '#f2a944' : '#f6b050'
      ctx.fillRect(14, y, 484, 62)
      ctx.fillStyle = '#5a3208'
      ctx.textAlign = 'left'
      ctx.font = '700 34px Fredoka, "Arial Black", sans-serif'
      ctx.fillText(`${i + 1}`, 24, y + 33)
      ctx.fillStyle = i ? 'rgba(90,50,8,0.22)' : '#3b1e04'
      ctx.fillRect(74, y + 9, 44, 44)
      const row = rows ? rows[i] : i === 0 ? { name, value } : null
      if (row) {
        ctx.fillText(String(row.name).slice(0, 14), 130, y + 33)
        ctx.textAlign = 'right'
        ctx.fillStyle = entry.colors[1]
        ctx.fillText(compact(row.value), 490, y + 33)
      } else {
        ctx.fillRect(130, y + 26, 190, 10)
        ctx.fillRect(420, y + 26, 66, 10)
      }
    }
    tex.needsUpdate = true
  }
  draw()
  return { tex, draw }
}

function buildBoards(root) {
  const { x, z, list } = SET.boards
  const base = new Group()
  base.position.set(x, 0, z)
  const purple = legoMat('#7a6ee0', '#6d61d4', 4)
  put(base, legoBox(9, 0.3, 26), purple, 0, 0.15, 0, false)
  put(base, box(9.6, 0.12, 26.6), std('#c9b6f5'), 0, 0.06, 0, false)
  settle(root, base)
  addPlatform(x, z)
  const face = legoMat('#ffc266', '#f7b553', 2)
  const frame = std('#e08a2e')
  const faces = []
  for (const b of list) {
    const g = new Group()
    g.position.set(x, 0.3, b.z)
    g.rotation.y = Math.PI / 2
    const W = b.width
    const H = b.height
    put(g, legoBox(W + 0.5, H, 0.9), face, 0, H / 2 + 0.4, 0)
    put(g, legoBox(W + 1.3, 0.6, 1.5), frame, 0, H + 0.6, 0)
    put(g, legoBox(W + 1.3, 0.8, 1.5), frame, 0, 0.4, 0)
    for (const s of [-1, 1]) put(g, legoBox(0.6, H, 1.2), frame, s * (W / 2 + 0.3), H / 2 + 0.4, 0)
    settle(root, g)
    const c = boardCanvas(b)
    const plane = new Mesh(new PlaneGeometry(W - 0.2, H - 0.4), new MeshBasicMaterial({ map: c.tex }))
    plane.position.set(x + 0.47, H / 2 + 0.7, b.z)
    plane.rotation.y = Math.PI / 2
    root.add(plane)
    faces.push(c)
    const t = label(b.title, b.stat === 'breaks' ? 1.2 : 1, { colors: [b.colors], outline: '#20240a' })
    t.position.set(x, H + 2.2, b.z)
    root.add(t)
    solidBox(0.75, (H + 1.2) / 2, W / 2 + 0.7, x, (H + 1.2) / 2 + 0.3, b.z)
  }
  return { faces }
}

function addPlatform(x, z) {
  solidBox(4.5, 0.15, 13, x, 0.15, z)
}

// --- Free coins chest ---------------------------------------------------------------------
function buildChest(root) {
  const { x, z, yaw, ringR } = SET.chest
  const purple = legoMat('#7a3cf0', '#6a2ee0', 2)
  const gold = std('#ffc21a', { metalness: 0.55, roughness: 0.32 })
  const hoard = neon('#ffd93a', 1.5)
  const g = new Group()
  g.position.set(x, 1.5, z)
  g.rotation.y = yaw
  g.scale.setScalar(1.25)
  const body = new Group()
  put(body, legoBox(2.6, 1.2, 1.7), purple, 0, 0, 0)
  put(body, box(2.72, 0.26, 1.82), gold, 0, -0.42, 0)
  put(body, box(2.72, 0.2, 1.82), gold, 0, 0.56, 0)
  put(body, box(2.3, 0.2, 1.4), hoard, 0, 0.62, 0, false)
  for (const s of [-1, 1]) put(body, box(0.24, 1.3, 1.82), gold, s * 1.2, 0, 0)
  put(body, box(0.5, 0.56, 0.16), gold, 0, 0.1, 0.92)
  g.add(bake(body, true))
  const lid = new Group()
  lid.position.set(0, 0.62, -0.84)
  const lidBody = new Group()
  put(lidBody, legoBox(2.6, 0.8, 1.7), purple, 0, 0.4, 0.85)
  put(lidBody, box(2.72, 0.14, 1.82), gold, 0, 0.06, 0.85)
  for (const s of [-1, 1]) put(lidBody, box(0.24, 0.84, 1.82), gold, s * 1.2, 0.42, 0.85)
  lid.add(bake(lidBody, true))
  lid.rotation.x = -1.05
  g.add(lid)
  root.add(g)
  const ring = dashRing(ringR, 0.16, 1, 0.999, themeMaterial(new MeshBasicMaterial({ color: '#17101f', side: DoubleSide }), 'chestRing'))
  ring.position.set(x, 0.03, z)
  root.add(ring)
  const title = rainbowLabel('FREE COINS!', 1.5, ['#3a6bff', '#7a3cff', '#d83cff', '#ff3fb4', '#ffffff', '#ffd23a', '#d8ff3a', '#7dff5a', '#3affd2', '#3ac8ff', '#3a6bff'])
  title.position.set(x, 5.4, z)
  const timer = liveLabel('00:00', 1, { color: '#ffffff', outline: '#0b0b12' })
  timer.position.set(x, 4.4, z)
  timer.visible = false
  root.add(title, timer)
  return { g, lid, timer, opened: 0 }
}

// --- Greenery -------------------------------------------------------------------------
function palm(group, x, y, z, rand, mats) {
  const lean = (rand() - 0.5) * 0.5
  const leanZ = (rand() - 0.5) * 0.3
  const segs = 7
  const h = 1.5
  let px = 0
  let py = 0
  let pz = 0
  const p = new Group()
  p.position.set(x, y, z)
  for (let i = 0; i < segs; i++) {
    const m = put(p, box(1.15 - i * 0.07, h, 1.15 - i * 0.07), i % 2 ? mats.trunkA : mats.trunkB, px, py + h / 2, pz, false)
    m.rotation.set(leanZ * (i / segs), 0, -lean * (i / segs))
    px += lean * 0.26 * (i / segs + 0.4)
    pz += leanZ * 0.26
    py += h * 0.97
  }
  const crown = new Group()
  crown.position.set(px, py, pz)
  const fronds = 7
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rand() * 0.3
    const frond = new Group()
    frond.rotation.y = a
    let fy = 0.2
    let fx = 0
    let tilt = 0.28
    for (let s = 0; s < 4; s++) {
      const L = 1.7
      const seg = put(frond, box(L, 0.28, 1.25 - s * 0.24), s % 2 ? mats.leafA : mats.leafB, fx + Math.cos(tilt) * L * 0.5, fy - Math.sin(tilt) * L * 0.5, 0, false)
      seg.rotation.z = -tilt
      fx += Math.cos(tilt) * L
      fy -= Math.sin(tilt) * L
      tilt += 0.34
    }
    crown.add(frond)
  }
  p.add(crown)
  group.add(p)
}

function blockTree(group, x, y, z, rand, mats, scale = 1) {
  const t = new Group()
  t.position.set(x, y, z)
  t.scale.setScalar(scale)
  put(t, box(1.3, 3, 1.3), mats.trunkA, 0, 1.5, 0, false)
  put(t, box(6.6, 2.2, 6.6), mats.leafA, 0, 3.8, 0, false)
  put(t, box(5.2, 1.8, 5.2), mats.leafB, 0.2, 5.5, 0, false)
  put(t, box(3.2, 1.4, 3.2), mats.leafA, -0.2, 6.9, 0.2, false)
  group.add(t)
}

// The tiered topiary standing on the lawn: stacked green rounded blocks on a brick stub.
function topiary(group, x, z, mats) {
  const t = new Group()
  t.position.set(x, 0, z)
  put(t, box(2.4, 0.9, 2.4), mats.stub, 0, 0.45, 0, false)
  for (const [y, s] of [[2.0, 4.6], [4.5, 4.2], [7.0, 3.6]]) {
    const m = put(t, box(s, 2.1, s), mats.bush, 0, y, 0, false)
    m.rotation.y = 0.3
    put(t, box(0.8, 0.5, 0.8), mats.stub, 0, y - 1.25, 0, false)
  }
  group.add(t)
}

function buildGreenery(root) {
  const g = new Group()
  const rand = mulberry32(77)
  const mats = {
    trunkA: themedStd('trunkA', '#a8622b'),
    trunkB: themedStd('trunkB', '#c07a3d'),
    leafA: themedStd('leafA', '#1f9f47'),
    leafB: themedStd('leafB', '#28b553'),
    bush: themedLego('bush', '#1aa55a', '#22b264', 2),
    stub: themedStd('stub', '#d3612c'),
  }
  // Palms and block trees along the terrace tops (every side), never over the lawn.
  for (let i = 0; i < 70; i++) {
    const ang = rand() * Math.PI * 2
    const r = 1.05 + rand() * 0.42
    const x = Math.cos(ang) * LOBBY.east * r * 1.1
    const z = 13 + Math.sin(ang) * 86 * r * 1.1
    const top = terraceTop(x, z)
    if (top < 9 || (Math.abs(x) > 84 && Math.abs(z - TRACK.z) < 34)) continue
    if (rand() < 0.68) palm(g, x, top, z, rand, mats)
    else blockTree(g, x, top, z, rand, mats, 0.9 + rand() * 0.5)
  }
  for (const [x, z] of [[-50, -8], [-51, 52], [-72, -50], [-44, -50], [-12, -52], [24, -49], [58, -51], [-92, 66], [-64, 80], [-30, 78], [6, 80], [40, 78], [74, 78], [100, 40]]) topiary(g, x, z, mats)

  // Pale rocks and teal block bushes scattered about.
  const rock = themedStd('rock', '#b9d3e6', { roughness: 0.75 })
  for (const [x, z, s] of [[-8, -46, 1.4], [38, -47, 1], [66, -46, 1.6], [-62, -46, 1.1], [-44, 78, 1.2], [18, 74, 1.3], [-22, 72, 0.9]]) {
    const m = put(g, new DodecahedronGeometry(s * 1.1, 0), rock, x, s * 0.6, z, false)
    m.rotation.set(rand(), rand(), rand())
    m.scale.y = 0.7
  }
  const teal = themedLego('teal', '#37cfa4', '#2fc29a', 2)
  for (const [x, z, n] of [[16, 37, 4], [-9, 37, 3], [22, 33, 3], [54, 40, 3]]) {
    for (let i = 0; i < n; i++) {
      put(g, legoBox(2.4, 1.2, 2.4), teal, x + (i % 2) * 1.9 - 0.9, 0.6 + (i > 1 ? 1.2 : 0), z + (i % 3) * 0.8, false)
    }
  }
  const tuft = themedStd('tuft', '#128a47')
  for (let i = 0; i < 26; i++) {
    const x = (rand() - 0.5) * 200
    const z = -58 + rand() * 18
    for (let j = 0; j < 3; j++) put(g, box(0.28, 0.6 + rand() * 0.5, 0.28), tuft, x + (j - 1) * 0.42, 0.3, z + (rand() - 0.5) * 0.4, false)
  }
  // Flowers and gold bars on the terraces.
  const flower = themedStd('flower', '#ffd93b')
  const gold = std('#f7c531', { metalness: 0.7, roughness: 0.35 })
  const pinkFlower = themedStd('pinkFlower', '#ff6fb1')
  for (let i = 0; i < 80; i++) {
    const a = rand() * Math.PI * 2
    const x = Math.cos(a) * 150 * (0.9 + rand() * 0.5)
    const z = 13 + Math.sin(a) * 100 * (0.92 + rand() * 0.5)
    const top = terraceTop(x, z)
    if (top < 9) continue
    if (rand() < 0.14) put(g, box(2.2, 0.8, 1.2), gold, x, top + 0.4, z, false)
    else put(g, box(0.7, 0.5, 0.7), rand() < 0.75 ? flower : pinkFlower, x, top + 0.26, z, false)
  }
  root.add(bake(g, false))
}

// The floating signs and the flat HP readout on the lawn.
function buildHpSign(root) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 300
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  const plane = new Mesh(new PlaneGeometry(13, 3.8), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }))
  plane.rotation.x = -Math.PI / 2
  plane.rotation.z = 0.02
  plane.position.set(SET.hpSign.x, 0.07, SET.hpSign.z)
  root.add(plane)
  const ctx = c.getContext('2d')
  let last = ''
  const draw = (hp, count) => {
    const key = `${hp}|${count}`
    if (key === last) return
    last = key
    ctx.clearRect(0, 0, 1024, 300)
    ctx.textAlign = 'center'
    ctx.lineJoin = 'round'
    // Bicep, then the number.
    ctx.save()
    ctx.translate(150, 112)
    ctx.scale(1.15, 0.72)
    ctx.fillStyle = '#ffc61a'
    ctx.strokeStyle = '#2b1a00'
    ctx.lineWidth = 12
    ctx.beginPath()
    ctx.moveTo(-74, 24)
    ctx.quadraticCurveTo(-68, -40, -20, -44)
    ctx.quadraticCurveTo(14, -48, 8, -16)
    ctx.quadraticCurveTo(54, -36, 74, 6)
    ctx.quadraticCurveTo(66, 48, 0, 44)
    ctx.quadraticCurveTo(-40, 44, -74, 24)
    ctx.closePath()
    ctx.stroke()
    ctx.fill()
    ctx.restore()
    ctx.font = 'italic 700 118px Fredoka, "Arial Black", sans-serif'
    ctx.lineWidth = 16
    ctx.strokeStyle = '#101018'
    ctx.fillStyle = '#ffffff'
    ctx.strokeText(hp.toLocaleString('en-US'), 590, 104)
    ctx.fillText(hp.toLocaleString('en-US'), 590, 104)
    ctx.font = 'italic 700 74px Fredoka, "Arial Black", sans-serif'
    ctx.lineWidth = 12
    ctx.fillStyle = '#ffe04a'
    const t = `${count} VEHICLES`
    ctx.strokeText(t, 590, 222)
    ctx.fillText(t, 590, 222)
    tex.needsUpdate = true
  }
  draw(0, 0)
  return draw
}

// A square PNG-free sprite from one of the HUD's inline SVG icons.
function iconSprite(svg, size) {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" '))}`
  const map = new TextureLoader().load(src)
  map.colorSpace = SRGBColorSpace
  const s = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false }))
  s.scale.set(size, size, 1)
  return s
}

const mm = (s) => {
  const t = Math.ceil(s)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
const rnd = (a, b) => a + Math.random() * (b - a)
const shardM = new Matrix4()
const eu = new Euler()
const sc = new Vector3()

let adBusy = false
export function createLobby(scene, fx, sound) {
  const staticRoot = new Group()
  scene.add(staticRoot)
  const stall = buildStall(staticRoot)
  const fuse = buildFuse(staticRoot)
  const mailbox = buildMailbox(staticRoot)
  const portal = buildPortal(staticRoot)
  const boards = buildBoards(staticRoot)
  const chest = buildChest(staticRoot)
  buildGreenery(staticRoot)
  onChange(() => boards.faces.forEach((f) => f.draw()))
  const drawHp = buildHpSign(staticRoot)

  // The Upgrade pad: a dashed pink ring that slowly turns.
  const r = SET.stall.ring
  const pink = dashRing(r.r, 0.3, 3, 0.52, new MeshBasicMaterial({ color: '#f01a75', side: DoubleSide }))
  pink.position.set(r.x, 0.03, r.z)
  staticRoot.add(pink)

  // Orange stepping tiles scattered by the yard's far corner.
  const tiles = new Group()
  const tileMat = legoMat('#e8843d', '#dd7932', 1.5)
  const rand = mulberry32(31)
  for (let i = 0; i < 9; i++) {
    const t = i / 8
    const tx = -44 + t * 5 + (rand() - 0.5) * 3
    const tz = 31 + t * 6 + (rand() - 0.5) * 2.4
    const s = 0.7 + rand() * 0.8
    const m = put(tiles, legoBox(s * 1.4, 0.05, s), tileMat, tx, 0.025, tz, false)
    m.rotation.y = rand() * 0.6
  }
  staticRoot.add(bake(tiles, false))

  // The upgrade sign above the stall: train badge, title, subtitle.
  const s = SET.stall
  const up = label('UPGRADE', 1.9, { colors: [['#ff4f9a', '#e0115f']], outline: '#3a0a1f' })
  up.position.set(s.x, 8.6, s.z)
  const sub = label('BECOME THE BEST TRAIN STOPPER', 0.72, { color: '#ffffff', outline: '#0b0b12' })
  sub.position.set(s.x, 7.5, s.z)
  const badge = iconSprite(ICONS.train, 2.4)
  badge.position.set(s.x, 10.7, s.z)
  staticRoot.add(up, sub, badge)

  const collect = new Group()
  const c = SET.collectSign
  collect.position.set(c.x, c.y, c.z)
  const cTitle = label('COLLECT CARS', 2.6, { colors: [['#ff4242', '#c20d14']], outline: '#ffffff', outlineWidth: 12 })
  collect.add(cTitle)
  scene.add(collect)
  const d = SET.diamondSign
  const dia = label('DIAMOND CARS', 2, { colors: [['#7fdcff', '#2a8df0']], outline: '#072a55' })
  dia.position.set(d.x, d.y, d.z)
  staticRoot.add(dia)

  // CURRENT TRAIN board floating over the rail.
  const b = SET.trainSign
  const cur = label('CURRENT TRAIN', 3.8, { color: '#ffffff', outline: '#0b0b12' })
  cur.position.set(b.x, b.y, b.z)
  const rarity = liveLabel('COMMON', 9, { colors: [['#ffffff', '#c7d3e0']], outline: '#0b0b12', outlineWidth: 18 })
  rarity.position.set(b.x, b.y - 6.4, b.z)
  staticRoot.add(cur, rarity)

  // Effects: the void pouring into the portal, steam off the machine, glitter off the chest.
  const nearPlayer = (x, z, reach) => Math.hypot(player.position.x - x, player.position.z - z) < reach
  const pr = { x: SET.portal.x, y: 4, z: SET.portal.z, sin: Math.sin(SET.portal.yaw), cos: Math.cos(SET.portal.yaw) }
  fx.addEmitter({
    rate: 34,
    tick(_p, n) {
      if (!nearPlayer(pr.x, pr.z, 90)) return
      for (let i = 0; i < n; i++) {
        const a = rnd(0, 6.28)
        const d = rnd(2.8, 5)
        // In the disc's plane: right, up.
        const u = Math.cos(a) * d
        const w = Math.sin(a) * d
        const spin = rnd(3, 6)
        const tu = -Math.sin(a) * spin - Math.cos(a) * 3.4
        const tw = Math.cos(a) * spin - Math.sin(a) * 3.4
        fx.light.emit({ x: pr.x + u * pr.cos, y: pr.y + w, z: pr.z - u * pr.sin, vx: tu * pr.cos + pr.sin * 0.8, vy: tw, vz: -tu * pr.sin + pr.cos * 0.8, life: rnd(0.5, 1), size: rnd(0.08, 0.17), size2: 0.02, stretch: 0.04, ramp: i % 3 ? 'violet' : 'magic', round: true })
      }
    },
  })
  const fz = SET.fuse
  const stack = { x: fz.x - Math.sin(fz.yaw) * 1.8, z: fz.z - Math.cos(fz.yaw) * 1.8 }
  fx.addEmitter({
    rate: 5,
    tick(p, n) {
      if (!nearPlayer(fz.x, fz.z, 80)) return
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? -1.5 : 1.5
        p.set(stack.x + Math.cos(fz.yaw) * side, 9, stack.z - Math.sin(fz.yaw) * side)
        fx.puff(p, 0.5, 'steam', 2.4, 1.6, 0.5)
      }
    },
  })
  fx.addEmitter({
    rate: 12,
    tick(p, n) {
      if (!nearPlayer(fz.ring.x, fz.ring.z, 60)) return
      const front = { x: fz.x + Math.sin(fz.yaw) * 3, z: fz.z + Math.cos(fz.yaw) * 3 }
      for (let i = 0; i < n; i++) fx.sparkle(p.set(front.x + rnd(-2.6, 2.6) * Math.cos(fz.yaw), 1.8, front.z - rnd(-2.6, 2.6) * Math.sin(fz.yaw)), 'cyan', 0.3)
    },
  })
  const ch = SET.chest
  fx.addEmitter({
    rate: 9,
    tick(p, n) {
      if (chestLeft() > 0 || !nearPlayer(ch.x, ch.z, 70)) return
      for (let i = 0; i < n; i++) fx.sparkle(p.set(ch.x, chest.g.position.y + 0.8, ch.z), 'gold', 1.5)
    },
  })

  // A world's own air: the Galaxy's stardust drifts round wherever the player is.
  fx.addEmitter({
    rate: WORLDS.galaxy.stardust.rate,
    tick(p, n) {
      const dust = currentWorld().stardust
      if (!dust) return
      for (let i = 0; i < n; i++) {
        const kind = dust.kinds[Math.floor(Math.random() * dust.kinds.length)]
        fx.sparkle(p.set(player.position.x + rnd(-dust.reach, dust.reach), rnd(0.6, dust.height), player.position.z + rnd(-dust.reach, dust.reach)), kind, 0.3)
      }
    },
  })

  let hud = null
  const fuseCars = []
  let humCd = 2
  return {
    updateHp: drawHp,
    mailbox,
    portal,
    setBoards(data) {
      serverBoards = data
      boards.faces.forEach((f) => f.draw())
    },
    // An inserted vehicle drops onto feeder ramp i and stays there until the fuse is done.
    fuseShow(i, spec) {
      const tray = fuse.trays[i]
      if (!tray) return
      const model = vehicleModel(spec.type, spec.paint)
      const v = makeVehicle(model, spec.variant && spec.variant !== 'normal' ? variantMaterial(spec.variant) : sharedMaterial())
      const k = Math.min(0.75, 3.2 / Math.max(model.L, model.hz * 2))
      v.root.scale.setScalar(k)
      v.root.rotation.y = Math.PI / 2
      tray.add(v.root)
      fuseCars.push({ root: v.root, base: 0.36 + model.cy * k, t: 0 })
      sound.liftSet(SET.fuse.x, SET.fuse.z)
    },
    fuseClear() {
      for (const c of fuseCars) c.root.removeFromParent()
      fuseCars.length = 0
    },
    setFuseCount(n) {
      fuse.count.setText(`${n}/${FUSE.slots}`)
    },
    setHud(h) {
      hud = h
    },
    // What E does at the chest.
    chestWant() {
      if (Math.hypot(player.position.x - ch.x, player.position.z - ch.z) > ch.reach) return null
      const base = { bay: chest, x: ch.x, y: 3.6, z: ch.z }
      const left = chestLeft()
      if (left > 0) {
        const ad = net.connected && bloxity.adsAvailable()
        return {
          ...base,
          kind: 'chest-wait',
          text: ad ? 'Watch Ad' : 'Empty',
          instant: true,
          async act() {
            if (!ad || adBusy) {
              sound.deny()
              hud.toast(`Play ${mm(left)} more to open the chest`)
              return
            }
            adBusy = true
            const ok = await requestAdReward(ADS.chest.placement)
            adBusy = false
            if (ok) {
              refillChest()
              hud.showBanner('CHEST REFILLED!', 'CLAIM YOUR FREE COINS', 2600)
            } else hud.toast('No reward: the ad did not finish')
          },
        }
      }
      return {
        ...base,
        kind: 'chest',
        text: 'Claim',
        async act() {
          if (adBusy) return
          // Online the server decides (it counted the play time); offline the local clock does.
          let coins = 0
          if (net.connected) {
            adBusy = true
            const ok = await claimChestOnServer()
            adBusy = false
            if (!ok) {
              sound.deny()
              hud.toast('The chest is not ready yet')
              return
            }
            coins = claimChest(true)
          } else coins = claimChest()
          if (!coins) return
          chest.opened = 1
          sound.chestOpen(ch.x, ch.z)
          hud.coinBurst(18)
          hud.showBanner('FREE COINS!', `+${compact(coins)} COINS`, 2600)
          fx.sparks(ch.x, 2.4, ch.z, 40, 9, 0, 0.8, 0, 'gold')
          fx.shockwave(ch.x, 0.2, ch.z, 7, 0.5, '#ffe36b')
        },
      }
    },
    collectSign: collect,
    setRarity(spec) {
      rarity.setText(spec.name, { colors: [spec.text], outline: '#0b0b12', outlineWidth: 18 })
    },
    update(dt, elapsed) {
      portal.uniforms.time.value = elapsed
      for (let i = 0; i < portal.items.length; i++) {
        const it = portal.items[i]
        it.a += it.v * dt
        const spin = elapsed * 0.7 + i
        shardM.makeRotationFromEuler(eu.set(spin, spin * 0.7, 0)).scale(sc.setScalar(it.s))
        shardM.setPosition(Math.cos(it.a) * it.d, Math.sin(it.a) * it.d, it.z)
        portal.shards.setMatrixAt(i, shardM)
      }
      portal.shards.instanceMatrix.needsUpdate = true
      pink.rotation.z = elapsed * 0.35
      fuse.ring.rotation.z = elapsed * 0.3
      for (const c of fuseCars) {
        c.t = Math.min(1, c.t + dt * 1.6)
        const fall = 1 - c.t
        c.root.position.y = c.base + fall * fall * 3.2 + Math.abs(Math.sin(c.t * 9)) * 0.35 * fall
      }
      portal.ring.rotation.z = -elapsed * 0.3
      // The machine's lights breathe, with the odd flicker of a loose contact.
      const pulse = 0.8 + Math.sin(elapsed * 2.2) * 0.2 - (Math.sin(elapsed * 31) > 0.97 ? 0.4 : 0)
      fuse.cyan.color.copy(fuse.cyan.userData.base).multiplyScalar(pulse * 1.2)
      // The chest floats, and its lid falls shut for as long as it is empty.
      const empty = chestLeft() > 0
      chest.g.position.y = 1.5 + Math.sin(elapsed * 1.6) * 0.16
      chest.g.rotation.z = 0.12 + Math.sin(elapsed * 1.1) * 0.03
      chest.opened = Math.max(0, chest.opened - dt * 1.6)
      const shut = empty ? -0.08 - chest.opened * 1.4 : -1.05 + Math.sin(elapsed * 2) * 0.05
      chest.lid.rotation.x += (shut - chest.lid.rotation.x) * (1 - Math.exp(-6 * dt))
      chest.timer.visible = empty
      if (empty) chest.timer.setText(mm(chestLeft()))
      humCd -= dt
      if (humCd <= 0) {
        humCd = 1.7
        sound.portalHum(SET.portal.x, SET.portal.z)
        sound.machineHum(SET.fuse.x, SET.fuse.z)
      }
      stall.npc.rotation.z = Math.sin(elapsed * 1.6) * 0.03
      collect.position.y = c.y + Math.sin(elapsed * 1.2) * 0.25
    },
  }
}
