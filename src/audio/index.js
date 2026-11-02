// Game audio, the one import the rest of the game uses. Everything is synthesised at
// runtime: no sample files. World sounds take a position and are panned and attenuated
// from the camera; the train is a live engine layer with Doppler, wheel-joint clatter
// and a grind layer for the wreck.
import { Vector3 } from 'three'
import { AUDIO, TRACK } from '../config.js'
import { A, installAudio as installCore, now, onStart, ready, setDucked, voice } from './core.js'
import { burst, modal, pick, rnd, tone, vary } from './synth.js'

export { setDucked }

const cam = { pos: new Vector3(), right: new Vector3(1, 0, 0) }
function at(x, z, y = 1) {
  const dx = x - cam.pos.x
  const dy = y - cam.pos.y
  const dz = z - cam.pos.z
  const d = Math.hypot(dx, dy, dz)
  const r = d / AUDIO.hearing
  const vol = 1 / (1 + r * r * 1.2)
  const pan = d > 0.1 ? ((dx * cam.right.x + dz * cam.right.z) / d) * 0.8 : 0
  // Distance eats the highs and wets the sound.
  return { vol, pan, verb: Math.min(0.75, 0.16 + r * 0.5), far: r }
}

const METAL = [[1, 1, 0.5], [1.51, 0.72, 0.42], [2.27, 0.6, 0.3], [3.14, 0.42, 0.22], [4.73, 0.3, 0.14]]
const PLATE = [[1, 1, 0.9], [1.34, 0.8, 0.74], [1.87, 0.62, 0.6], [2.71, 0.46, 0.4], [3.91, 0.3, 0.22]]
const GLASS = [[1, 1, 0.16], [2.32, 0.6, 0.1], [3.8, 0.35, 0.07]]
const COIN = [[1, 1, 0.32], [1.5, 0.6, 0.22], [2.76, 0.42, 0.16], [5.4, 0.2, 0.08]]

// --- Vehicles ---------------------------------------------------------------------------
export function crunch(x, z, k = 1) {
  if (!voice(1.4, 2)) return
  const s = at(x, z)
  const t = now()
  const g = k * s.vol
  const o = { pan: s.pan, verb: s.verb }
  tone({ t, f: 130, f2: 34, glide: 0.2, d: 0.34, gain: 1.05 * g, ...o })
  burst({ t, noise: 'brown', type: 'lowpass', f: 2600, f2: 170, a: 0.001, d: 0.32, gain: 1.5 * g, ...o })
  burst({ t, noise: 'white', f: 2700, q: 0.7, a: 0.001, d: 0.16, gain: 0.6 * g, ...o })
  modal({ t, f: rnd(170, 300), modes: METAL, beat: 9, decay: 0.8, gain: 0.34 * g, strike: 0.5, ...o })
  modal({ t: t + 0.015, f: rnd(620, 980), modes: METAL, beat: 14, decay: 0.45, gain: 0.2 * g, ...o })
  // The tearing bend of sheet metal.
  tone({ t: t + 0.02, type: 'sawtooth', f: rnd(420, 700), f2: rnd(120, 200), d: 0.3, gain: 0.12 * g, lp: 2200, ...o })
  for (let i = 0; i < 9; i++) {
    modal({ t: t + rnd(0.02, 0.4), f: rnd(2600, 7600), modes: GLASS, gain: rnd(0.03, 0.09) * g, pan: s.pan + rnd(-0.2, 0.2), verb: s.verb })
  }
  burst({ t, noise: 'white', type: 'highpass', f: 4200, a: 0.001, d: 0.22, gain: 0.3 * g, ...o })
  // Bits landing after the hit.
  for (let i = 0; i < 6; i++) {
    const at2 = t + rnd(0.18, 1.1)
    modal({ t: at2, f: rnd(340, 1400), modes: METAL, decay: 0.25, gain: rnd(0.05, 0.12) * g, pan: s.pan + rnd(-0.25, 0.25), verb: s.verb })
  }
}

export function carLand(x, z, force = 0.6) {
  if (!voice(0.9, 1.5)) return
  const s = at(x, z)
  const t = now()
  const g = s.vol * (0.45 + force * 0.75)
  const o = { pan: s.pan, verb: s.verb }
  tone({ t, f: 92, f2: 36, d: 0.24, gain: 0.95 * g, ...o })
  burst({ t, noise: 'brown', type: 'lowpass', f: 700, f2: 140, a: 0.001, d: 0.2, gain: 1 * g, ...o })
  modal({ t, f: rnd(210, 330), modes: PLATE, beat: 7, decay: 0.42, gain: 0.2 * g, strike: 0.28, ...o })
  // Springs settling, a loose panel.
  for (const d of [0.1, 0.22, 0.32]) tone({ t: t + d, type: 'triangle', f: rnd(170, 240), f2: 110, d: 0.09, gain: 0.08 * g, lp: 800, ...o })
  burst({ t: t + 0.03, f: 3100, q: 1.2, a: 0.001, d: 0.09, gain: 0.14 * g, ...o })
  for (let i = 0; i < 3; i++) modal({ t: t + rnd(0.03, 0.2), f: rnd(3200, 6400), modes: GLASS, gain: 0.03 * g, ...o })
}

// A little groan per pulse while E is held: suspension and the player's effort.
export function strain(hold, x, z) {
  if (!voice(0.5)) return
  const s = at(x, z)
  const t = now()
  const o = { pan: s.pan, verb: 0.06 }
  const f = 105 + hold * 95
  tone({ t, type: 'sawtooth', f, f2: f * 1.14, d: 0.3, a: 0.05, gain: (0.09 + hold * 0.12) * s.vol, lp: 640, lpq: 3, ...o })
  burst({ t, f: 560 + hold * 600, q: 7, a: 0.05, d: 0.26, gain: (0.04 + hold * 0.1) * s.vol, ...o })
  modal({ t, f: rnd(110, 170) + hold * 80, modes: PLATE, decay: 0.16, gain: 0.09 * s.vol * (0.5 + hold), ...o })
}

export function liftSnatch(x, z) {
  if (!voice(0.9, 2)) return
  const s = at(x, z)
  const t = now()
  const o = { pan: s.pan, verb: 0.12 }
  tone({ t, type: 'sawtooth', f: 150, f2: 240, d: 0.26, gain: 0.22 * s.vol, lp: 900, lpq: 4, ...o }) // the grunt
  burst({ t, f: 700, f2: 2400, q: 1.2, a: 0.06, d: 0.32, gain: 0.3 * s.vol, ...o }) // air
  tone({ t, f: 74, f2: 44, d: 0.18, gain: 0.45 * s.vol, ...o })
  for (const d of [0.08, 0.17, 0.27]) tone({ t: t + d, type: 'triangle', f: rnd(180, 290), f2: 130, d: 0.1, gain: 0.1 * s.vol, lp: 900, ...o })
  modal({ t: t + 0.05, f: 210, modes: PLATE, beat: 6, decay: 0.34, gain: 0.14 * s.vol, ...o })
}

export function liftSet(x, z) {
  if (!voice(0.5, 2)) return
  const s = at(x, z)
  const t = now()
  const o = { pan: s.pan, verb: 0.1 }
  tone({ t, f: 110, f2: 58, d: 0.16, gain: 0.5 * s.vol, ...o })
  modal({ t, f: 260, modes: PLATE, beat: 8, decay: 0.3, gain: 0.16 * s.vol, strike: 0.2, ...o })
  burst({ t, noise: 'brown', type: 'lowpass', f: 500, a: 0.002, d: 0.12, gain: 0.5 * s.vol, ...o })
}

export function toss(x, z) {
  if (!voice(0.6)) return
  const s = at(x, z)
  const t = now()
  burst({ t, f: 1800, f2: 420, q: 0.9, a: 0.06, d: 0.42, gain: 0.34 * s.vol, pan: s.pan, verb: 0.12 })
  tone({ t, type: 'sawtooth', f: 210, f2: 120, d: 0.2, gain: 0.14 * s.vol, lp: 800, lpq: 3, pan: s.pan })
}

export function vehicleSpawn(x, z) {
  if (!voice(0.8)) return
  const s = at(x, z)
  const t = now()
  const o = { pan: s.pan, verb: 0.3 }
  for (const [d, f] of [[0, 523], [0.07, 784], [0.14, 1047], [0.21, 1568]]) tone({ t: t + d, type: 'triangle', f, d: 0.3, gain: 0.08 * s.vol, ...o })
  burst({ t, f: 1400, f2: 6200, q: 1, a: 0.12, d: 0.26, gain: 0.14 * s.vol, ...o })
  tone({ t: t + 0.16, f: 90, f2: 50, d: 0.14, gain: 0.3 * s.vol, ...o })
}

// --- Character ---------------------------------------------------------------------------
export function footstep(heavy) {
  if (!ready()) return
  const t = now()
  const g = heavy ? 1.6 : 1
  // A soft shoe on hard studded plastic.
  burst({ t, noise: 'pink', f: vary(1300, 0.2), q: 1.1, a: 0.002, d: 0.05, gain: 0.09 * g, bus: A.sfx })
  burst({ t: t + 0.004, noise: 'brown', type: 'lowpass', f: 420, a: 0.002, d: 0.07, gain: 0.26 * g, bus: A.sfx })
  if (heavy) tone({ t, f: 66, f2: 38, d: 0.1, gain: 0.2 })
  if (Math.random() < 0.35) modal({ t, f: rnd(1700, 2400), modes: GLASS, gain: 0.012, decay: 0.5 })
}

export function jump() {
  if (!ready()) return
  burst({ f: 900, f2: 2100, q: 1, a: 0.02, d: 0.15, gain: 0.1 })
}

export function land(k = 0.5) {
  if (!ready()) return
  const t = now()
  burst({ t, noise: 'brown', type: 'lowpass', f: 520, a: 0.002, d: 0.1, gain: 0.3 + k * 0.5 })
  burst({ t, noise: 'pink', f: 1100, q: 0.8, a: 0.002, d: 0.06, gain: 0.08 + k * 0.1 })
}

export function body(x, z) {
  if (!voice(0.6, 2)) return
  const s = at(x, z)
  const t = now()
  tone({ t, f: 120, f2: 44, d: 0.22, gain: 0.9 * s.vol, pan: s.pan })
  burst({ t, noise: 'brown', type: 'lowpass', f: 900, a: 0.001, d: 0.14, gain: 0.9 * s.vol, pan: s.pan })
}

// --- Gym ----------------------------------------------------------------------------------
// The body settling onto the vinyl, the bar scraping out of its cradle.
export function benchLie(x, z) {
  if (!voice(0.7, 2)) return
  const s = at(x, z)
  const t = now()
  const o = { pan: s.pan, verb: 0.1 }
  burst({ t, noise: 'pink', f: 700, f2: 300, q: 0.7, a: 0.03, d: 0.26, gain: 0.24 * s.vol, ...o }) // cloth
  burst({ t: t + 0.2, noise: 'brown', type: 'lowpass', f: 420, a: 0.004, d: 0.14, gain: 0.5 * s.vol, ...o }) // the pad takes the weight
  tone({ t: t + 0.22, type: 'triangle', f: 190, f2: 120, d: 0.2, gain: 0.07 * s.vol, lp: 700, ...o }) // frame creak
  modal({ t: t + 0.36, f: 340, modes: PLATE, decay: 0.26, gain: 0.16 * s.vol, strike: 0.3, ...o })
  burst({ t: t + 0.34, f: 3200, f2: 1800, q: 2, a: 0.01, d: 0.1, gain: 0.08 * s.vol, ...o }) // steel on the cradle
}

export function benchRise(x, z) {
  if (!voice(0.4)) return
  const s = at(x, z)
  const t = now()
  burst({ t, f: 1300, f2: 500, q: 0.8, a: 0.05, d: 0.34, gain: 0.14 * s.vol, pan: s.pan, verb: 0.08 }) // the long breath out
  burst({ t: t + 0.05, noise: 'pink', f: 600, f2: 900, q: 0.7, a: 0.05, d: 0.24, gain: 0.14 * s.vol, pan: s.pan })
}

// The bar dropped home: a heavy double clank and the plates ringing down.
export function barRack(x, z, weight = 0.7) {
  if (!voice(0.7, 2)) return
  const s = at(x, z)
  const t = now()
  const f = 260 - weight * 130
  const o = { pan: s.pan, verb: 0.22 }
  for (const [d, g] of [[0, 1], [0.075, 0.6]]) {
    tone({ t: t + d, f: 96, f2: 44, d: 0.18, gain: 0.5 * g * s.vol, ...o })
    modal({ t: t + d, f: f * rnd(0.96, 1.04), modes: PLATE, beat: 6, decay: 0.42, gain: 0.26 * g * s.vol, strike: 0.26, ...o })
    modal({ t: t + d, f: rnd(1100, 1500), modes: METAL, decay: 0.2, gain: 0.08 * g * s.vol, ...o })
  }
  for (const d of [0.14, 0.21, 0.26]) modal({ t: t + d, f: rnd(1900, 2900), modes: METAL, decay: 0.1, gain: 0.03 * s.vol, ...o })
}

// Lockout: the bar stops dead overhead and the collars chatter, with a hard breath out.
export function repTop(x, z, weight = 0.7) {
  if (!voice(0.45, 2)) return
  const s = at(x, z)
  const t = now()
  const o = { pan: s.pan, verb: 0.14 }
  const f = (250 - weight * 120) * rnd(0.97, 1.03)
  modal({ t, f, modes: PLATE, beat: 5, decay: 0.2, gain: 0.13 * s.vol, strike: 0.2, ...o })
  modal({ t: t + 0.012, f: rnd(1500, 2100), modes: METAL, decay: 0.08, gain: 0.05 * s.vol, ...o })
  modal({ t: t + 0.05, f: rnd(2300, 3100), modes: METAL, decay: 0.06, gain: 0.025 * s.vol, ...o })
  burst({ t: t - 0.03, f: rnd(1000, 1300), f2: 620, q: 0.8, a: 0.02, d: 0.14, gain: 0.1 * s.vol, ...o }) // the exhale
  if (Math.random() < 0.3) tone({ t: t - 0.05, type: 'sawtooth', f: rnd(130, 170), f2: rnd(190, 230), d: 0.15, a: 0.02, gain: 0.07 * s.vol, lp: 760, lpq: 3, ...o }) // the odd grunt
}

// The bar back at the chest: a soft stop, a creak from the bench, a breath in.
export function repBottom(x, z, weight = 0.7) {
  if (!voice(0.3)) return
  const s = at(x, z)
  const t = now()
  const o = { pan: s.pan, verb: 0.1 }
  burst({ t, noise: 'brown', type: 'lowpass', f: 300 + (1 - weight) * 120, a: 0.004, d: 0.09, gain: 0.3 * s.vol, ...o })
  tone({ t, f: 74, f2: 46, d: 0.1, gain: 0.2 * s.vol, ...o })
  tone({ t: t + 0.01, type: 'triangle', f: rnd(210, 280), f2: 160, d: 0.1, gain: 0.03 * s.vol, lp: 800, ...o })
  burst({ t: t - 0.14, f: 1500, f2: 2300, q: 1, a: 0.06, d: 0.1, gain: 0.04 * s.vol, ...o }) // the breath in
}

// The Strength going in: a round little pop that climbs over a set, then starts again.
export function gainPop(reps) {
  if (!voice(0.2)) return
  const t = now()
  const f = 620 * 2 ** (((reps - 1) % 12) / 16)
  tone({ t, f, f2: f * 1.5, glide: 0.05, d: 0.09, gain: 0.05, bus: A.ui })
  tone({ t, type: 'triangle', f: f * 2, d: 0.05, gain: 0.018, bus: A.ui })
}

// Every twentieth half rep.
export function milestone() {
  if (!ready()) return
  const t = now()
  for (const [d, f] of [[0, 659], [0.07, 880], [0.14, 1319]]) tone({ t: t + d, type: 'triangle', f, a: 0.004, d: 0.3, gain: 0.07, verb: 0.3, bus: A.ui })
  tone({ t, f: 110, f2: 55, d: 0.2, gain: 0.26 })
  burst({ t, f: 900, f2: 4200, q: 1, a: 0.02, d: 0.24, gain: 0.08, bus: A.ui })
}

// What a lit bench sounds like from close by: each call is one crackle, lick or arc.
export function aura(kind, x, z) {
  if (!voice(0.25)) return
  const s = at(x, z)
  const r = Math.hypot(x - cam.pos.x, z - cam.pos.z)
  const v = s.vol / (1 + (r / 14) ** 2)
  if (v < 0.03) return
  const t = now()
  const o = { pan: s.pan, verb: 0.16 }
  if (kind === 'electric' || kind === 'violet') {
    for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) {
      burst({ t: t + rnd(0, 0.09), noise: 'white', f: rnd(2600, 7200), q: 3, a: 0.001, d: rnd(0.006, 0.03), gain: rnd(0.04, 0.12) * v, ...o })
    }
    tone({ t, type: 'sawtooth', f: 120, a: 0.01, d: 0.1, gain: 0.03 * v, lp: 1700, lpq: 5, ...o }) // the mains buzz of the arc
    if (kind === 'violet') tone({ t, f: rnd(160, 200), f2: rnd(320, 420), d: 0.3, a: 0.05, gain: 0.03 * v, ...o })
  } else if (kind === 'rainbow') {
    modal({ t, f: rnd(1400, 3600), modes: GLASS, gain: 0.04 * v, ...o })
    burst({ t, f: 1600, f2: 3600, q: 3, a: 0.06, d: 0.2, gain: 0.03 * v, ...o })
  } else {
    // Flame: a soft low flutter with a few pops of sap in it.
    burst({ t, noise: 'brown', type: 'lowpass', f: 620, a: 0.05, d: 0.34, gain: 0.3 * v, ...o })
    burst({ t, noise: 'pink', f: 1100, q: 0.6, a: 0.03, d: 0.2, gain: 0.06 * v, ...o })
    for (let i = 0; i < 3; i++) burst({ t: t + rnd(0, 0.24), f: rnd(1200, 4200), q: 2, a: 0.001, d: 0.012, gain: rnd(0.03, 0.09) * v, ...o })
  }
}

// The chest lid thrown back: wood, a latch and a run of coins.
export function chestOpen(x, z) {
  if (!voice(1, 2)) return
  const s = at(x, z)
  const t = now()
  const o = { pan: s.pan, verb: 0.2 }
  tone({ t, type: 'sawtooth', f: 150, f2: 330, d: 0.2, gain: 0.05 * s.vol, lp: 900, lpq: 6, ...o }) // the hinge
  burst({ t: t + 0.16, noise: 'brown', type: 'lowpass', f: 900, a: 0.002, d: 0.1, gain: 0.5 * s.vol, ...o })
  modal({ t: t + 0.16, f: 300, modes: PLATE, decay: 0.2, gain: 0.08 * s.vol, ...o })
  for (let i = 0; i < 18; i++) modal({ t: t + 0.2 + i * rnd(0.025, 0.05), f: rnd(1900, 3900), modes: COIN, gain: rnd(0.03, 0.07) * s.vol, pan: s.pan + rnd(-0.2, 0.2), verb: 0.25 })
  for (const [d, f] of [[0.2, 880], [0.28, 1175], [0.36, 1760]]) tone({ t: t + d, type: 'triangle', f, d: 0.3, gain: 0.06, verb: 0.3, bus: A.ui })
}

// The portal's slow breathing and the Fuse Machine's transformer, one swell per call.
export function portalHum(x, z) {
  if (!voice(0.3)) return
  const s = at(x, z)
  const r = Math.hypot(x - cam.pos.x, z - cam.pos.z)
  const v = s.vol / (1 + (r / 22) ** 2)
  if (v < 0.03) return
  const t = now()
  const o = { pan: s.pan, verb: 0.5 }
  for (const f of [82, 123.5, 165]) tone({ t, f: f * rnd(0.99, 1.01), f2: f * 1.04, a: 0.7, hold: 0.3, d: 1, gain: 0.05 * v, ...o })
  burst({ t, f: 500, f2: 1700, q: 2.6, a: 0.8, d: 1, gain: 0.05 * v, ...o })
}

export function machineHum(x, z) {
  if (!voice(0.3)) return
  const s = at(x, z)
  const r = Math.hypot(x - cam.pos.x, z - cam.pos.z)
  const v = s.vol / (1 + (r / 16) ** 2)
  if (v < 0.03) return
  const t = now()
  const o = { pan: s.pan, verb: 0.16 }
  tone({ t, type: 'sawtooth', f: 60, a: 0.3, hold: 0.5, d: 0.4, gain: 0.05 * v, lp: 340, ...o })
  tone({ t, type: 'square', f: 120, a: 0.3, hold: 0.5, d: 0.4, gain: 0.012 * v, lp: 900, ...o })
  if (Math.random() < 0.35) burst({ t: t + 0.4, f: 3200, f2: 1100, q: 1, a: 0.03, d: 0.5, gain: 0.03 * v, ...o }) // a vent letting go
}

// --- Trains -------------------------------------------------------------------------------
// Air horn: a real five-chime chord, slightly flat on attack, slapping off the cliffs.
export function horn(x, blasts = 2) {
  if (!ready()) return
  const s = at(x, TRACK.z)
  const t0 = now()
  const chord = [277, 330, 392, 466, 554]
  for (let b = 0; b < blasts; b++) {
    const t = t0 + b * 1.25
    const hold = b === blasts - 1 ? 1.15 : 0.62
    for (const f of chord) {
      for (const cents of [-5, 6]) {
        tone({ t, type: 'sawtooth', f: f * 0.985, f2: f, glide: 0.08, a: 0.05, hold, d: 0.26, gain: 0.11 * Math.max(0.45, s.vol), lp: 1900, lpq: 1.4, detune: cents, pan: s.pan, verb: 0.55 })
      }
    }
    tone({ t, type: 'square', f: 138, a: 0.05, hold, d: 0.2, gain: 0.1 * Math.max(0.45, s.vol), lp: 500, verb: 0.3, pan: s.pan })
  }
}

// A crossing bell for the last seconds.
export function bell() {
  if (!ready()) return
  const s = at(TRACK.mouth * 0.5, TRACK.z)
  const v = Math.max(0.3, s.vol)
  modal({ f: 1046, modes: [[1, 1, 0.42], [2.01, 0.6, 0.3], [2.98, 0.4, 0.2], [4.18, 0.22, 0.12]], gain: 0.26 * v, strike: 0.2, verb: 0.35, pan: s.pan })
}

export function explosion(x, z, big = 1) {
  if (!voice(3.4, 3)) return
  const s = at(x, z)
  const t = now()
  const v = Math.max(0.35, s.vol) * big
  const o = { pan: s.pan, verb: Math.min(0.9, s.verb + 0.3) }
  tone({ t, f: 68, f2: 21, glide: 1.1, a: 0.004, d: 1.7, gain: 1.5 * v, ...o })
  tone({ t, f: 130, f2: 40, glide: 0.3, d: 0.5, gain: 0.8 * v, ...o })
  burst({ t, noise: 'brown', type: 'lowpass', f: 5200, f2: 90, sweep: 1.2, a: 0.002, d: 2.2, gain: 2.1 * v, ...o })
  burst({ t, noise: 'white', type: 'lowpass', f: 9000, f2: 800, sweep: 0.3, a: 0.001, d: 0.42, gain: 0.8 * v, ...o })
  // Crackle of the fireball, then metal raining down.
  for (let i = 0; i < 24; i++) {
    burst({ t: t + 0.1 + Math.random() ** 1.6 * 1.8, f: rnd(700, 5200), q: 2, a: 0.001, d: rnd(0.01, 0.05), gain: rnd(0.05, 0.28) * v, pan: s.pan + rnd(-0.3, 0.3), verb: 0.3 })
  }
  for (let i = 0; i < 12; i++) {
    modal({ t: t + rnd(0.5, 2.6), f: rnd(280, 1600), modes: METAL, decay: 0.32, gain: rnd(0.05, 0.14) * v, pan: s.pan + rnd(-0.4, 0.4), verb: 0.3 })
  }
  // The slap back off the cliffs.
  burst({ t: t + 0.38, noise: 'brown', type: 'lowpass', f: 1100, f2: 120, a: 0.01, d: 0.9, gain: 0.7 * v, ...o })
  burst({ t: t + 0.86, noise: 'brown', type: 'lowpass', f: 700, f2: 100, a: 0.02, d: 0.9, gain: 0.34 * v, ...o })
}

// The screaming steel of a derailing locomotive.
export function derail(x) {
  if (!voice(3, 3)) return
  const s = at(x, TRACK.z)
  const t = now()
  const v = Math.max(0.4, s.vol)
  const o = { pan: s.pan, verb: 0.5 }
  for (const [f, f2] of [[1300, 360], [1760, 460], [2240, 610]]) {
    tone({ t, type: 'sawtooth', f, f2, a: 0.02, d: 2.3, gain: 0.08 * v, lp: 3600, lpq: 4, ...o })
  }
  burst({ t, f: 3000, f2: 900, q: 10, a: 0.02, hold: 0.4, d: 1.8, gain: 0.9 * v, ...o })
  modal({ t, f: 92, modes: PLATE, beat: 5, decay: 2.2, gain: 0.5 * v, strike: 0.5, ...o })
  modal({ t: t + 0.05, f: 148, modes: METAL, beat: 9, decay: 2, gain: 0.4 * v, ...o })
  for (let i = 0; i < 10; i++) {
    crunchLite(t + 0.2 + i * rnd(0.14, 0.3), s, v)
  }
}
function crunchLite(t, s, v) {
  burst({ t, noise: 'brown', type: 'lowpass', f: 1300, f2: 200, a: 0.002, d: 0.2, gain: rnd(0.4, 0.9) * v, pan: s.pan, verb: 0.4 })
  modal({ t, f: rnd(130, 520), modes: METAL, beat: 8, decay: 0.5, gain: rnd(0.08, 0.2) * v, pan: s.pan, verb: 0.4 })
}

// --- Live train layer ------------------------------------------------------------------------
const live = { ready: false, joint: 0, nearX: 0, brake: 0, chiff: 0 }
function buildEngine(ctx) {
  const out = ctx.createGain()
  out.gain.value = 0
  const pan = ctx.createStereoPanner()
  out.connect(pan).connect(A.engine)
  const send = ctx.createGain()
  send.gain.value = 0.2
  pan.connect(send).connect(A.verb)

  // Prime mover: three pulses in a firing-order ratio, through a dark filter.
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 300
  lp.Q.value = 0.8
  lp.connect(out)
  const oscs = [[1, 'sawtooth', 0.42], [1.5, 'square', 0.16], [2, 'sawtooth', 0.22], [0.5, 'sawtooth', 0.42]].map(([ratio, type, gain]) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = 44 * ratio
    const g = ctx.createGain()
    g.gain.value = gain
    o.connect(g).connect(lp)
    o.start()
    return { o, ratio }
  })
  // Turbo whine.
  const whine = ctx.createOscillator()
  whine.type = 'sine'
  whine.frequency.value = 1400
  const whineGain = ctx.createGain()
  whineGain.gain.value = 0.012
  whine.connect(whineGain).connect(out)
  whine.start()
  // Wheels on steel: a band of pink noise, plus deep rumble you feel more than hear.
  const noise = (buffer, type, freq, q, gain) => {
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.value = gain
    src.connect(f).connect(g).connect(out)
    src.start()
    return { f, g }
  }
  const roll = noise(A.noise.pink, 'bandpass', 900, 0.7, 0.5)
  const rumble = noise(A.noise.brown, 'lowpass', 180, 0.7, 1.5)
  const flange = noise(A.noise.white, 'bandpass', 3300, 9, 0)
  // The wreck's long grind.
  const grindOut = ctx.createGain()
  grindOut.gain.value = 0
  const gpan = ctx.createStereoPanner()
  grindOut.connect(gpan).connect(A.sfx)
  const gs = ctx.createBufferSource()
  gs.buffer = A.noise.pink
  gs.loop = true
  const gf = ctx.createBiquadFilter()
  gf.type = 'bandpass'
  gf.frequency.value = 800
  gf.Q.value = 2.4
  const gl = ctx.createBufferSource()
  gl.buffer = A.noise.brown
  gl.loop = true
  gs.connect(gf).connect(grindOut)
  gl.connect(grindOut)
  gs.start()
  gl.start()
  Object.assign(live, { ready: true, out, pan, lp, oscs, whine, whineGain, roll, rumble, flange, grindOut, gpan, gf })
}
onStart(buildEngine)

function clack(x, s) {
  if (!voice(0.2)) return
  const t = now()
  for (const d of [0, 0.075]) {
    burst({ t: t + d, noise: 'brown', type: 'lowpass', f: 900, a: 0.001, d: 0.06, gain: 0.5 * s.vol, pan: s.pan, verb: 0.1 })
    modal({ t: t + d, f: rnd(620, 820), modes: METAL, decay: 0.08, gain: 0.05 * s.vol, pan: s.pan })
  }
  void x
}

export function trainTick(t, dt) {
  if (!live.ready) return
  const set = (param, v, tc = 0.08) => param.setTargetAtTime(v, A.ctx.currentTime, tc)
  if (!t || t.state !== 'run') {
    set(live.out.gain, 0, 0.3)
    return
  }
  // The part of the train nearest the listener carries the sound.
  const headX = t.head
  const tailX = t.head + t.length
  const nearX = Math.max(headX, Math.min(tailX, cam.pos.x))
  const s = at(nearX, TRACK.z)
  const speedK = t.speed / 30
  set(live.out.gain, s.vol * (0.6 + speedK * 0.5))
  set(live.pan.pan, s.pan, 0.05)
  // Doppler from the head's motion toward the listener.
  const dx = cam.pos.x - headX
  const d = Math.hypot(dx, cam.pos.z - TRACK.z) || 1
  const closing = ((dx / d) * -t.speed) / 340
  const doppler = headX > cam.pos.x ? 1 + Math.abs(closing) * 2.4 : 1 - Math.abs(closing) * 2.4
  for (const { o, ratio } of live.oscs) set(o.frequency, (34 + 26 * speedK) * ratio * doppler)
  set(live.whine.frequency, (1100 + 900 * speedK) * doppler)
  set(live.lp.frequency, 220 + 300 * speedK + (1 - s.far) * 200)
  set(live.roll.f.frequency, (640 + 720 * speedK) * doppler)
  set(live.roll.g.gain, 0.3 + speedK * 0.45)
  // Brakes bite: the flange screech that follows a hit.
  set(live.flange.g.gain, t.brake * 0.42, 0.05)
  set(live.flange.f.frequency, 2700 + t.brake * 1500, 0.05)
  // Wheels over rail joints every 18 m, four bogies in a row.
  live.joint += t.speed * dt
  if (live.joint > 7.5) {
    live.joint = 0
    clack(nearX, s)
  }
}

export function grind(speed, x, z) {
  if (!live.ready) return
  const s = at(x, z)
  const k = Math.min(1, speed / 16)
  live.grindOut.gain.setTargetAtTime(k * s.vol * 0.9, A.ctx.currentTime, 0.1)
  live.gpan.pan.setTargetAtTime(s.pan, A.ctx.currentTime, 0.1)
  live.gf.frequency.setTargetAtTime(420 + speed * 42, A.ctx.currentTime, 0.1)
}

// Rails singing as a train closes in.
export function railHum(k) {
  if (!live.ready || k <= 0) return
  burst({ f: rnd(2400, 3600), q: 12, a: 0.03, d: 0.5, gain: 0.05 * k })
}

// --- Rewards + UI -----------------------------------------------------------------------------
export function coin(pitch = 1) {
  if (!voice(0.35)) return
  const t = now()
  modal({ t, f: vary(2350 * pitch, 0.04), modes: COIN, gain: 0.1, strike: 0.08, verb: 0.2 })
  modal({ t: t + 0.05, f: vary(3100 * pitch, 0.04), modes: COIN, gain: 0.08, verb: 0.2 })
}

export function coinFall(x, z) {
  if (!voice(0.5)) return
  const s = at(x, z)
  const t = now()
  for (let i = 0; i < 5; i++) modal({ t: t + i * 0.05 + rnd(0, 0.03), f: rnd(1900, 3400), modes: COIN, gain: 0.05 * s.vol, pan: s.pan, verb: 0.2 })
}

// Stopped a train: a brass stab and a shower of coins.
export function victory() {
  if (!ready()) return
  const t = now() + 0.2
  for (const [d, chord] of [[0, [349, 440, 523]], [0.16, [392, 494, 587]], [0.34, [523, 659, 784, 1047]]]) {
    for (const f of chord) {
      tone({ t: t + d, type: 'sawtooth', f, a: 0.012, hold: d > 0.3 ? 0.42 : 0.08, d: 0.4, gain: 0.05, lp: 2400, verb: 0.4, bus: A.ui })
    }
  }
  for (let i = 0; i < 26; i++) {
    modal({ t: t + 0.3 + i * rnd(0.03, 0.07), f: rnd(1900, 3800), modes: COIN, gain: rnd(0.03, 0.07), pan: rnd(-0.6, 0.6), verb: 0.25, bus: A.ui })
  }
}

export function failed() {
  if (!ready()) return
  const t = now()
  for (const [d, f] of [[0, 330], [0.18, 277], [0.36, 220]]) tone({ t: t + d, type: 'triangle', f, f2: f * 0.97, d: 0.34, gain: 0.12, lp: 1400, verb: 0.3, bus: A.ui })
}

export function tick(n) {
  if (!ready()) return
  modal({ f: n <= 3 ? 1320 : 990, modes: [[1, 1, 0.08], [2.7, 0.4, 0.05]], gain: 0.14, strike: 0.2, bus: A.ui })
}

export function click(pan = 0) {
  if (!ready()) return
  const t = now()
  burst({ t, f: 2400, q: 1.4, a: 0.001, d: 0.022, gain: 0.26, pan, bus: A.ui })
  tone({ t, f: 520, f2: 300, d: 0.05, gain: 0.1, pan, bus: A.ui })
}

export function buy() {
  if (!ready()) return
  const t = now()
  for (const [d, f] of [[0, 660], [0.07, 880], [0.14, 1320]]) modal({ t: t + d, f, modes: COIN, gain: 0.09, bus: A.ui })
}

export function deny() {
  if (!ready()) return
  const t = now()
  for (const d of [0, 0.11]) tone({ t: t + d, type: 'square', f: 150, d: 0.09, gain: 0.08, lp: 900, bus: A.ui })
}

export function windowOpen() {
  if (!ready()) return
  burst({ f: 500, f2: 2200, q: 1, a: 0.03, d: 0.12, gain: 0.12, bus: A.ui })
}

export function padEnter() {
  if (!ready()) return
  tone({ type: 'triangle', f: 440, f2: 880, d: 0.18, gain: 0.1, bus: A.ui })
}

// --- Ambience -----------------------------------------------------------------------------------
function buildAmbience(ctx) {
  const src = ctx.createBufferSource()
  src.buffer = A.noise.pinkStereo
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 520
  f.Q.value = 0.4
  const g = ctx.createGain()
  g.gain.value = 0.11
  src.connect(f).connect(g).connect(A.amb)
  src.start()
  // Breeze: the wind's level and pitch wander on two slow LFOs.
  for (const [rate, depth, param] of [[0.07, 180, f.frequency], [0.11, 0.05, g.gain]]) {
    const l = ctx.createOscillator()
    l.frequency.value = rate
    const d = ctx.createGain()
    d.gain.value = depth
    l.connect(d).connect(param)
    l.start()
  }
}
onStart(buildAmbience)

let birdCd = 3
function bird() {
  const t = now()
  const f = rnd(2300, 3900)
  const pan = rnd(-0.8, 0.8)
  const notes = 2 + Math.floor(Math.random() * 4)
  const shape = pick([1, -1])
  for (let i = 0; i < notes; i++) {
    tone({ t: t + i * rnd(0.09, 0.14), f: f * (1 + i * 0.03 * shape), f2: f * (1 + shape * 0.16), d: 0.07, a: 0.01, gain: 0.018, pan, verb: 0.5, bus: A.amb })
  }
}

// Every frame: listener position, birdsong.
export function updateAudio(dt, camera) {
  cam.pos.copy(camera.position)
  cam.right.setFromMatrixColumn(camera.matrixWorld, 0)
  if (!ready()) return
  birdCd -= dt
  if (birdCd <= 0) {
    birdCd = rnd(2.5, 9)
    bird()
  }
}

export function installAudio() {
  installCore()
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button > 0) return
      const b = e.target.closest?.('button, [role="button"]')
      if (!b || b.disabled) return
      click(Math.max(-0.6, Math.min(0.6, (e.clientX / window.innerWidth - 0.5) * 1.2)))
    },
    { capture: true, passive: true },
  )
}
