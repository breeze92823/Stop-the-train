import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three'
import { NEON } from './config.js'
import { RAPIER, addFixed } from './physics.js'
import { paintText } from './textures.js'

// Shared building blocks for hand-built props: material shorthands, a mesh
// placer, fixed-collider helpers, neon (glowing) materials and outlined text sprites.

export const std = (color, extra) => new MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...extra })
export const glow = (color, opacity = 0.85) => new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })

export function put(parent, geo, mat, x = 0, y = 0, z = 0, shadows = true) {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  if (shadows) {
    m.castShadow = true
    m.receiveShadow = true
  }
  parent.add(m)
  return m
}

export const yawQuat = (yaw) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
export function solidBox(hx, hy, hz, x, y, z, yaw = 0) {
  addFixed(RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x, y, z }, yawQuat(yaw))
}
export function solidPole(radius, height, x, z) {
  addFixed(RAPIER.ColliderDesc.cylinder(height / 2, radius), { x, y: height / 2, z })
}

// --- Neon: unlit materials that glow ----------------------------------------------
// With bloom on, a neon material's colour is pushed to `k` times its base so
// it clears the bloom threshold (bloom measures luminance, so blues need a
// bigger k than greens to glow). With bloom off the same k would just tone-map
// to a washed-out white, so it is capped at NEON.plainMax. main.js flips this
// with the graphics preset via setNeonBloom.
const neonMats = new Set() // dropped again when a material is disposed
let neonBloom = false
function applyNeon(m) {
  const { base, k } = m.userData
  m.color.copy(base).multiplyScalar(neonBloom ? k : Math.min(k, NEON.plainMax))
}
// `extra` takes MeshBasicMaterial options (e.g. additive, transparent flames).
export function neon(color, k = NEON.k, extra = {}) {
  const m = new MeshBasicMaterial(extra)
  m.userData.base = new Color(color)
  m.userData.k = k
  applyNeon(m)
  neonMats.add(m)
  m.addEventListener('dispose', () => neonMats.delete(m))
  return m
}
export function setNeonBloom(on) {
  neonBloom = on
  for (const m of neonMats) applyNeon(m)
}

// --- Labels: outlined text sprites, repainted once Fredoka has loaded --------
export const fontReady = document.fonts?.load ? document.fonts.load('700 96px Fredoka').catch(() => null) : Promise.resolve()
export function label(text, height, opts) {
  const t = paintText(text, opts)
  const tex = new CanvasTexture(t.canvas)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  const fit = () => sprite.scale.set((height * t.canvas.width) / t.canvas.height, height, 1)
  fit()
  fontReady.then(() => {
    t.draw()
    tex.dispose() // the canvas may have changed size
    tex.needsUpdate = true
    fit()
  })
  return sprite
}

// A label whose text changes at runtime (timers, the current train).
// One line, each letter its own colour in turn; the caller sets textAlign and textBaseline.
export function paintRainbow(ctx, text, x, y, size, palette, outline, weight = 0.2) {
  ctx.font = `700 ${size}px Fredoka, "Arial Black", sans-serif`
  ctx.lineJoin = 'round'
  ctx.lineWidth = size * weight
  ctx.strokeStyle = outline
  ctx.strokeText(text, x, y)
  const align = ctx.textAlign
  ctx.textAlign = 'left'
  let cx = x - ctx.measureText(text).width / 2
  let i = 0
  for (const ch of text) {
    ctx.fillStyle = palette[i++ % palette.length]
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width
  }
  ctx.textAlign = align
}

export function rainbowLabel(text, height, palette, outline = '#16100a') {
  const c = document.createElement('canvas')
  c.height = 150
  c.width = 80 * text.length + 60
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  sprite.scale.set((height * c.width) / c.height, height, 1)
  const draw = () => {
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    paintRainbow(ctx, text, c.width / 2, c.height / 2, 110, palette, outline)
    tex.needsUpdate = true
  }
  draw()
  fontReady.then(draw)
  return sprite
}

export function liveLabel(text, height, opts) {
  const sprite = label(text, height, opts)
  const tex = sprite.material.map
  let shown = text
  sprite.setText = (next, nextOpts = opts) => {
    if (next === shown && nextOpts === opts) return
    shown = next
    const t = paintText(next, nextOpts)
    tex.image = t.canvas
    tex.dispose()
    tex.needsUpdate = true
    sprite.scale.set((height * t.canvas.width) / t.canvas.height, height, 1)
  }
  return sprite
}
