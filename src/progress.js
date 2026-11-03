import { DAILY, FREE_COINS, GYM, PROGRESS, REBIRTH, SHOP, UPGRADES } from './config.js'

// The player's numbers. Signed-in players are saved by the backend (net.js: snapshot() goes out,
// hydrate() takes the server's save). Nothing is stored in the browser: guests and offline play
// live in memory for the session only. power is the Strength stat: it decides which vehicles can be lifted.
const now = () => Date.now() / 1000

export const state = {
  ...PROGRESS.start,
  levels: {},
  trainsStopped: {}, // the collection book: train tier id -> times stopped
  breaks: 0, // trains derailed
  robux: 0,
  strength: 0, // highest Strength ever reached (Strength resets on rebirth; the leaderboard ranks this)
  dailyAt: 0, // unix s of the last claim
  dailyDay: 0, // days claimed in this 7 day cycle
  powerMult: 1, // permanent multiplier on every rep (the Day 7 reward)
  chestPlay: 0, // s played toward the free coins chest (the server's count; not part of the save)
  updateEnds: 0, // unix s the NEW UPDATE sign reaches zero
  lastSeen: 0,
  seeded: false, // the first lobby's vehicles have been parked
  muted: false, // sound switched off (saved with the account)
}

// The fields the backend stores (its sanitize.ts): the whole save, sent as one snapshot.
const SAVED = ['power', 'coins', 'luck', 'multiplier', 'rebirths', 'levels', 'trainsStopped', 'breaks', 'robux', 'strength', 'dailyAt', 'dailyDay', 'powerMult', 'updateEnds', 'seeded', 'lastSeen', 'muted']
const MAPS = ['levels', 'trainsStopped'] // saved as copies
export const snapshot = () => {
  const out = {}
  state.strength = Math.max(state.strength, state.power)
  for (const k of SAVED) out[k] = MAPS.includes(k) ? { ...state[k] } : state[k]
  return out
}
// A new player's state (also what a different account starts from).
export function reset() {
  Object.assign(state, { ...PROGRESS.start, levels: {}, trainsStopped: {}, breaks: 0, robux: 0, strength: 0, dailyAt: 0, dailyDay: 0, powerMult: 1, chestPlay: 0, updateEnds: 0, lastSeen: 0, seeded: false, muted: false })
  state.updateEnds = now() + PROGRESS.updateCountdown
}
// The server's save over the local state. Anything it lacks stays a new player's value.
export function hydrate(doc) {
  reset()
  for (const k of SAVED) if (doc[k] !== undefined && doc[k] !== null) state[k] = MAPS.includes(k) ? { ...doc[k] } : doc[k]
  if (!state.updateEnds || state.updateEnds < now()) state.updateEnds = now() + PROGRESS.updateCountdown
  state.rebirths = Math.max(state.rebirths, state.multiplier - 1)
  state.strength = Math.max(state.strength, state.power)
  const report = offlineCredit(doc.serverTime)
  emit()
  return report
}
// Strength earned while away, from the last save's timestamp. Returns the report for the
// WELCOME BACK window, or null when nothing was earned.
// lastSeen is epoch ms (the backend stamps it when the player really leaves); older saves held seconds.
// The server's clock is used for "now" so a wrong local clock cannot change the pay.
function offlineCredit(serverTime) {
  if (state.lastSeen <= 0) return null
  if (state.lastSeen < 1e11) state.lastSeen *= 1000
  const nowMs = Number.isFinite(serverTime) ? serverTime : Date.now()
  const away = Math.max(0, (nowMs - state.lastSeen) / 1000)
  const hours = Math.min(PROGRESS.offlineCapHours, away / 3600)
  const gained = Math.floor(state.power * PROGRESS.offlineRatePerHour * hours)
  state.lastSeen = nowMs
  if (away < PROGRESS.offlineMinSeconds || gained <= 0) return null
  state.power += gained
  state.strength = Math.max(state.strength, state.power)
  return { gained, away, capped: away / 3600 >= PROGRESS.offlineCapHours, capHours: PROGRESS.offlineCapHours, perHour: Math.floor(state.power * PROGRESS.offlineRatePerHour) }
}
// While the game is open lastSeen keeps moving, so only time actually spent away is paid.
export function touchSeen() {
  save()
}
export function setMutedPref(on) {
  state.muted = !!on
  save()
  emit()
}

const listeners = new Set()
export const onChange = (fn) => {
  listeners.add(fn)
  fn(state)
}
const emit = () => {
  for (const fn of listeners) fn(state)
}

function save() {
  state.lastSeen = Date.now()
  for (const fn of saveListeners) fn()
}
// net.js: something worth sending changed.
const saveListeners = new Set()
export const onSave = (fn) => saveListeners.add(fn)

// Fresh session state; the server's save replaces it once it answers (net.js hydrate()).
export function loadProgress() {
  // Saves from before rebirths counted: the multiplier always was 1 + rebirths.
  state.rebirths = Math.max(state.rebirths, state.multiplier - 1)
  const t = now()
  if (!state.updateEnds) state.updateEnds = t + PROGRESS.updateCountdown
  save()
  emit()
  return null
}

export function addCoins(n) {
  state.coins += n
  save()
  emit()
}

let lastSave = 0
export function addPower(n) {
  state.power += n
  if (state.power > state.strength) state.strength = state.power
  const t = now()
  if (t - lastSave > PROGRESS.saveEvery) {
    lastSave = t
    save()
  }
  emit()
}

// A derail this player was paid for: counted on the boards and in the collection book. True the
// first time this tier is stopped (it pays a one-time bonus).
export const addBreak = (trainId) => {
  state.breaks += 1
  const first = !!trainId && !state.trainsStopped[trainId]
  if (trainId) state.trainsStopped[trainId] = (state.trainsStopped[trainId] ?? 0) + 1
  save()
  emit()
  return first
}

// Seconds of play still needed for the chest. The server counts them (net.js sets chestPlay from its
// `chest` messages); the client only keeps the clock running between those, and alone when offline.
export const chestLeft = () => Math.max(0, FREE_COINS.playSeconds - state.chestPlay)
export const setChestPlay = (s) => {
  state.chestPlay = Math.min(FREE_COINS.playSeconds, Math.max(0, s))
}
export const tickChestPlay = (dt) => setChestPlay(state.chestPlay + dt)
// A verified rewarded ad fills the chest at once.
export function refillChest() {
  state.chestPlay = FREE_COINS.playSeconds
}
// Pays the chest. Online the server has already approved it (net.js claimChestOnServer) and `force` is set.
export function claimChest(force = false) {
  if (!force && chestLeft() > 0) return 0
  state.coins += FREE_COINS.value
  state.chestPlay = 0
  save()
  emit()
  return FREE_COINS.value
}

export function spendCoins(n) {
  if (state.coins < n) return false
  state.coins -= n
  save()
  emit()
  return true
}

export const markSeeded = () => {
  state.seeded = true
  save()
}

const upgrade = (id) => UPGRADES.find((e) => e.id === id)
export const upgradeLevel = (id) => state.levels[id] ?? upgrade(id).start
export const upgradeValue = (id) => {
  const u = upgrade(id)
  return u.v0 + u.step * upgradeLevel(id)
}
export const upgradeCost = (id) => {
  const u = upgrade(id)
  return Math.round(u.cost * u.grow ** (upgradeLevel(id) - u.start))
}

export function buyUpgrade(id) {
  const u = upgrade(id)
  const level = upgradeLevel(id)
  const cost = upgradeCost(id)
  if (level >= u.max || state.coins < cost) return false
  state.coins -= cost
  state.levels[id] = level + 1
  save()
  emit()
  return true
}

// Store buys: one-time, paid in coins, saved as levels[id] = 1 (ids: power2, admin).
export const owns = (id) => (state.levels[id] ?? 0) > 0
export const shopPrice = (id) => (id === 'admin' ? GYM.benches.find((b) => b.id === 'admin').coins : SHOP[id].coins)
export const powerBoost = () => (owns('power2') ? SHOP.power2.mult : 1)
export function buyShop(id) {
  const price = shopPrice(id)
  if (owns(id) || state.coins < price) return false
  state.coins -= price
  state.levels[id] = 1
  save()
  emit()
  return true
}

export const rebirthCost = () => Math.round(REBIRTH.base * REBIRTH.grow ** (state.rebirths - PROGRESS.start.rebirths))
export function rebirth() {
  if (state.power < rebirthCost()) return false
  state.strength = Math.max(state.strength, state.power)
  state.power = REBIRTH.startPower
  state.rebirths += 1
  state.multiplier += 1
  state.luck += REBIRTH.luck
  save()
  emit()
  return true
}

// A rebirth that keeps the Strength: it still needs the full Strength and costs REBIRTH.skipCoins.
export function skipRebirth() {
  if (state.power < rebirthCost() || state.coins < REBIRTH.skipCoins) return false
  state.coins -= REBIRTH.skipCoins
  state.rebirths += 1
  state.multiplier += 1
  state.luck += REBIRTH.luck
  save()
  emit()
  return true
}

export const dailyLeft = () => Math.max(0, state.dailyAt + PROGRESS.dailyCooldown - now())
// Opens the next day's gift; returns it, or null while the timer runs.
export function claimDaily() {
  if (dailyLeft() > 0) return null
  const day = state.dailyDay % DAILY.length
  const g = DAILY[day]
  if (g.kind === 'coins') state.coins += g.n
  else if (g.kind === 'power') state.power += g.n
  else if (g.kind === 'luck') state.luck += g.n
  else if (g.kind === 'carry') state.levels.carry = upgradeLevel('carry') + g.n
  else if (g.kind === 'rebirth') {
    state.rebirths += g.n
    state.multiplier += g.n
  } else if (g.kind === 'powerMult') state.powerMult = Math.max(state.powerMult, g.n)
  state.dailyDay = day + 1
  state.dailyAt = now()
  save()
  emit()
  return g
}


// 1920 -> 1.92K, 57000000 -> 57M
export function compact(n) {
  const a = Math.abs(n)
  const f = (v) => {
    const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s
  }
  if (a >= 1e12) return `${f(n / 1e12)}T`
  if (a >= 1e9) return `${f(n / 1e9)}B`
  if (a >= 1e6) return `${f(n / 1e6)}M`
  if (a >= 1e3) return `${f(n / 1e3)}K`
  return `${Math.floor(n)}`
}
