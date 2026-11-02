// Audio core: one AudioContext for the whole game, made on the first user
// gesture (browsers refuse to start audio before one; iOS also needs a sound
// started inside that gesture). Everything is synthesised at runtime, no files.
//
// Graph:  ui ─────────────────────────────┐
//         sfx ──┬──────────────────────────┤
//               └─ reverb send ─ convolver ┤
//         world (duck) ─┬─ amb ────────────┼─ master ─ glue comp ─ limiter ─ out
//                       └─ engine ─────────┘
// `world` dips while a menu window is open so the UI sits on top of the scene.
// The reverb is a generated impulse response: a few early reflections (the
// cliffs and stalls) and a short, darkening tail, so one-shots sit in the beach
// instead of sounding pasted on top of it.
import { AUDIO, COARSE_POINTER } from '../config.js'
import { onChange, setMutedPref } from '../progress.js'

export const A = {
  ctx: null,
  master: null,
  ui: null,
  sfx: null,
  verb: null, // reverb send input
  world: null,
  amb: null,
  engine: null,
  noise: {}, // white / pink / brown mono buffers, pinkStereo for beds
  voices: 0, // one-shot voices sounding now (see voice())
}

const startHooks = []
let ducked = false // menu window open: see setDucked
// fn(ctx) runs once the context exists (immediately if it already does).
export function onStart(fn) {
  if (A.master) fn(A.ctx)
  else startHooks.push(fn)
}

// --- Volume + mute (mute is saved with the account) ---------------------------------------------------
let volume = AUDIO.volume
let muted = false
let pref = false // the saved choice (progress.js, stored by the backend)
onChange((s) => {
  if (s.muted === pref) return
  pref = muted = s.muted
  applyLevel()
})
const level = () => (muted ? 0 : volume * volume) // perceptual: the slider feels even
function applyLevel(t = 0.05) {
  if (A.master) A.master.gain.setTargetAtTime(level(), A.ctx.currentTime, t)
}
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, Number(v) || 0))
  applyLevel()
}
export const isMuted = () => muted
// remember = false for a temporary mute (ad breaks): not saved.
export function setMuted(on, remember = true) {
  muted = !!on
  if (remember) {
    pref = muted
    setMutedPref(muted)
  }
  applyLevel()
}
export const toggleMuted = () => setMuted(!muted)

// --- Noise -------------------------------------------------------------------------
function makeNoise(ctx, seconds, kind, channels = 1) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(channels, len, ctx.sampleRate)
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (kind === 'white') d[i] = w * 0.5
      else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      } else {
        // Paul Kellet's pink filter.
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      }
    }
    // Crossfade the ends so a looping buffer has no click at the seam.
    const fade = Math.min(2048, len >> 3)
    for (let i = 0; i < fade; i++) {
      const k = i / fade
      d[i] = d[i] * k + d[len - fade + i] * (1 - k)
    }
  }
  return buf
}

// Stereo impulse response: pre-delay, sparse early reflections, then a noise
// tail whose high end dies first (air + sand absorb the highs).
function makeImpulse(ctx) {
  const R = AUDIO.reverb
  const sr = ctx.sampleRate
  const len = Math.floor(sr * R.seconds)
  const buf = ctx.createBuffer(2, len, sr)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    const pre = Math.floor(sr * R.preDelay)
    for (const [ms, g] of R.early) {
      const i = pre + Math.floor(sr * (ms / 1000) * (c ? 1.07 : 0.94))
      if (i < len) d[i] += g * (Math.random() < 0.5 ? -1 : 1)
    }
    let lp = 0
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr
      const k = Math.min(0.95, 0.15 + t * R.darken) // one-pole lowpass that closes over time
      lp += (1 - k) * ((Math.random() * 2 - 1) - lp)
      d[i] += lp * Math.exp((-6.9 * t) / R.decay) * R.tail
    }
  }
  return buf
}

// The context itself is made inside the gesture (autoplay rules); the noise buffers,
// the reverb IR and the bus graph (~2M generated samples: a hitch on a phone) follow
// a moment later, so the first tap doesn't stall the frame it lands in.
function build() {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return false
  let ctx
  try {
    ctx = new AC({ latencyHint: COARSE_POINTER ? AUDIO.latencyTouch : AUDIO.latency })
  } catch {
    try {
      ctx = new AC() // an old engine that rejects a numeric hint
    } catch {
      return false
    }
  }
  A.ctx = ctx
  setTimeout(buildGraph, 0)
  return true
}

function buildGraph() {
  const ctx = A.ctx
  A.noise.white = makeNoise(ctx, 2, 'white')
  A.noise.pink = makeNoise(ctx, 4, 'pink')
  A.noise.brown = makeNoise(ctx, 4, 'brown')
  A.noise.pinkStereo = makeNoise(ctx, 6, 'pink', 2)
  A.noise.brownStereo = makeNoise(ctx, 6, 'brown', 2)

  const glue = ctx.createDynamicsCompressor() // gentle bus glue
  glue.threshold.value = -18
  glue.knee.value = 12
  glue.ratio.value = 2.5
  glue.attack.value = 0.01
  glue.release.value = 0.25
  const limit = ctx.createDynamicsCompressor() // brick wall so a stack of rewards never clips
  limit.threshold.value = -3
  limit.knee.value = 0
  limit.ratio.value = 20
  limit.attack.value = 0.002
  limit.release.value = 0.1
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(glue).connect(limit).connect(ctx.destination)

  const bus = (gain, to = master) => {
    const g = ctx.createGain()
    g.gain.value = gain
    g.connect(to)
    return g
  }
  A.ui = bus(AUDIO.buses.ui)
  A.sfx = bus(AUDIO.buses.sfx)
  A.world = bus(ducked ? AUDIO.duck : 1)
  A.amb = bus(AUDIO.buses.amb, A.world)
  A.engine = bus(AUDIO.buses.engine, A.world)
  const conv = ctx.createConvolver()
  conv.buffer = makeImpulse(ctx)
  A.verb = ctx.createGain()
  A.verb.gain.value = AUDIO.reverb.send
  A.verb.connect(conv).connect(master)
  A.master = master // last: ready() (and every sound) waits for the whole graph

  applyLevel(0.3) // fade in, no thump at start
  for (const fn of startHooks.splice(0)) {
    try {
      fn(ctx)
    } catch (e) {
      console.warn('[audio]', e) // one broken layer must not take the rest down
    }
  }
}

// iOS only opens the output for a sound started inside the gesture itself.
function kick() {
  const src = A.ctx.createBufferSource()
  src.buffer = A.ctx.createBuffer(1, 1, A.ctx.sampleRate)
  src.connect(A.ctx.destination)
  src.start()
}

function unlock() {
  if (!A.ctx && !build()) return
  if (A.ctx.state !== 'running' && !document.hidden) A.ctx.resume?.().catch(() => {})
  kick()
}

export function installAudio() {
  for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, unlock, { capture: true, passive: true })
  // A hidden tab goes silent (and stops costing battery).
  document.addEventListener('visibilitychange', () => {
    if (!A.ctx) return
    if (document.hidden) A.ctx.suspend?.().catch(() => {})
    else A.ctx.resume?.().catch(() => {})
  })
}

export const ready = () => !!A.master && A.ctx.state === 'running'
// Start time for a one-shot: a hair ahead of the clock, so the nodes reach the audio
// thread before their envelope begins even if the main thread stalls right after.
export const now = () => A.ctx.currentTime + AUDIO.lead

// Menu window open: the world (ambience + engine) steps back.
export function setDucked(on) {
  if (on === ducked) return
  ducked = on
  if (A.world) A.world.gain.setTargetAtTime(on ? AUDIO.duck : 1, A.ctx.currentTime, 0.12)
}

// One-shot voice budget: a burst of rewards on a weak phone skips the extras
// instead of crackling. Returns false when the voice should not play.
const MAX_VOICES = COARSE_POINTER ? AUDIO.maxVoicesTouch : AUDIO.maxVoices
export function voice(seconds, priority = 1) {
  if (!ready()) return false
  if (A.voices > MAX_VOICES * priority) return false
  A.voices++
  setTimeout(() => A.voices--, seconds * 1000 + 50)
  return true
}
