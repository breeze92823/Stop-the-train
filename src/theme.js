import { BufferAttribute, Color } from 'three'
import { DEFAULT_WORLD, WORLDS } from './config.js'

// A world's look. Every world is the same map, so nothing is rebuilt: surfaces register here under a key,
// and a world's `looks` (config WORLDS) overrides that key while the world is on. What a world paints
// (textures, recoloured vertices) is made the first time it is entered and kept, so going back is instant.
const MAPS = ['map', 'normalMap', 'emissiveMap']
let current = WORLDS[DEFAULT_WORLD]
const materials = []
const geometries = []
const listeners = []
const c = new Color()
const hsl = { h: 0, s: 0, l: 0 }

export const currentWorld = () => current

// `paint(look)` makes the look's textures ({ map, normalMap, emissiveMap }), for a look that needs them.
export function themeMaterial(mat, key, paint = null) {
  const base = { color: mat.color.clone(), emissive: mat.emissive?.clone(), emissiveIntensity: mat.emissiveIntensity }
  for (const k of MAPS) base[k] = mat[k]
  materials.push({ mat, key, paint, base, made: {} })
  return mat
}

// A mesh's vertex colours: the look gives them a new hue, keeping their shading (black stays black).
export function themeColors(geometry, key) {
  geometries.push({ geometry, key, base: geometry.attributes.color, made: {} })
  return geometry
}

// A surface that is not a material (labels, shaders, whole groups). Called once now and on every change.
export function onTheme(fn) {
  listeners.push(fn)
  fn(current)
}

function recolor(attr, { hue, sat = 1, light = 1 }) {
  const out = new Float32Array(attr.array.length)
  const a = attr.array
  for (let i = 0; i < a.length; i += 3) {
    // The voxel meshers write six equal vertices in a row.
    if (i && a[i] === a[i - 3] && a[i + 1] === a[i - 2] && a[i + 2] === a[i - 1]) {
      out.copyWithin(i, i - 3, i)
      continue
    }
    c.setRGB(a[i], a[i + 1], a[i + 2]).getHSL(hsl)
    c.setHSL(hue, Math.min(1, hsl.s * sat), Math.min(1, hsl.l * light))
    out[i] = c.r
    out[i + 1] = c.g
    out[i + 2] = c.b
  }
  return new BufferAttribute(out, 3)
}

function dress(e, world) {
  const { mat, base } = e
  const look = world.looks[e.key]
  mat.color.set(look?.color ?? base.color)
  if (mat.emissive) {
    mat.emissive.set(look?.emissive ?? base.emissive)
    mat.emissiveIntensity = look?.emissiveIntensity ?? base.emissiveIntensity
  }
  const maps = look && e.paint ? (e.made[world.id] ??= e.paint(look)) : null
  for (const k of MAPS) mat[k] = maps?.[k] ?? base[k]
}

export function applyTheme(id) {
  current = WORLDS[id]
  for (const e of materials) dress(e, current)
  for (const e of geometries) {
    const look = current.looks[e.key]
    e.geometry.setAttribute('color', look ? (e.made[id] ??= recolor(e.base, look)) : e.base)
  }
  for (const fn of listeners) fn(current)
  return current
}
