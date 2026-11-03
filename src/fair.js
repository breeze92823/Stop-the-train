import { FAIR, TRAINS, VARIANTS, YARD } from './config.js'

// Fair trains: how a train is sized and paid. Mirrors the backend fair.ts, which runs the shared round;
// game.js uses this for the offline round, net.js and the HUD for the player's own numbers.

// The yard's bays as [Strength needed, HP]: a bay's vehicle has req x its variant's multiplier.
const BAYS = YARD.rows.flatMap((r) => r.bays.map((b) => [b.req, b.req * VARIANTS[b.variant ?? 'normal'].mult]))

// HP of the best vehicle `power` Strength lifts (0 below the first bay).
export function bestHp(power) {
  let best = 0
  for (const [req, hp] of BAYS) if (power >= req) best = Math.max(best, hp)
  return best
}

// One load: the best vehicle x the Carry level. A room's power is the sum of its players' loads.
export const parkHp = (power, carry) => bestHp(power) * Math.min(FAIR.carryMax, Math.max(1, Math.floor(carry)))

// HP x this for a ladder step.
export function ladderK(step) {
  const { up, down, floor } = FAIR.ladder
  return step >= 0 ? 1 + up * step : Math.max(floor, 1 + down * step)
}

// A new train's spread: a harder challenge, an easier one or a plain one.
export function spreadK(r) {
  const s = FAIR.spread
  if (r < s.up) return s.upK
  if (r > 1 - s.down) return s.downK
  return 1
}

// The tier whose HP is nearest on a log scale.
export function tierFor(hp) {
  let best = 0
  for (let i = 1; i < TRAINS.length; i++) if (Math.abs(Math.log(hp / TRAINS[i].hp)) < Math.abs(Math.log(hp / TRAINS[best].hp))) best = i
  return best
}

// Coins for stopping a train of `hp`: the tiers' rewards joined on a log-log line.
export function rewardFor(hp) {
  const first = TRAINS[0]
  const last = TRAINS[TRAINS.length - 1]
  if (hp <= first.hp) return Math.round((first.reward / first.hp) * hp)
  if (hp >= last.hp) return Math.round((last.reward / last.hp) * hp)
  let i = 0
  while (TRAINS[i + 1].hp < hp) i++
  const a = TRAINS[i]
  const b = TRAINS[i + 1]
  const k = Math.log(hp / a.hp) / Math.log(b.hp / a.hp)
  return Math.round(Math.exp(Math.log(a.reward) + k * Math.log(b.reward / a.reward)))
}

// The train for a room of `roomPower` at ladder `step` with `spread`: { idx, hp, reward }.
export function sizeTrain(roomPower, step, spread) {
  const hp = Math.max(1, Math.round(Math.max(FAIR.minHp, roomPower * FAIR.targetRatio) * ladderK(step) * spread))
  return { idx: tierFor(hp), hp, reward: rewardFor(hp) }
}

export const streakK = (streak) => 1 + Math.min(FAIR.streak.max, FAIR.streak.per * Math.max(0, streak))
