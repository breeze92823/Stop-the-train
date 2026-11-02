// Colyseus link to Stop-the-train-backend (room "world").
// The server holds a signed-in player's save: on join it answers `progress` (the saved doc),
// `noProgress` (new account, guest or no database: the local state becomes the first save) or
// `serverError` (the save could not be read: never overwrite it). From then on the whole snapshot is
// sent as `saveProgress` whenever it changed, at most every NET.saveEvery s, and when the tab hides.
// Guests are never saved by the server; their progress stays in the localStorage cache (progress.js).
// The room also relays presence (pose, held vehicle, bench, emote, Bloxity look) to everyone else,
// the top lists for the lobby boards, and rewarded-ad verification.
// Never throws and never blocks play: with no server the game runs on the local save and keeps trying.
import { Client } from '@colyseus/sdk'
import { DEV_MODE, NET, SERVER_URL } from './config.js'
import * as bloxity from './bloxity.js'
import { hydrate, onSave, reset, setOwner, snapshot, state as progress } from './progress.js'

export const net = {
  room: null,
  connected: false,
  hydrated: false, // a progress/noProgress answer arrived: saving is allowed
  boards: null, // { boards: { stat: [{ name, value }] }, ranks: { stat: n | null } } from the server
  get sessionId() {
    return this.room?.sessionId ?? null
  },
}

// --- Identity ----------------------------------------------------------------
// Signed-in players use their Bloxity id and token (the server verifies it); everyone else a
// per-browser guest id (never saved). Dev mode (no SDK) plays as a per-browser dev id, so a local
// server with Mongo keeps its progress across reloads.
function storedId(key, make) {
  try {
    let id = localStorage.getItem(key)
    if (!id) localStorage.setItem(key, (id = make()))
    return id
  } catch {
    return make()
  }
}
const rand = () => Math.random().toString(36).slice(2, 8)
const GUEST = storedId('stop-the-train.guest', () => `guest-${rand()}`)
const DEV = DEV_MODE ? storedId('stop-the-train.dev', () => `dev-${rand()}`) : ''

function identity() {
  if (DEV) return { userId: DEV, username: `Dev ${DEV.slice(4)}`, token: '' }
  const { user, guest } = bloxity.authState
  const id = user && (user._id || user.id || user.userId || user.uid)
  if (!id) return { userId: GUEST, username: guest?.displayName || guest?.username || 'Guest', token: '' }
  return { userId: String(id), username: bloxity.displayName(), token: bloxity.getToken() }
}

export const hasServer = () => !!(SERVER_URL || bloxity.canResolveServer())
const isGuest = () => sentId.startsWith('guest-')

// --- Saving ------------------------------------------------------------------
let playtime = 0 // s with the tab visible
let lastSaved = ''
let savedAt = 0
let sentId = '' // identity the server currently attributes saves to
let loadedId = '' // identity whose saved progress this tab has already loaded
let welcome = null // fn(gainedPower) once a server save loaded

const send = (type, payload) => {
  try {
    net.room?.send(type, payload)
  } catch (err) {
    console.warn('[net] send failed', type, err)
  }
}

export function saveNow() {
  if (!net.connected || !net.hydrated || isGuest()) return
  const snap = JSON.stringify({ ...snapshot(), playtime: Math.floor(playtime) })
  if (snap === lastSaved) return
  lastSaved = snap
  savedAt = performance.now()
  send('saveProgress', JSON.parse(snap))
}

// Handlers registered here are attached to every room this tab joins (reconnects included).
const handlers = []
export function onNetMessage(type, fn) {
  handlers.push([type, fn])
  net.room?.onMessage(type, fn)
}
export function sendNet(type, payload) {
  if (!net.connected) return false
  send(type, payload)
  return true
}

// --- Leaderboards -------------------------------------------------------------
const boardListeners = new Set()
export const onBoards = (fn) => {
  boardListeners.add(fn)
  if (net.boards) fn(net.boards)
}

// --- Rewarded ads -------------------------------------------------------------
// Plays the ad, has the server verify its token, and resolves true only once the server says valid.
let adWait = null
export async function requestAdReward(placement) {
  if (!net.connected || !bloxity.adsAvailable()) return false
  const ad = await bloxity.showRewardedAd(placement)
  if (!ad.completed || !ad.token) return false
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(false), 10000)
    const finish = (ok) => {
      clearTimeout(timer)
      adWait = null
      resolve(ok)
    }
    adWait = { placement, finish }
    send('adReward', { token: ad.token, placement })
  })
}

// --- Presence (remotePlayers.js) --------------------------------------------------
// What the others need to draw this player: pose, held vehicle, bench, emote and the Bloxity look.
// The latest pose rides on the join options so a (re)join shows up right away; the roster
// (`net.room.state.players`) carries everyone's.
const AVATAR_MAX = 3000 // backend AVATAR_MAX_LEN
function avatarJson() {
  if (!bloxity.authState.user) return ''
  const equipped = bloxity.getEquippedAvatar()
  if (!equipped) return ''
  for (const skin of [bloxity.getSkinTextureUrl(), null]) {
    try {
      const json = JSON.stringify({ equipped, proportions: bloxity.getProportions(), skin })
      if (json.length <= AVATAR_MAX) return json
    } catch {
      return ''
    }
  }
  return ''
}
const presence = { pose: null, carry: '', train: null }
let poseKey = ''
let poseAt = 0
// { x, y, z, yaw, speed, grounded, vy }: at most NET.poseHz a second, nothing while it stands still.
export function sendPose(pose) {
  presence.pose = pose
  if (!net.connected) return
  const now = performance.now()
  if (now - poseAt < 1000 / NET.poseHz) return
  const r = (v) => Math.round(v * 20) / 20
  const key = `${r(pose.x)}|${r(pose.y)}|${r(pose.z)}|${r(pose.yaw)}|${r(pose.speed)}|${pose.grounded}|${r(pose.vy)}`
  if (key === poseKey) return
  poseKey = key
  poseAt = now
  send('pose', pose)
}
let carryKey = ''
// The vehicle held overhead ({ type, paint, variant }) or null: sent when it changes.
export function sendCarry(spec) {
  const key = spec ? `${spec.type}|${spec.paint}|${spec.variant}` : ''
  presence.carry = spec
  if (!net.connected || key === carryKey) return
  carryKey = key
  send('carry', { spec })
}
let trainKey = ''
let trainAt = 0
// The bench in use and the bar phase ({ bench, rep }) while training, null otherwise.
export function sendTrain(t) {
  presence.train = t
  if (!net.connected) return
  const now = performance.now()
  const key = t ? `${t.bench}|${Math.round(t.rep * 20)}` : '-'
  if (key === trainKey || (t && now - trainAt < 1000 / NET.poseHz)) return
  trainKey = key
  trainAt = now
  send('train', t ? { bench: t.bench, rep: t.rep } : { bench: -1, rep: 0 })
}
// An emote (the platform's id, '' = stopped): the others replay it from the roster.
export function sendEmote(id) {
  sendNet('emote', { id })
}
let sentAvatar = ''
// The Bloxity look changed (customizer, sign-in/out): send it if it differs.
export function syncAvatar() {
  if (!net.connected) return
  const avatar = avatarJson()
  if (avatar === sentAvatar) return
  sentAvatar = avatar
  send('setAvatar', { avatar })
}
// Everyone in the room (sessionId -> roster entry), null when offline.
export const roster = () => (net.connected ? net.room?.state?.players ?? null : null)

// --- Connection --------------------------------------------------------------
function attach(room) {
  net.room = room
  net.connected = true
  for (const [type, fn] of handlers) room.onMessage(type, fn)
  room.onMessage('progress', (doc) => {
    net.hydrated = true
    lastSaved = ''
    // A reconnect under the same identity: this tab is newer than the save (it may hold changes
    // not sent yet), so push it rather than load over it.
    if (loadedId === sentId || !doc) return saveNow()
    loadedId = sentId
    const gained = hydrate(doc)
    setOwner(sentId)
    welcome?.(gained)
    saveNow() // fills in whatever an older save lacked; a no-op send of the same values otherwise
  })
  room.onMessage('noProgress', () => {
    // New account, guest or no database. A guest's local play carries over to the new account;
    // another account's cache does not.
    net.hydrated = true
    lastSaved = ''
    const owner = progress.owner
    if (owner && owner !== sentId && !owner.startsWith('guest-')) reset()
    loadedId = sentId
    setOwner(sentId)
    saveNow()
  })
  room.onMessage('serverError', () => {
    // The save exists but could not be read: never overwrite it.
    net.hydrated = false
    console.warn('[net] server could not read the saved progress; saving is off for this session')
  })
  room.onMessage('leaderboard', (data) => {
    net.boards = data
    for (const fn of boardListeners) fn(data)
  })
  room.onMessage('adResult', (m) => {
    if (adWait && (!m?.placement || m.placement === adWait.placement)) adWait.finish(!!m?.ok)
  })
  room.onLeave(() => {
    if (net.room !== room) return
    net.room = null
    net.connected = false
    net.hydrated = false
    bloxity.updateRoom('')
    // Resolve again rather than rejoin the old endpoint: that is how players move off a pod being
    // replaced. Keep trying; play is unaffected meanwhile.
    setTimeout(connect, NET.rejoin * 1000)
  })
}

// The ?roomId= this page was opened with (Open Rooms Join / friend invite): tried on the first
// connect only, then normal matchmaking.
let launchRoom = bloxity.launchRoomId()
async function joinLaunchRoom(options) {
  const id = launchRoom
  launchRoom = ''
  if (!id) return null
  try {
    if (SERVER_URL) return { room: await new Client(SERVER_URL).joinById(id.split('~').pop(), options), relay: '' }
    const at = await bloxity.locateRoom(id)
    if (at) return { room: await new Client(at.endpoint).joinById(at.roomId, options), relay: at.relayRoomId }
  } catch (err) {
    console.info('[net] the invited room is gone or full; matchmaking instead', err?.message ?? err)
  }
  return null
}

// Deployed builds ask the matchmaker on every connect (a new Client per endpoint, each is pinned to
// one pod). userId lets it reuse this player's seat on retries; guest/dev ids are not Bloxity ids.
async function joinAnyRoom(options) {
  if (SERVER_URL) return { room: await new Client(SERVER_URL).joinOrCreate('world', options), relay: '' }
  const { endpoint, relayRoomId } = await bloxity.resolveServerEndpoint(/^(guest|dev)-/.test(options.userId) ? undefined : options.userId)
  return { room: await new Client(endpoint).joinOrCreate('world', options), relay: relayRoomId }
}

let connecting = false
let retryIn = NET.retry // s: backoff while the matchmaker / server can't be reached
async function connect() {
  if (!hasServer() || connecting || net.connected) return
  connecting = true
  try {
    const id = identity()
    sentId = id.userId
    sentAvatar = avatarJson()
    carryKey = presence.carry ? `${presence.carry.type}|${presence.carry.paint}|${presence.carry.variant}` : ''
    trainKey = ''
    poseKey = ''
    const options = { ...id, pfp: bloxity.getPfp(), avatar: sentAvatar, pose: presence.pose }
    const { room, relay } = (await joinLaunchRoom(options)) ?? (await joinAnyRoom(options))
    retryIn = NET.retry
    attach(room)
    if (presence.carry) send('carry', { spec: presence.carry })
    // relay~room lets an invited friend join this exact room through its pod's relay (bloxity.js locateRoom).
    bloxity.updateRoom(relay ? `${relay}~${room.roomId}` : room.roomId)
  } catch (err) {
    console.info(`[net] could not reach the server (retrying in ${retryIn}s); progress is saved on this device only`, err?.message ?? err)
    setTimeout(connect, retryIn * 1000)
    retryIn = Math.min(retryIn * 2, NET.retryMax)
  } finally {
    connecting = false
  }
}

// Playtime ticks once a second while the tab is visible.
setInterval(() => {
  if (document.hidden) return
  playtime += 1
}, 1000)

// opts.onWelcome(gainedPower): a server save loaded (the offline credit banner).
export function initNet(opts = {}) {
  welcome = opts.onWelcome ?? null
  // A change worth saving: sent at most every NET.saveEvery s.
  let timer = 0
  onSave(() => {
    if (timer) return
    const wait = Math.max(0, NET.saveEvery * 1000 - (performance.now() - savedAt))
    timer = setTimeout(() => {
      timer = 0
      saveNow()
    }, wait)
  })
  if (!hasServer()) return console.info('[net] no server configured; progress is saved on this device only')
  // The first ready call connects; later ones are sign-in / sign-out.
  bloxity.subscribeAuth((s) => {
    if (!s.ready) return
    if (!net.connected) return void connect()
    const id = identity()
    syncAvatar() // signed in / out: the others see the new look
    if (id.userId === sentId) return send('identify', { ...id, pfp: bloxity.getPfp() })
    saveNow() // under the old id, before switching
    net.hydrated = false
    sentId = id.userId
    send('identify', { ...id, pfp: bloxity.getPfp() })
  })
  window.addEventListener('pagehide', saveNow)
  document.addEventListener('visibilitychange', () => document.hidden && saveNow())
}
