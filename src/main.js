import { Clock, Group, NeutralToneMapping, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three'
import { CAMERA, graphicsPreset, MAILBOX_REACH, RENDER, SET, TRACK, YARD } from './config.js'
import * as bloxity from './bloxity.js'
import { inputState, install as installInput, isHeld, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player, resetPlayer, respawn } from './player.js'
import { addShake, setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { onModeChanged, toggleMode } from './modes.js'
import { bodyCount, initPhysics, stepPhysics } from './physics.js'
import { createFx } from './fx.js'
import { createLobby } from './lobby.js'
import { createRail } from './rail.js'
import { createTrains } from './trains.js'
import { createYard } from './yard.js'
import { createGym } from './gym.js'
import { createCoins } from './coins.js'
import { createGame } from './game.js'
import { createShared } from './shared.js'
import { createWorlds } from './worlds.js'
import { createHud } from './hud.js'
import { addCoins, compact, loadProgress, state as progress } from './progress.js'
import { initNet, net, onBoards, sendCarry, sendEmote, sendPose, sendTrain, syncAvatar } from './net.js'
import { createRemotePlayers } from './remotePlayers.js'
import { createFuse } from './fuse.js'
import { tickVehicleMaterials } from './vehicles.js'
import * as sound from './audio/index.js'
import { A as AudioCore, isMuted, setMuted, setVolume } from './audio/core.js'
import { createLighting } from './lighting.js'
import { buildGround, createWorld, landColliders } from './world.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'

// Boot order: Bloxity SDK -> renderer -> Rapier (async wasm) -> ground + sky + lighting,
// player body -> avatar (async, swaps in when ready) -> loop. The SDK is optional at every step.
let lighting = null
let renderer = null
let postfx = null
let fx = null
let railCap = 60

// Settings come from the portal's settings menu (or their defaults offline).
function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'master_volume') setVolume(value / 100)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    fx?.setQuality(next.particles)
    railCap = next.railCap
    postfx?.setSize(window.innerWidth, window.innerHeight)
  }
}
bloxity.onSetting(applySetting)
bloxity.init()

// --- Renderer ---------------------------------------------------------------
// Integrated GPUs start on Medium whatever the portal asks for; High is an option once it holds up.
function gpuName() {
  const gl = document.createElement('canvas').getContext('webgl2')
  const ext = gl?.getExtension('WEBGL_debug_renderer_info')
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''
}
if (/Intel|Iris|UHD|Vega|Mali|Adreno|PowerVR|Apple GPU/i.test(gpuName()) && ['High', 'Ultra'].includes(bloxity.settings.graphics_quality)) {
  bloxity.settings.graphics_quality = 'Medium'
}
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = NeutralToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
installInput(() => bloxity.showMenu(), renderer.domElement) // Esc opens the portal menu

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

// --- Physics + ground + sky --------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()

lighting = createLighting(scene, renderer, preset)
const world = createWorld(scene) // the clouds
buildGround(scene)
landColliders()
createPlayerBody()
syncYawToPlayer()
railCap = preset.railCap
sound.installAudio()
fx = createFx(scene, preset)
fx.onDebrisLand((p, speed) => {
  if (speed > 7) sound.coinFall(p.x, p.z)
})
const lobby = createLobby(scene, fx, sound)

// E held on the keyboard, or a finger held on the on-screen prompt; a finished hold
// counts nothing more until the key comes back up.
const interact = {
  touch: false,
  spent: false,
  down() {
    const on = isHeld('KeyE') || this.touch
    if (!on) this.spent = false
    return on && !this.spent
  },
  reset() {
    this.spent = true
    this.touch = false
  },
}
const hud = createHud({
  onDrop: () => yard.drop(),
  onStop: () => gym.stop(),
  onHoldStart: () => {
    interact.touch = true
  },
  onHoldEnd: () => {
    interact.touch = false
  },
  railCap: () => railCap,
  onFuse: () => fuse.run(),
})
lobby.setHud(hud)
const rail = createRail(scene, fx, sound, {
  onChange: (hp, count) => lobby.updateHp(hp, count),
  onLand: (x, z, force) => addShake(0.12 * force),
})
const coins = createCoins(scene, fx, sound, addCoins)
const yard = createYard(scene, fx, sound, rail, hud, interact, (out) => animator?.handAnchor(out, YARD.handReach) ?? false)
const gym = createGym(scene, fx, sound, hud)
const fuse = createFuse({ rail, yard, hud, lobby, fx, sound })
player.onLockedJump = () => gym.stop()
// Assigned just below: trains and the round loop need each other.
const game = createGame({ fx, sound, hud, lobby, rail, coins, trains: { spawn: (...a) => trains.spawn(...a) } })
const trains = createTrains(scene, fx, sound, game.hooks)
game.seed()
const shared = createShared({ game, rail, trains, hud, sound })
const worlds = createWorlds({ game, rail, trains, fx, gym, hud, sound, lighting })
loadProgress()
// The server's save replaces the local cache once it answers (signed-in players).
initNet({ onWelcome: (report) => hud.openOffline(report) })
onBoards((data) => lobby.setBoards?.(data))

// --- Player avatar ----------------------------------------------------------
// The Bloxity base rig (player.glb; procedural fallback if it fails), dressed
// with the signed-in player's equipped cosmetics and body proportions. It
// rebuilds on customizer edits and sign-in/out.
const playerGroup = new Group()
scene.add(playerGroup)
let avatar = null
let animator = null
let generation = 0
let avatarReady = false

function setAvatar(next) {
  if (avatar) playerGroup.remove(avatar)
  disposeAnimator(animator)
  avatar = next
  playerGroup.add(avatar)
  animator = makeAnimator(avatar)
}

setAvatar(buildDefaultCharacter()) // visible immediately; replaced once the rig loads

async function loadAvatar() {
  // The SDK fires twice per change (optimistic + confirmed); only the newest load may land.
  const mine = ++generation
  try {
    const group = await loadBaseCharacter()
    if (mine !== generation) return
    const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
    await attachEquippedAccessories(group, equipped, { skinTextureUrl: bloxity.getSkinTextureUrl() })
    if (mine !== generation) return
    applyProportions(group, bloxity.authState.user ? bloxity.getProportions() : null)
    setAvatar(group)
  } finally {
    if (mine === generation) avatarReady = true
  }
}

let signedIn = null
bloxity.subscribeAuth((s) => {
  const now = !!s.user
  if (now !== signedIn) {
    signedIn = now
    loadAvatar() // also runs once at start to swap in the real rig
  }
})
bloxity.onAvatarChanged(() => {
  loadAvatar()
  syncAvatar() // the others see the new look
})
bloxity.onProportionsChanged(() => applyProportions(avatar, bloxity.getProportions()))
bloxity.onRespawnRequest(() => respawnNow())

// Remote players: their looks, animations, held vehicles and bench presses (net.js roster).
const remotes = createRemotePlayers(scene, { gym, localRoot: playerGroup, getPosition: () => player.renderPosition })

// Emotes from the portal's wheel: played on the local rig and replicated through the roster.
let emoting = false
bloxity.onEmote(async (id) => {
  if (!id) {
    animator?.stopEmote?.()
    return
  }
  const clip = (await bloxity.loadEmotes()).get(id)?.clip
  if (!clip || gym.active() || player.dead) return
  animator?.playEmote(clip)
  emoting = true
  sendEmote(id)
})

// A portal ad break pauses the game and mutes it; the sound level comes back afterwards.
let adPaused = false
let mutedBefore = false
bloxity.onAdBreak((on) => {
  adPaused = on
  if (on) {
    mutedBefore = isMuted()
    setMuted(true, false)
  } else setMuted(mutedBefore, false)
})

// Falling out of the world shows the portal's death screen; the player respawns only when it allows.
let death = null
player.onFall = () => {
  if (death) return true
  gym.stop(true)
  death = bloxity.showDeathScreen((n) => {
    if (n === 0 && death) hud.toast('Press RESPAWN to continue')
  })
  if (!death) return false
  return true
}

// --- Modes + keys --------------------------------------------------------------
onModeChanged((mode) => {
  playerGroup.visible = mode !== 'player' // first person: you are the camera
})
onKey('KeyV', toggleMode)
onKey('KeyQ', () => yard.drop())
onKey('KeyG', () => yard.drop())
onKey('KeyN', () => lighting.toggleDayNight())
function respawnNow() {
  if (player.dead) {
    // Only the portal's death screen may end a death, and only after its countdown.
    if (death?.respawn()) {
      death.hide()
      death = null
      respawn()
    }
    return
  }
  gym.stop(true)
  respawn()
}
onKey('KeyR', respawnNow)
installTouch({ mode: toggleMode, day: () => lighting.toggleDayNight(), respawn: respawnNow })

// Walk-in pads: the pink Upgrade ring opens its window, the mailbox the portal menu (as Esc does), the portal takes the player to the other world; the Fuse pad explains itself.
const ring = SET.stall.ring
const pads = [
  { x: ring.x, z: ring.z, r: ring.r, inside: false, enter: () => hud.openWindow('upgrade') },
  { x: SET.mailbox.x, z: SET.mailbox.z, r: MAILBOX_REACH, inside: false, enter: () => bloxity.showMenu() },
  { x: SET.fuse.ring.x, z: SET.fuse.ring.z, r: SET.fuse.ring.r, inside: false, enter: () => fuse.hint() },
  { x: SET.portal.ring.x, z: SET.portal.ring.z, r: SET.portal.ring.r, inside: false, enter: () => worlds.usePortal() },
]
function updatePads() {
  for (const p of pads) {
    const inside = Math.hypot(player.position.x - p.x, player.position.z - p.z) < p.r
    if (inside && !p.inside) {
      sound.padEnter()
      p.enter()
    }
    p.inside = inside
  }
}

// Footsteps follow the distance actually walked.
let stride = 0
let wasGrounded = true
let fallSpeed = 0
function updateFootsteps(dt) {
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  if (player.grounded) {
    if (!wasGrounded) sound.land(Math.min(1, fallSpeed / 16))
    stride += speed * dt
    if (stride > 2.3 && speed > 1) {
      stride = 0
      sound.footstep(yard.carrying())
    }
  } else if (wasGrounded && player.velocity.y > 3) sound.jump()
  fallSpeed = -player.velocity.y
  wasGrounded = player.grounded
}

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readySince = 0

// A GPU that cannot hold the frame rate is stepped down a preset at a time, so a laptop's
// integrated chip lands on a preset it can run instead of starting a slideshow.
const QUALITY_ORDER = ['Low', 'Medium', 'High', 'Ultra']
let quality = bloxity.settings.graphics_quality
let slowTime = 0
let settled = 0
function governQuality(real) {
  if (real >= 0.1) return // a hitch or a hidden tab says nothing about the GPU
  settled += real
  if (settled < 4) return // shader compiles at start-up
  slowTime = real > 1 / 40 ? slowTime + real : Math.max(0, slowTime - real * 2)
  if (slowTime < 2.5) return
  slowTime = 0
  settled = 0
  const i = QUALITY_ORDER.indexOf(quality)
  if (i > 0) {
    quality = QUALITY_ORDER[i - 1]
    applySetting('graphics_quality', quality)
  }
}

// This player's pose, held vehicle, bench and emote, for everyone else (net.js).
function sendPresence() {
  const v = player.velocity
  sendPose({
    x: +player.position.x.toFixed(2),
    y: +player.position.y.toFixed(2),
    z: +player.position.z.toFixed(2),
    yaw: +player.facing.toFixed(3),
    speed: +Math.hypot(v.x, v.z).toFixed(2),
    grounded: player.grounded,
    vy: +v.y.toFixed(2),
  })
  sendCarry(yard.heldSpec())
  sendTrain(gym.training())
  if (emoting && !animator?.isEmoting?.()) {
    emoting = false
    sendEmote('')
  }
}

function frame(real, elapsed) {
  if (adPaused) return
  governQuality(real)
  shared.update()
  game.update(real)
  const dt = real * game.g.timeScale

  stepPhysics(dt) // runs the player controller + world at the fixed rate, interpolates bodies
  interpolatePlayer()

  const p = player.renderPosition
  playerGroup.position.set(p.x, p.y, p.z)
  playerGroup.rotation.y = player.facing
  gym.placeAvatar(playerGroup)
  animator?.update(dt, {
    grounded: player.grounded,
    speed: Math.hypot(player.velocity.x, player.velocity.z),
    verticalVelocity: player.velocity.y,
    turn: 0,
    load: yard.anim,
    bench: gym.anim,
  })

  updateCamera(camera, real)
  world.update(dt, elapsed)
  lobby.update(dt, elapsed)
  tickVehicleMaterials(elapsed)
  yard.update(dt, elapsed, !hud.windowOpen() && !gym.active(), () => gym.want() ?? lobby.chestWant() ?? fuse.want(), () => fuse.wantInsert())
  gym.update(dt, elapsed, camera)
  if (gym.active() && interact.down()) {
    interact.reset()
    gym.stop()
  }
  sendPresence(dt)
  remotes.update(real)
  rail.update(dt)
  trains.update(dt)
  coins.update(dt, elapsed)
  fx.update(dt)
  updatePads()
  updateFootsteps(dt)
  sound.updateAudio(real, camera)
  hud.update(real, camera)
  lighting.update(dt, playerGroup.position)
  postfx.render()

  // Loading ends once the scene has drawn and the avatar has had its chance (max ~5 s).
  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
}

renderer.setAnimationLoop(() => {
  const real = Math.min(clock.getDelta(), 0.1) // clamp huge frames (tab switch, breakpoint)
  frame(real, clock.elapsedTime)
})

window.addEventListener('beforeunload', bloxity.teardown)

// Dev-only console hook, e.g. __game.teleport(-24, 0, 6, Math.PI / 2)
if (import.meta.env.DEV) {
  const teleport = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  // Steps the game by hand: playtesting scripts use it when the tab is not being drawn.
  let fake = 1000
  const advance = (seconds, step = 1 / 30) => {
    for (let t = 0; t < seconds; t += step) frame(step, (fake += step))
  }
  // ms per frame on this GPU, waiting for it to really finish.
  const bench = (n = 12) => {
    const gl = renderer.getContext()
    const px = new Uint8Array(4)
    const t0 = performance.now()
    for (let i = 0; i < n; i++) {
      frame(1 / 60, (fake += 1 / 60))
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    }
    return (performance.now() - t0) / n
  }
  window.__game = { sound, audioCore: AudioCore, player, scene, renderer, camera, postfx, bodies: bodyCount, toggleMode, teleport, game, rail, trains, yard, gym, fx, hud, coins, interact, advance, bench, applySetting, input: inputState, TRACK, progress, worlds, remotes, net }
}
