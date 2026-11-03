import { Vector3 } from 'three'
import { ADS, COINS, FAIR, ROUND, SET, TRAINS, UPGRADES, VARIANTS, VEHICLE_NAMES, YARD } from './config.js'
import { addBreak, addCoins, compact, rebirthCost, state as progress, upgradeCost, upgradeLevel } from './progress.js'
import { bestHp, parkHp, sizeTrain, spreadK, streakK } from './fair.js'
import { player } from './player.js'
import * as bloxity from './bloxity.js'
import { addShake } from './camera.js'

// The round loop: a countdown, a train, its wreck, the next train. A train that gets
// through drops part of its hit coins and a new train is sent; a train brought to 0 HP
// derails and pays out, the coins of every hit of that pass included.
// Fair trains (fair.js): every train is sized to the player's power, a ladder makes the next one harder
// after a win and easier after a loss, wins in a row pay a streak bonus and losses in a row bring a
// x2 COMEBACK train. Online the server (shared.js) runs all of it for the room and this only shows it.
const pos = new Vector3()

// A results-screen ad slot while the wreck smoulders, hidden again before the next train. Rate limited.
let adHide = null
let adAt = 0
function showResultsAd() {
  if (!bloxity.adsAvailable() || Date.now() - adAt < ADS.minGap * 1000) return
  adAt = Date.now()
  adHide?.()
  adHide = bloxity.showAdScreen('results')
  setTimeout(() => adHide?.(), 8000)
}

// After a lost train: the closest next step toward stopping bigger ones.
function nextStep() {
  if (progress.power >= rebirthCost()) return `YOU CAN REBIRTH! → x${progress.multiplier + 1} MULTIPLIER`
  const carry = UPGRADES.find((u) => u.id === 'carry')
  const lvl = upgradeLevel('carry')
  if (lvl < carry.max && progress.coins >= upgradeCost('carry')) return `BUY CARRY LV.${lvl + 1} → CARRY ${lvl + 1} VEHICLES AT ONCE`
  // The cheapest bay that beats the best vehicle this player can already lift.
  const best = bestHp(progress.power)
  const hpOf = (b) => b.req * VARIANTS[b.variant ?? 'normal'].mult
  const bay = YARD.rows
    .flatMap((r) => r.bays)
    .filter((b) => b.req > progress.power && hpOf(b) > best)
    .sort((a, b) => a.req - b.req)[0]
  if (bay) return `TRAIN ${compact(bay.req - progress.power)} MORE STRENGTH → LIFT THE ${VEHICLE_NAMES[bay.type].toUpperCase()} (${compact(hpOf(bay))} HP)`
  return 'PARK MORE VEHICLES BEFORE THE TRAIN COMES!'
}

export function createGame({ fx, sound, hud, lobby, rail, trains, coins, goals }) {
  const g = {
    phase: 'countdown',
    left: ROUND.firstCountdown,
    spec: TRAINS[0],
    hp: 0,
    maxHp: 0, // this train's HP, sized to the room
    reward: 0, // coins for stopping it, before X2 and the streak
    back: false, // this train got through last time
    doubled: true, // this train pays X2 COINS
    step: 0, // the ladder (FAIR.ladder)
    streak: 0, // trains stopped in a row
    losses: 0, // trains lost in a row
    comeback: false, // the x2 COMEBACK train
    underdogMe: false, // online: this player is the room's weakest (+50% coins)
    spread: 1,
    timeScale: 1,
    slow: 0,
    lastSecond: 0,
    humCd: 0,
    shared: false, // the server runs the round (shared.js): one rail and one train for the whole room
  }

  // Offline: the train sized to this player alone.
  function sizeLocal() {
    const t = sizeTrain(parkHp(progress.power, upgradeLevel('carry')), g.step, g.spread)
    g.spec = TRAINS[t.idx]
    g.hp = g.maxHp = t.hp
    g.reward = t.reward
    lobby.setRarity(g.spec)
  }
  sizeLocal()
  const total = () => Math.round(g.reward * (g.doubled ? 2 : 1) * streakK(g.streak))

  // Offset the shake by how far the listener is from the blast.
  const shakeFrom = (x, z, k) => {
    const d = Math.hypot(player.position.x - x, player.position.z - z)
    addShake(k / (1 + (d / 50) ** 2))
  }

  // The coins of this pass's hits: they burst out of the wrecks if the train derails, and a
  // ROUND.throughShare of them does if it gets through. Merged down to what the coin pool can
  // show at once. Returns the coins dropped.
  const owed = []
  let overkill = false // offline: one of this pass's vehicles was far bigger than the train
  const payOwed = (share = 1) => {
    const room = Math.floor(COINS.max / COINS.perCluster)
    const piles = owed.splice(0)
    piles.slice(room).forEach((o, i) => (piles[i % room].value += o.value))
    let paid = 0
    for (const o of piles.slice(0, room)) {
      const value = Math.ceil(o.value * share)
      coins.spawn(o.x, o.z, value)
      paid += value
    }
    return paid
  }

  const hooks = {
    shared: () => g.shared,
    nextVehicle: (front) => rail.nextAt(front),
    // `mine`: the coins of a hit go to the player whose vehicle it was (everyone in local play).
    onHit(v, damage, t, speed, mine = true) {
      const p = v.vehicle.root.position
      pos.set(p.x, p.y + 2.2, p.z)
      hud.floater(pos, damage > 0 ? `-${compact(damage)} HP` : 'MAXED OUT! TEAM UP!', damage > 0 ? undefined : '#ffb0b0')
      rail.smash(v, speed)
      hud.setTrainHp(t.hp, t.maxHp)
      g.hp = t.hp
      shakeFrom(p.x, p.z, 0.3)
      if (!mine) return
      if (v.hp > FAIR.overkill.ratio * t.maxHp) overkill = true
      const value = Math.ceil(damage * COINS.valueShare * progress.multiplier * (g.underdogMe ? 1 + FAIR.underdog : 1))
      const lucky = Math.random() < progress.luck / 100
      if (value > 0) owed.push({ x: p.x, z: p.z, value: lucky ? value * 2 : value })
    },
    // Offline `info` is undefined: the player did it all. Online (shared.js) it is the server's word:
    // { rewarded, pay, streak, milestone }.
    onDerail(t, info) {
      g.slow = ROUND.slowMo.seconds
      g.hp = 0
      hud.setTrainHp(0, t.maxHp)
      hud.flash(0.7)
      addShake(1)
      let rewarded = true
      let pay = 0
      if (info) {
        rewarded = info.rewarded
        pay = info.pay
        g.streak = info.streak
      } else {
        pay = Math.round(total() * (overkill ? FAIR.overkill.cut : 1))
        g.streak += 1
        g.losses = 0
        g.step = Math.min(FAIR.ladder.max, g.step + FAIR.ladder.win)
      }
      if (rewarded) {
        addCoins(pay)
        payOwed()
        const first = addBreak(t.spec.id)
        goals?.add('stop')
        hud.showBanner(g.streak >= 2 ? `TRAIN STOPPED! STREAK x${g.streak}` : 'TRAIN STOPPED!', `+${compact(pay)} COINS${g.underdogMe ? ' · UNDERDOG BONUS!' : ''}`, 4200)
        hud.coinBurst(26)
        if (first) {
          addCoins(pay)
          setTimeout(() => hud.toast(`NEW IN YOUR TRAIN BOOK: ${t.spec.name}! +${compact(pay)} BONUS COINS`), 1800)
        }
      } else hud.showBanner('TRAIN STOPPED!', 'THE TEAM DID IT! PARK A VEHICLE NEXT TIME TO SHARE THE REWARD', 4200)
      if (info?.milestone) {
        const m = info.milestone
        addCoins(m.coins)
        setTimeout(() => {
          hud.toast(`ROOM MILESTONE: ${m.n} TRAINS STOPPED! +${compact(m.coins)} COINS FOR EVERYONE`)
          hud.coinBurst(12)
        }, 4400)
      }
      sound.victory()
      showResultsAd()
    },
    onBlast(x, _y, z, big) {
      shakeFrom(x, z, 0.6 * big)
      hud.flash(0.28 * big)
    },
    // `done`: the train that just finished (its HP left says how close it was).
    onGone(result, done) {
      const involved = owed.length > 0
      const hpLeft = done?.maxHp ? Math.max(0, done.hp) / done.maxHp : 0
      const paid = result === 'through' ? payOwed(ROUND.throughShare) : 0
      owed.length = 0
      overkill = false
      rail.sweep()
      if (result === 'stopped') rail.clearAll() // a crashed train leaves a clean railway
      if (result === 'through') {
        const grab = paid ? ` · GRAB YOUR ${compact(paid)} COINS!` : ''
        if (!involved) hud.showBanner('THE TRAIN GOT THROUGH!', 'PARK MORE VEHICLES!', 4200)
        else if (hpLeft <= FAIR.nearMiss) hud.showBanner('SO CLOSE!', `THE TRAIN HAD ONLY ${Math.max(1, Math.round(hpLeft * 100))}% HP LEFT${grab}`, 4200)
        else hud.showBanner('THE TRAIN GOT THROUGH!', `IT WAS TOO STRONG. TRY AGAIN!${grab}`, 4200)
        if (involved) setTimeout(() => hud.hint(nextStep()), 4400)
        sound.trainLost()
      }
      if (result === 'stopped') fx.fadeDecals()
      g.phase = 'countdown'
      // Online the server decides what comes next (shared.js `gone`); this was only the clean-up.
      if (g.shared) return
      if (result === 'through') {
        g.step = Math.max(FAIR.ladder.min, g.step - FAIR.ladder.loss)
        g.streak = 0
        g.losses += 1
      }
      g.comeback = g.losses >= FAIR.comebackAfter
      g.spread = spreadK(Math.random())
      sizeLocal()
      g.back = false
      g.doubled = Math.random() < ROUND.doubleChance || g.comeback
      g.left = ROUND.countdown
    },
  }

  function startTrain(head) {
    if (!g.shared) sizeLocal() // the train leaves sized to the player as they are now
    g.phase = 'train'
    hud.showTrain(g.spec, g.hp, total(), g.maxHp)
    trains.spawn(g.spec, g.hp, head, g.maxHp)
  }

  function update(dt) {
    // Slow motion the moment a train goes over; real seconds drive it.
    if (g.slow > 0) {
      g.slow -= dt
      const { scale, ease, seconds } = ROUND.slowMo
      const t = 1 - Math.max(0, g.slow) / seconds
      g.timeScale = t < 1 - ease ? scale : scale + (1 - scale) * ((t - (1 - ease)) / ease) ** 2
      if (g.slow <= 0) g.timeScale = 1
    }
    hud.setRoundInfo(g)
    if (g.phase === 'countdown') {
      g.left -= dt
      const s = Math.ceil(g.left)
      hud.setCountdown(g.comeback ? 'COMEBACK TRAIN IN:' : g.back ? 'TRAIN COMING BACK IN:' : 'TRAIN COMING IN:', Math.max(0, g.left), g.spec)
      if (s !== g.lastSecond) {
        g.lastSecond = s
        if (s <= ROUND.warnSeconds && s > 0) {
          sound.tick(s)
          sound.bell()
          setTimeout(sound.bell, 480)
        }
      }
      if (s <= ROUND.warnSeconds) {
        g.humCd -= dt
        if (g.humCd <= 0) {
          g.humCd = 0.45
          sound.railHum((ROUND.warnSeconds - s + 1) / ROUND.warnSeconds)
        }
        rail.rumble((ROUND.warnSeconds - s + 1) / ROUND.warnSeconds)
      }
      if (g.left <= 0 && !g.shared) startTrain()
    }
  }

  // The lobby's first vehicles, so the first train has something to hit.
  function seed() {
    const row = YARD.rows[0].bays
    const pick = [4, 3, 2, 4, 1, 3, 0, 2]
    pick.slice(0, ROUND.seedVehicles).forEach((b, i) => {
      const cfg = row[b]
      const hp = cfg.req * VARIANTS[cfg.variant ?? 'normal'].mult
      rail.seed({ type: cfg.type, paint: cfg.paint, variant: cfg.variant ?? 'normal', hp }, SET.hpSign.x + 22 - i * 7.4)
    })
  }

  // A new world: a brand-new lobby's round, until the server sends that world's (shared.js).
  function restart() {
    owed.length = 0
    overkill = false
    Object.assign(g, { phase: 'countdown', left: ROUND.firstCountdown, back: false, doubled: true, step: 0, streak: 0, losses: 0, comeback: false, underdogMe: false, spread: 1, timeScale: 1, slow: 0, shared: false })
    sizeLocal()
    seed()
  }

  // The server's state of the round (shared.js), applied when a train is picked or has gone.
  function apply(snap, spec, underdogMe) {
    g.spec = spec
    g.hp = snap.hp
    g.maxHp = snap.maxHp ?? spec.hp
    g.reward = snap.reward ?? spec.reward
    g.back = snap.back
    g.doubled = snap.doubled
    g.left = snap.left
    g.step = snap.step ?? 0
    g.streak = snap.streak ?? 0
    g.losses = snap.losses ?? 0
    g.comeback = !!snap.comeback
    g.underdogMe = underdogMe
    lobby.setRarity(spec)
  }

  return { g, hooks, update, seed, restart, startTrain, apply }
}
