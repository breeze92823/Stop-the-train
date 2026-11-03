// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
// Slug registered on bloxity.io (Legion.SDK.init + the matchmaker). Set VITE_GAME_SLUG when it differs.
export const GAME_SLUG = import.meta.env.VITE_GAME_SLUG || 'stop-the-train'
export const GAME_TITLE = 'Stop the Train'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
// The lobby: a lego lawn walled in by checkered brown terraces. North is the
// railway, the middle the spawn plaza, south the Vehicle Yard, east the gym, west the
// Fuse Machine, portal, mailbox and leaderboards.
export const LOBBY = {
  west: -118, // walkable edges; the terraces start here
  east: 118,
  north: -62,
  south: 88,
  fenceHeight: 22, // invisible wall along those edges (wrecks bounce off it too)
  groundSize: 620, // m, the lawn plane
  tile: 5, // m per ground texture repeat (a 2x2 checker)
  terraceStep: 3, // m per voxel layer
  terraceCell: 6, // m per voxel column
}
export const SPAWN = { x: 0, y: 0.4, z: 23 } // on the plaza's pad
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z, north)

// The railway, east-west along z. Trains run from the east tunnel to the west one.
export const TRACK = {
  z: -25,
  mouth: 92, // |x| of each tunnel mouth
  end: 176, // |x| where the rails end, hidden inside the mountain
  top: 0.3, // y of the rail heads: what wheels and parked vehicles stand on
  gauge: 2.2, // m between the rails
  tieEvery: 1.9,
  tieLength: 4.6,
  bedHalfWidth: 2.4, // half-width of the solid strip vehicles rest on
  placeHalf: 74, // vehicles can only be parked this far from x = 0
  placeReach: 10, // m from the rail the player can park from
}

// Where the set pieces stand (lobby.js). yaw 0 faces south.
export const SET = {
  stall: { x: -20.5, z: -7, yaw: 0.42, ring: { x: -16.5, z: 0.4, r: 3 } },
  fuse: { x: -26.5, z: 3.8, yaw: 0.7, ring: { x: -20.5, z: 11, r: 3.8 } },
  chest: { x: 22, z: -7, yaw: -0.98, ringR: 2, reach: 5 },
  plaza: { x0: -11, x1: 11, z0: 12, z1: 34, height: 0.34, pad: 4.4 },
  hpSign: { x: -1, z: -16 }, // the "2,316,125 / 32 VEHICLES" lying on the lawn
  trainSign: { x: 4, y: 24, z: -30 }, // the floating CURRENT TRAIN board
  chevrons: { x: -1, zFrom: 8, zTo: -8, count: 4 },
  mailbox: { x: -22.7, z: 29.3 },
  portal: { x: -29, z: 20.5, yaw: 1.42, ring: { x: -24, z: 20.5, r: 3 } },
  // South to north along the platform, as they read from the lawn.
  boards: {
    x: -48,
    z: 22,
    list: [
      { z: 30.5, height: 8.2, width: 6.4, title: 'MOST REBIRTHS', colors: ['#ff6cf0', '#c81fd0'], stat: 'rebirths' },
      { z: 22, height: 10, width: 7, title: 'MOST TRAIN BREAKS', colors: ['#fff36a', '#ffb400'], stat: 'breaks' },
      { z: 13.5, height: 8.2, width: 6.4, title: 'MOST STRENGTH', colors: ['#d6ff5a', '#4fd02a'], stat: 'strength' },
    ],
  },
  trainPower: { x: 80, y: 13.5, z: 16, height: 6.4 },
  collectSign: { x: -14, y: 13, z: 68 },
  diamondSign: { x: -2, y: 10.5, z: 72 },
}

// The Vehicle Yard: rows of bays south of the plaza, noses to the north. `req` is the
// strength needed to lift the vehicle and also its HP on the rail, times its variant.
export const VARIANTS = {
  normal: { mult: 1 },
  golden: { mult: 1.5, label: 'GOLDEN', labelColor: ['#fff36a', '#ffb400'], paint: '#ffc914', paint2: '#ffe873', flame: '#ffc53a', flow: 0.8 },
  emerald: { mult: 6, label: 'EMERALD', labelColor: ['#9dffb0', '#22d65a'], paint: '#28e03a', paint2: '#a8ff9c', flame: '#3cff5a', flow: 0.8 },
}
export const YARD = {
  bay: { width: 4.3, length: 7.6, line: 0.26 },
  rows: [
    {
      z: 46,
      x: 9,
      step: 4.9,
      bays: [
        { type: 'sedan', req: 5, paint: '#1231d8' },
        { type: 'supra', req: 25, paint: '#d10f1a' },
        { type: 'muscle', req: 150, variant: 'golden', paint: '#ffc914' },
        { type: 'camaro', req: 600, paint: '#ee1414' },
        { type: 'hyper', req: 1500, variant: 'emerald', paint: '#28e03a' },
        { type: 'gt', req: 6000, paint: '#16476e' },
        { type: 'wedge', req: 12000, paint: '#3a7a2c' },
        { type: 'hyper', req: 25000, paint: '#2a2f33' },
      ],
    },
    {
      z: 54,
      x: 9,
      step: 4.9,
      bays: [
        { type: 'bat', req: 50000, paint: '#101014' },
        { type: 'gt', req: 90000, paint: '#3c3d44' },
        { type: 'chopper', req: 125000, paint: '#17171c' },
        { type: 'forklift', req: 200000, paint: '#f08a1d' },
        { type: 'firetruck', req: 350000, paint: '#d3201f' },
        { type: 'heli', req: 600000, paint: '#1c2230' },
        { type: 'loader', req: 1e6, paint: '#e8891a' },
        { type: 'tank', req: 2.5e6, paint: '#4d5a36' },
        { type: 'veyron', req: 6e6, paint: '#f5c40e' },
        { type: 'mclaren', req: 15e6, paint: '#18a7e8' },
      ],
    },
  ],
  border: { x0: -44, x1: 14, z0: 39.5, z1: 62 }, // the dashed white line round the yard
  grabReach: 6, // m from a parked vehicle where its prompt shows
  labelReach: 36, // m the bay labels stay readable; past that they hide, like the reference
  holdSeconds: 2, // how long E has to be held to interact
  respawnSeconds: 8, // an emptied bay is a hologram this long
  carrySpeed: 0.85, // walk speed factor under a vehicle
  carryScale: 0.86, // a held vehicle is drawn a little smaller, like the reference
  headClear: 1.15, // m above the avatar's height the vehicle's underside sits (only when no hands can be found)
  carrySlow: 0.06, // walk speed lost for every extra vehicle in the stack
  carryFloor: 0.55, // ...down to this factor
  handSink: 0.1, // m the palms press into the underside of the lowest vehicle
  handReach: 1, // forearm length as a multiple of the upper arm: where the palm is past the elbow
  stackGap: 0.04, // m between stacked vehicles
  stackSway: 0.05, // m each level up leans as the player walks
}
export const MAILBOX_REACH = 4.5
export const FREE_COINS = { playSeconds: 30 * 60, value: 10000 } // s played (tab visible) per chest, tracked by the server (backend CHEST); coins per claim

// The gym: two rows of benches inside a dashed line, racks on the outer side, feet to the
// aisle. Bench x is the row's first column plus `step` per slot. `mult` multiplies every
// rep; `rebirths` unlocks it, `coins` sells it (a one-time buy). aura picks the effect in gym.js.
export const GYM = {
  border: { x0: 30, x1: 73, z0: 0, z1: 32 },
  bay: { width: 7.2, length: 9, line: 0.26 },
  firstX: 36.5,
  step: 9.2,
  rows: [{ z: 6.5, yaw: 0 }, { z: 25.5, yaw: Math.PI }],
  benches: [
    { id: 'starter', title: 'STARTER', titleColors: ['#ffffff', '#c9ced8'], powerColors: ['#fff36a', '#ffb400'], mult: 1, rebirths: 0, pad: '#3b3d4d', rim: '#2c2e3c', face: '#2c2e3c', plateR: 0.62, row: 0, slot: 0 },
    { id: 'r2', mult: 2, rebirths: 2, pad: '#c01cf0', padGlow: 1.3, rim: '#b320e8', face: '#3a2a55', plateR: 0.62, row: 0, slot: 1, aura: { kind: 'mist', rate: 5 } },
    { id: 'r3', mult: 3, rebirths: 3, pad: '#ffe11a', padGlow: 1.5, rim: '#ffd21a', face: '#3a3320', plateR: 0.68, row: 0, slot: 2, aura: { kind: 'electric', rate: 34, c1: '#fff46a', c2: '#ffb31a', swirl: 0.55, bolts: 2 } },
    { id: 'r5', mult: 5, rebirths: 5, pad: '#ee1820', padGlow: 1.5, rim: '#f01a22', face: '#2a1216', plateR: 0.72, row: 0, slot: 3, aura: { kind: 'ember', rate: 34, c1: '#ff7a1e', c2: '#ff2a10', swirl: 0.8 } },
    { id: 'r9', mult: 9, rebirths: 9, pad: '#b01ce8', padGlow: 1.7, rim: '#c42cff', face: '#35105a', plateR: 0.8, row: 1, slot: 0, aura: { kind: 'violet', rate: 60, c1: '#f0dcff', c2: '#a43cff', swirl: 1.1, bolts: 4 } },
    { id: 'r18', mult: 18, rebirths: 18, pad: '#ff8a10', padGlow: 1.8, rim: '#ffb01a', face: '#3a2208', plateR: 0.84, row: 1, slot: 1, aura: { kind: 'fire', rate: 62, c1: '#ffe36a', c2: '#ff7a10', swirl: 1 } },
    { id: 'r36', mult: 36, rebirths: 36, pad: '#f0101c', padGlow: 2, rim: '#ff1a24', face: '#1a0608', plateR: 0.92, row: 1, slot: 2, aura: { kind: 'crimson', rate: 66, c1: '#ff5a30', c2: '#e00818', swirl: 1.3, bolts: 2 } },
    { id: 'admin', title: 'ADMIN', mult: 200, coins: 2000000, rainbow: true, plateR: 0.98, row: 1, slot: 3, aura: { kind: 'rainbow', rate: 76, c1: '#7dff5a', c2: '#c040ff', swirl: 1.2, bolts: 3 } },
  ],
  baseGain: 1.5, // Strength per half rep before the bench and the multiplier
  gainEvery: 0.3, // s: one gain at the top of each press and one at the bottom
  reach: 4.6, // m from a bench where its prompt shows
  transition: 0.5, // s to lie down and to get back up
  padTop: 1, // m, the top of the pad
  rackZ: -1.6, // m from the bench centre (bench space: +z runs to the feet)
  rackY: 2.3,
  barZ: -1.15, // over the chest
  barLow: 1.9,
  barHigh: 2.36,
  feetZ: 0.55,
  feetY: 1.28,
  auraReach: 80, // m past which a bench's effects stop being spawned
}

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character', 'player']
export const START_MODE = 'character'

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 8, // m/s
  sprintSpeed: 14, // m/s with Shift held
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 8.5, // m/s
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.45, // m autostep
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -6, // sank this far: respawn
}
export const PLAYER_DIMS = { radius: 0.75, height: 1.8 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0 }
export const FOG = { near: 230, far: 760 }
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#1a9bf0',
    horizon: '#cdeeff',
    sunColor: '#fff6e4',
    // Sun + hemi + env keep the toy colours near their own hue under the neutral tone map.
    sunIntensity: 1.9,
    sunElevation: 58, // degrees above the horizon
    sunAzimuth: 28, // degrees, 0 = from +Z
    hemiSky: '#f4f9ff',
    hemiGround: '#c4f0d0',
    hemiIntensity: 1.75,
    envIntensity: 0.55,
    lampIntensity: 0,
    stars: 0,
    exposure: 0.95,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.55,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a1a22',
    hemiIntensity: 0.35,
    envIntensity: 0.25,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.15,
  },
}
export const LIGHT = {
  shadowRange: 78, // half-width of the sun's shadow box around the player
  sunDistance: 170, // m the shadow camera stands off along the sun's direction
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// --- Worlds (theme.js, worlds.js; backend WORLDS) -------------------------------------
// The same game in another look: one map, one set of colliders, recoloured in place. Each world has
// its own rail, train and players on the server. `rebirths` is what entering takes (keep it equal to the
// backend's). `looks` overrides a surface by the key it was registered with (themeMaterial / themeColors),
// and a look with a, b repaints that lego surface; the portal shows the world it leads to.
const GALAXY_MOOD = { sunElevation: 58, sunAzimuth: 28, lampIntensity: 0, stars: 1 }
export const WORLD_TRAVEL = { fadeMs: 340, holdMs: 200 } // the warp hides the swap: fade in, hold, fade out
export const DEFAULT_WORLD = 'main'
export const WORLDS = {
  main: {
    id: 'main',
    name: 'Main World',
    title: 'MAIN WORLD',
    subtitle: 'BACK ON SOLID GROUND',
    rebirths: 0,
    sky: TIME_OF_DAY,
    clouds: true,
    ambience: 'earth',
    // Where this world's portal leads, and how it reads.
    portal: { to: 'galaxy', sub: '36 REBIRTHS', colors: ['#ff7af0', '#b325ff'], subColors: ['#ff5cf2', '#a020f0'], outline: '#1d0a3a', deep: [0.2, 0.03, 0.55], mid: [1, 0.5, 0.95], pale: [1, 0.92, 1] },
    looks: {},
  },
  galaxy: {
    id: 'galaxy',
    name: 'Galaxy World',
    title: 'GALAXY WORLD',
    subtitle: 'ONLY THE STRONGEST MAKE IT HERE',
    rebirths: 36,
    sky: {
      day: { ...GALAXY_MOOD, zenith: '#0a0638', horizon: '#3c1c86', sunColor: '#dfe2ff', sunIntensity: 1.8, hemiSky: '#c9c4ff', hemiGround: '#5a48b4', hemiIntensity: 1.7, envIntensity: 0.6, exposure: 1, nebula: 1 },
      night: { ...GALAXY_MOOD, zenith: '#02010f', horizon: '#150a3c', sunColor: '#8fa4ff', sunIntensity: 1, sunElevation: 38, sunAzimuth: -60, hemiSky: '#6a64c8', hemiGround: '#221a58', hemiIntensity: 0.95, envIntensity: 0.3, exposure: 1.1, nebula: 0.7 },
      // Painted once into the sky (paintNebula): soft clouds of colour, the galaxy's band, the stars.
      nebula: {
        seed: 1981,
        clouds: 34,
        colors: ['#ff2fb4', '#7a2cff', '#2a5cff', '#17d6ff', '#c02cff'],
        band: { tilt: 0.42, color: '#d9c8ff' },
        stars: 2600,
      },
    },
    clouds: false,
    ambience: 'space',
    stardust: { rate: 16, reach: 30, height: 15, kinds: ['violet', 'cyan', 'magic'] }, // specks drifting round the player
    planets: [
      { x: -300, y: 190, z: -330, r: 92, tilt: 0.3, seed: 11, bands: ['#f4c27a', '#d9824a', '#f7dcae', '#b4552e', '#eeb36a'], ring: { color: '#ffe0b0', inner: 1.35, outer: 2.35, tiltX: 1.9, tiltY: 0.35 } },
      { x: 360, y: 150, z: -240, r: 56, tilt: -0.2, seed: 23, bands: ['#2ad1ff', '#1a6cf0', '#7ff0ff', '#1440b8'] },
      { x: 300, y: 250, z: 340, r: 38, tilt: 0.5, seed: 37, bands: ['#ff6fb1', '#c02a8c', '#ffb0d8', '#7a1a78'] },
      { x: -380, y: 110, z: 300, r: 28, tilt: 0.1, seed: 41, bands: ['#b9bdd0', '#7f8399', '#dfe2ee', '#5d6078'] },
    ],
    belt: { count: 150, inner: 325, outer: 430, low: 40, high: 140, size: [2, 9], spin: 0.012, color: '#6c62a8' },
    portal: { to: 'main', sub: 'GO BACK', colors: ['#a4ffcf', '#1fd68a'], subColors: ['#ffffff', '#a4ffcf'], outline: '#04291c', deep: [0.02, 0.2, 0.4], mid: [0.15, 0.85, 0.6], pale: [0.9, 1, 0.95] },
    looks: {
      lawn: { a: '#140c46', b: '#1c1260' },
      terraceTop: { hue: 0.8, sat: 0.72, light: 1 },
      terraceWall: { a: '#22155e', b: '#31207e', emissiveIntensity: 0.42 },
      mountain: { hue: 0.54, sat: 1, light: 0.82 },
      ties: { color: '#7a6cc4' },
      chevron: { arrow: '#69e6ff' },
      bayLine: { color: '#8fe0ff' },
      portalRing: { color: '#5dffbc' },
      chestRing: { color: '#ffd93a' },
      trunkA: { color: '#2c2268', emissive: '#3b1fa8', emissiveIntensity: 0.5 },
      trunkB: { color: '#3b2c84', emissive: '#4a24c4', emissiveIntensity: 0.5 },
      leafA: { color: '#1ce6d4', emissive: '#0bb5a8', emissiveIntensity: 0.75 },
      leafB: { color: '#ff5fd6', emissive: '#c81fa0', emissiveIntensity: 0.75 },
      bush: { a: '#c026d3', b: '#d946ef' },
      teal: { a: '#22d3ee', b: '#38bdf8' },
      stub: { color: '#47309c' },
      rock: { color: '#8b7fd8' },
      tuft: { color: '#3fe8ff', emissive: '#12a5c4', emissiveIntensity: 0.6 },
      flower: { color: '#7dffef', emissive: '#27d8c4', emissiveIntensity: 0.8 },
      pinkFlower: { color: '#ff8af0', emissive: '#e23fd0', emissiveIntensity: 0.8 },
    },
  },
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.82, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35, railCap: 24 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6, railCap: 40 },
  High: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1, railCap: 60 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1.3, railCap: 80 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: neon rails, waterfall, VIP gate, particles. Sunlit sand
// stays under the threshold.
export const BLOOM = { strength: 0.55, radius: 0.5, threshold: 1.6 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6, railCap: 30 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles), railCap: Math.min(p.railCap, cap.railCap) }
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.1,
  far: 1200,
  startPitch: 0.36, // radians above the horizon
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 14, // resting boom length, m
  minDistance: 2.5, // wheel in past this enters player mode
  maxDistance: 46,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 1.2, // look-at point as a fraction of player height
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 6, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
  shakeDecay: 3.2, // 1/s camera shake dies away
  shakeMax: 1.4, // m, the most a blast can throw the camera
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
  master_volume: { def: '80', type: 'number', min: 0, max: 100 },
  enable_chat: { def: 'true', type: 'bool' },
}

// --- Server (net.js, backend: Stop-the-train-backend, room "world") -------------------
// Deployed builds never get a URL: the Bloxity matchmaker hands out an endpoint (bloxity.js).
// VITE_SERVER_URL points local dev at `npm start` of the backend (ws://localhost:2567).
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''
export const NET = {
  saveEvery: 5, // s: a changed save is sent at most this often (and when the tab hides or closes)
  retry: 2, // s before the first reconnect; doubles after each failed resolve/join...
  retryMax: 30, // ...up to this (the matchmaker can hold a cold start for ~45 s)
  rejoin: 1, // s before resolving again after the room closed (e.g. its pod is being replaced)
  poseHz: 10, // this player's pose goes out at most this often (skipped while standing still)
  remoteLerp: 10, // 1/s: remote players ease toward their last pose
  maxRemotes: 24, // the nearest others drawn (fewer on touch)
  maxRemotesTouch: 10,
  remoteFade: 140, // m: others further than this are hidden
  nameTag: 60, // m: name tags only up close
  boardsEvery: 30, // s: the lobby leaderboards redraw at most this often
}

// Boxity leaderboards (Legion.SDK.leaderboard.define, up to 10). Keep ids, order, mode and reset
// identical to the backend's BOARDS (src/constants.ts): the server reports scores from saved state.
// `stat` is the progress.js field it reads; the lobby's three boards (SET.boards) show the same ids.
export const BOARDS = [
  { id: 'rebirths', label: 'Rebirths', stat: 'rebirths', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'breaks', label: 'Trains Derailed', stat: 'breaks', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'strength', label: 'Strength', stat: 'strength', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
]

// Rewarded ads (Legion.SDK.ads). Placement names: lowercase letters, digits and hyphens only.
// The reward is granted only once the server has verified the ad's token.
export const ADS = {
  chest: { placement: 'chest-refill', text: 'WATCH AN AD: REFILL THE FREE COINS CHEST' },
  minGap: 120, // s between ad offers
}

// Emotes (the Boxity wheel sends `play_emote`; the catalogue comes from the platform API).
export const EMOTE = { fade: 0.18, stopSpeed: 1.2 }

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
  // Overlays on top of the locomotion pose (animator.js). rate = 1/s toward the target weight.
  grip: {
    rate: 7,
    tremble: deg(2.4),
    pose: {
      LegL1: { x: deg(-74), z: deg(10) }, LegR1: { x: deg(-74), z: deg(-10) }, LegL2: { x: deg(104) }, LegR2: { x: deg(104) },
      Spine1: { x: deg(30) }, Spine2: { x: deg(12) }, Neck1: { x: deg(-30) },
      ArmL1: { x: deg(-58), z: deg(16) }, ArmR1: { x: deg(-58), z: deg(-16) }, ArmL2: { x: deg(10) }, ArmR2: { x: deg(10) },
    },
    bobY: -0.46,
  },
  carry: {
    rate: 9,
    pose: {
      ArmL1: { x: deg(-168), z: deg(-13) }, ArmR1: { x: deg(-168), z: deg(13) }, ArmL2: { x: deg(16) }, ArmR2: { x: deg(16) },
      Spine1: { x: deg(-5) }, Spine2: { x: deg(-3) }, Neck1: { x: deg(10) },
    },
    sway: deg(2.2), // the load rocks the arms as the player walks
  },
  // Lying on the bench, in the same character-space angles. rep 0 = bar at the chest.
  bench: {
    rate: 9,
    bottom: {
      ArmL1: { x: deg(-26), z: deg(-62) }, ArmR1: { x: deg(-26), z: deg(62) }, ArmL2: { x: deg(-108) }, ArmR2: { x: deg(-108) },
      LegL1: { x: deg(-58), z: deg(8) }, LegR1: { x: deg(-58), z: deg(-8) }, LegL2: { x: deg(112) }, LegR2: { x: deg(112) },
    },
    top: {
      ArmL1: { x: deg(-90), z: deg(-8) }, ArmR1: { x: deg(-90), z: deg(8) }, ArmL2: { x: deg(-8) }, ArmR2: { x: deg(-8) },
      LegL1: { x: deg(-58), z: deg(8) }, LegR1: { x: deg(-58), z: deg(-8) }, LegL2: { x: deg(112) }, LegR2: { x: deg(112) },
    },
  },
  toss: {
    seconds: 0.42,
    pose: {
      ArmL1: { x: deg(-104), z: deg(-8) }, ArmR1: { x: deg(-104), z: deg(8) }, ArmL2: { x: deg(4) }, ArmR2: { x: deg(4) },
      Spine1: { x: deg(16) }, Spine2: { x: deg(8) },
    },
  },
}

export const FONT_FAMILY = 'Fredoka'

// --- Rounds (game.js) ----------------------------------------------------------
export const ROUND = {
  countdown: 90, // s between trains
  firstCountdown: 79, // s before the very first train
  seedVehicles: 0, // parked on the rail in a brand-new lobby (none: the rail starts empty)
  warnSeconds: 6, // the last seconds tick, and the rails start to hum
  approachSeconds: 2.6, // s the train rumbles inside the tunnel before it shows
  wreckSeconds: 11, // s a derailed train burns before it is cleared away
  slowMo: { scale: 0.28, seconds: 0.95, ease: 0.7 }, // time dilation the instant a train derails
  // How a derailed train goes down (trains.js): it keeps its weight and momentum on the ground instead
  // of being thrown. hop m/s up as the wheels climb the rail; slew m/s sideways and yaw rad/s of the
  // nose swinging out; plough m/s^2 of drag at the locomotive's front corner for ploughSeconds (it
  // slews it and lets the wagons pile into it); tip rad/s^2 that levers a car onto its side until it
  // leans past tipLean (the up vector's y), for the locomotive and tipChance of the wagons (it has to
  // beat gravity's pull back over the wheels, ~11); slide m the wreck grinds along before it stops
  // (sets the friction); damping, the rest of the wreck's bleed.
  wreck: { hop: 1.1, slew: 3.5, yaw: 0.45, plough: 8, ploughSeconds: 1.5, tip: 24, tipSeconds: 1.2, tipLean: 0.5, tipChance: 0.4, slide: 34, linearDamping: 0.05, angularDamping: 0.45 },
  nextShownAt: [60, 54], // s left on the countdown while the HUD says NEXT TRAIN IS
  doubleChance: 0.3, // a new train pays X2 COINS this often
  throughShare: 0.4, // share of a pass's hit coins still dropped when the train gets through
}

// Trains, weakest first. A train's real HP is sized to the room (FAIR, fair.js); the tier with the
// nearest hp gives its name and look, and reward / hp is its pay rate (joined tier to tier on a log line).
// A train that gets through pays no reward and a new one is picked.
// wagons: 'box' | 'gondola' | 'tank'. aura: sparkles trailing the train.
export const TRAINS = [
  { id: 'common', name: 'COMMON', text: ['#f4f6f8', '#8b95a1'], hp: 12e3, reward: 120e3, speed: 25, wagons: ['box', 'gondola'], paint: '#6f7f91', trim: '#2f3a46', stripe: '#f2c230' },
  { id: 'uncommon', name: 'UNCOMMON', text: ['#c9ff4a', '#2fd24a'], hp: 60e3, reward: 677e3, speed: 27, wagons: ['box', 'tank', 'box'], paint: '#2e8b57', trim: '#123d2a', stripe: '#ffe06a' },
  { id: 'rare', name: 'RARE', text: ['#8fe2ff', '#2f8df0'], hp: 300e3, reward: 3.2e6, speed: 29, wagons: ['gondola', 'box', 'gondola'], paint: '#dfe9f2', trim: '#2a6fd0', stripe: '#39b6ff' },
  { id: 'epic', name: 'EPIC', text: ['#e7a8ff', '#a43cf0'], hp: 3e6, reward: 14e6, speed: 31, wagons: ['tank', 'box', 'tank', 'box'], paint: '#51308f', trim: '#1e1140', stripe: '#d27bff', aura: '#c76bff' },
  { id: 'legendary', name: 'LEGENDARY', text: ['#fff36a', '#ffb400'], hp: 57e6, reward: 57e6, speed: 33, wagons: ['box', 'gondola', 'box', 'gondola'], paint: '#8e2432', trim: '#3a0d16', stripe: '#ff9cc8', aura: '#ff7ad9' },
  { id: 'mythic', name: 'MYTHIC', text: ['#ff7a5c', '#e0121c'], hp: 500e6, reward: 420e6, speed: 35, wagons: ['tank', 'box', 'gondola', 'tank', 'box'], paint: '#b01218', trim: '#2a0508', stripe: '#ffcf3a', aura: '#ff3b2e' },
  { id: 'godly', name: 'GODLY', text: ['#fff7b0', '#f2b705'], hp: 4e9, reward: 3.1e9, speed: 36, wagons: ['gondola', 'tank', 'box', 'tank', 'gondola'], paint: '#e8c547', trim: '#6b4a05', stripe: '#ffffff', aura: '#ffd84a' },
  { id: 'divine', name: 'DIVINE', text: ['#e8fbff', '#6fd8ff'], hp: 35e9, reward: 24e9, speed: 37, wagons: ['box', 'tank', 'gondola', 'box', 'tank', 'box'], paint: '#f1f7fb', trim: '#5a9fc4', stripe: '#8fe9ff', aura: '#9fe8ff' },
  { id: 'cosmic', name: 'COSMIC', text: ['#9ab0ff', '#6a2cf0'], hp: 300e9, reward: 200e9, speed: 38, wagons: ['tank', 'gondola', 'tank', 'box', 'gondola', 'tank'], paint: '#1c1650', trim: '#0a0728', stripe: '#a56bff', aura: '#7b5cff' },
  { id: 'secret', name: 'SECRET', text: ['#ff9bf0', '#25e6c8'], hp: 2.5e12, reward: 1.6e12, speed: 40, wagons: ['box', 'tank', 'gondola', 'tank', 'box', 'gondola'], paint: '#0d0d12', trim: '#25e6c8', stripe: '#ff4fd8', aura: '#ff5ae0' },
]

// Fair trains (fair.js). Mirrors the backend FAIR in constants.ts: online the server applies it, offline game.js.
// Room power = sum over the players in a world of (their best vehicle's HP x their Carry level).
export const FAIR = {
  targetRatio: 2.2, // a train's HP = room power x this (before the ladder and the spread)
  minHp: 20, // the smallest train (a brand-new player)
  carryMax: 20,
  spread: { up: 0.2, upK: 1.6, down: 0.1, downK: 0.7 }, // sometimes a harder "challenge" train, sometimes an easier one
  ladder: { min: -3, max: 10, win: 1, loss: 1.5, up: 0.25, down: 0.15, floor: 0.6 }, // steps per win / loss: settles at ~60% stopped
  damageCap: 0.55, // online only: one player's share of the damage while others have vehicles in the pass
  rewardFloor: 0.1,
  overkill: { ratio: 3, cut: 0.5 },
  streak: { per: 0.1, max: 1 }, // +10% coins per train stopped in a row, up to +100%
  comebackAfter: 3, // losses in a row before a x2 COMEBACK train
  underdog: 0.5, // online: +50% coins for the weakest player of the room
  nearMiss: 0.4, // a train that got through with at most this share of its HP left was SO CLOSE
}

// Session goals (goals.js): three at a time, not saved. A finished set comes back with targets x grow.
// A goal pays `pay` x the reward of a train sized to the player; finishing all three pays `bonus` x that more.
export const GOALS = {
  set: [
    { id: 'stop', text: 'Stop {n} trains', n: 3 },
    { id: 'park', text: 'Park {n} vehicles', n: 10 },
    { id: 'train', text: 'Train for {n} min', n: 5, unit: 60 }, // counted in s, shown in minutes
  ],
  grow: 2,
  pay: 0.5,
  bonus: 2,
  minCoins: 500,
}

// Progress (progress.js). A new save starts at these numbers. `power` is the player's Strength.
export const PROGRESS = {
  start: { power: 1, coins: 0, luck: 0, multiplier: 1, rebirths: 0 },
  saveEvery: 2, // s between saves while Strength streams in from training
  offlineRatePerHour: 0.01, // of current power
  offlineCapHours: 24,
  offlineMinSeconds: 60, // shorter absences pay nothing and show no window
  dailyCooldown: 24 * 3600, // s
  updateCountdown: 5 * 86400 + 1 * 3600 + 10 * 60 + 49, // s the NEW UPDATE sign counts down
}

// Upgrade stall rows (the UPGRADES! window). level = start at a new save; the value shown is
// v0 + step * level, `fmt` writes it. Coin cost = cost * grow^(level - start). Upgrades are coins only; the first-level costs keep Magnet's 65 coins = 9 Robux (about 7.2 coins per Robux) as the yardstick.
// wired: magnet (coin pull radius), walkspeed (player.speedScale), cooldown (the chest), carry (how
// many vehicles are stacked in the hands; its value is the level). fuse is saved but waits for the Fuse Machine.
export const UPGRADES = [
  { id: 'magnet', title: 'MAGNET', art: 'magnet', c1: '#f5292c', c2: '#c60d12', start: 1, max: 20, v0: 4, step: 1, fmt: (v) => `${v} Radius`, cost: 65, grow: 1.5 },
  { id: 'carry', title: 'CARRY', art: 'carry', c1: '#d20ffb', c2: '#6207dc', start: 1, max: 5, v0: 0, step: 1, fmt: (v) => `${v} Carry Capacity`, cost: 715, grow: 3 },
  { id: 'cooldown', title: 'COOLDOWN', art: 'hourglass', c1: '#86fe11', c2: '#4cd80a', start: 0, max: 25, v0: 0, step: 2, fmt: (v) => `${v}% less Cooldown`, cost: 140, grow: 1.4 },
  { id: 'fuse', title: 'FUSE CD', art: 'fuse', c1: '#5a5af0', c2: '#ffff5a', horizontal: true, start: 0, max: 25, v0: 0, step: 2, fmt: (v) => `${v}% less Cooldown`, cost: 210, grow: 1.5 },
  { id: 'walkspeed', title: 'WALKSPEED', art: 'shoe', c1: '#18d4ff', c2: '#0a98f0', caps: true, start: 4, max: 20, v0: 16, step: 2, fmt: (v) => `${v} WALKSPEED`, cost: 65, grow: 1.35 },
]
// The Fuse Machine: bring `slots` vehicles to its pad and insert them one by one (E), then pay
// `cost` coins for a chance (the player's Luck %) at one vehicle with all their HP added up.
export const FUSE = { slots: 3, cost: 14000, reach: 2.5 }
export const VEHICLE_NAMES = {
  sedan: 'Volkscar', supra: 'Suprah', muscle: 'Mustong', camaro: 'Camarro', hyper: 'Hyperion', gt: 'GT-Arr', wedge: 'Wedgy', bat: 'Batmobil',
  chopper: 'Chopper', forklift: 'Forkly', firetruck: 'Agro', heli: 'Heli', loader: 'Loader', tank: 'Tankor', veyron: 'Veyronn', mclaren: 'McLaura',
}
export const WALK_BASE = 16 // the walkspeed value that moves at PHYSICS.walkSpeed

// Daily rewards (the DAILY REWARDS! window): a 7 day cycle, one claim per PROGRESS.dailyCooldown.
// kind: coins | power | luck | carry | rebirth | powerMult (a permanent multiplier on every rep)
export const DAILY = [
  { kind: 'coins', n: 2000, text: '2,000' },
  { kind: 'power', n: 100e3, text: '100K', tag: 'EPIC!' },
  { kind: 'luck', n: 20, text: '20%' },
  { kind: 'carry', n: 1, text: '+1 CARRY' },
  { kind: 'rebirth', n: 1, text: '+1 REBIRTH' },
  { kind: 'coins', n: 3.5e6, text: '3.5M' },
  { kind: 'powerMult', n: 5, text: 'x5 POWER', sub: 'PERMANENT', tag: 'OP!' },
]
export const REBIRTH = { base: 2200, grow: 1.6, startPower: 1000, luck: 10, skipCoins: 20000 } // Strength for the next rebirth; +1 multiplier, +luck. skipCoins: rebirth without the Strength reset
// Store: one-time coin buys (saved as levels[id] = 1). power2: every rep gains `mult` times more.
export const SHOP = { power2: { coins: 80000, mult: 2 } }

// Coins dropped by a smashed vehicle (coins.js). Each cluster is worth this share of its HP, times the multiplier. magnetScale: world units per Magnet radius.
export const COINS = { perCluster: 7, valueShare: 0.4, magnetScale: 1.4, pickup: 1.6, life: 40, max: 70 }

// --- Effects (fx.js) -----------------------------------------------------------
export const FX = {
  additive: 3400, // particle pool sizes at particles = 1
  smoke: 1100,
  debris: 240,
  wheels: 24,
  decals: 44,
  lights: 2,
}

// --- Audio (audio/) ------------------------------------------------------------
export const AUDIO = {
  volume: 0.85,
  buses: { ui: 0.8, sfx: 1, amb: 0.5, engine: 0.75 },
  duck: 0.5, // world level while a window is open
  maxVoices: 64,
  maxVoicesTouch: 28,
  latency: 0.04, // s, AudioContext latencyHint
  latencyTouch: 0.07,
  lead: 0.02, // s every one-shot is scheduled ahead
  // Generated impulse response: the cliffs around the lobby give a long, dark slap-back.
  reverb: {
    seconds: 3.2,
    preDelay: 0.03,
    early: [[64, 0.5], [118, 0.42], [187, 0.34], [263, 0.26], [371, 0.2], [520, 0.14]],
    decay: 2.4,
    tail: 0.3,
    darken: 2.2,
    send: 0.5,
  },
  hearing: 95, // m at which a sound has dropped to half volume
}

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}
