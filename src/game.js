import { Vector3 } from 'three'
import { ADS, COINS, ROUND, SET, TRAINS, VARIANTS, YARD } from './config.js'
import { addBreak, addCoins, compact, state as progress, updateLeft } from './progress.js'
import { player } from './player.js'
import * as bloxity from './bloxity.js'
import { addShake } from './camera.js'

// The round loop: a countdown, a train, its wreck, the next train. A train that gets
// through keeps its damage and comes back; a train brought to 0 HP derails and pays out.
const pos = new Vector3()

function clockFull(s) {
  const t = Math.max(0, Math.floor(s))
  const p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(t / 86400))}:${p(Math.floor(t / 3600) % 24)}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)}`
}

function weightedTrain() {
  const luck = 1 + progress.luck / 100
  const weights = TRAINS.map((t, i) => t.weight * luck ** i)
  let r = Math.random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < TRAINS.length; i++) {
    r -= weights[i]
    if (r <= 0) return TRAINS[i]
  }
  return TRAINS[0]
}

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

export function createGame({ fx, sound, hud, lobby, rail, trains, coins }) {
  const g = {
    phase: 'countdown',
    left: ROUND.firstCountdown,
    spec: TRAINS[0], // the first train is always beatable
    hp: TRAINS[0].hp,
    back: false, // this train got through last time
    doubled: true, // this train pays X2 COINS
    timeScale: 1,
    slow: 0,
    lastSecond: 0,
    humCd: 0,
  }
  lobby.setRarity(g.spec)

  // Offset the shake by how far the listener is from the blast.
  const shakeFrom = (x, z, k) => {
    const d = Math.hypot(player.position.x - x, player.position.z - z)
    addShake(k / (1 + (d / 50) ** 2))
  }

  const hooks = {
    nextVehicle: (front) => rail.nextAt(front),
    onHit(v, damage, t, speed) {
      const p = v.vehicle.root.position
      pos.set(p.x, p.y + 2.2, p.z)
      hud.floater(pos, `-${compact(damage)} HP`)
      rail.smash(v, speed)
      hud.setTrainHp(t.hp, t.maxHp)
      g.hp = t.hp
      shakeFrom(p.x, p.z, 0.3)
      const value = Math.ceil(damage * COINS.valueShare * progress.multiplier)
      const lucky = Math.random() < progress.luck / 100
      coins.spawn(p.x, p.z, lucky ? value * 2 : value)
    },
    onDerail(t) {
      g.slow = ROUND.slowMo.seconds
      g.hp = 0
      hud.setTrainHp(0, t.maxHp)
      hud.flash(0.7)
      addShake(1)
      const reward = t.spec.reward * (g.doubled ? 2 : 1)
      addCoins(reward)
      addBreak()
      hud.showBanner('TRAIN STOPPED!', `+${compact(reward)} COINS`, 4200)
      hud.coinBurst(26)
      sound.victory()
      showResultsAd()
    },
    onBlast(x, _y, z, big) {
      shakeFrom(x, z, 0.6 * big)
      hud.flash(0.28 * big)
    },
    onGone(result) {
      rail.sweep()
      if (result === 'stopped') {
        g.spec = weightedTrain()
        g.hp = g.spec.hp
        g.back = false
        g.doubled = Math.random() < ROUND.doubleChance
        fx.fadeDecals()
      } else {
        g.back = true
        hud.showBanner('THE TRAIN GOT THROUGH!', `${compact(g.hp)} HP LEFT. PARK MORE VEHICLES!`, 3400)
        sound.failed()
      }
      lobby.setRarity(g.spec)
      g.phase = 'countdown'
      g.left = ROUND.countdown
    },
  }

  function startTrain() {
    g.phase = 'train'
    hud.showTrain(g.spec, g.hp, g.spec.reward * (g.doubled ? 2 : 1))
    trains.spawn(g.spec, g.hp)
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
    if (g.phase === 'countdown') {
      g.left -= dt
      const s = Math.ceil(g.left)
      const [from, to] = ROUND.nextShownAt
      if (!g.back && g.left <= from && g.left > to) hud.setNext(g.spec, g.doubled)
      else hud.setCountdown(g.back ? 'TRAIN COMING BACK IN:' : 'TRAIN COMING IN:', Math.max(0, g.left), g.spec.text)
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
      if (g.left <= 0) startTrain()
    }
    lobby.setUpdateTimer(clockFull(updateLeft()))
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

  return { g, hooks, update, seed, startTrain }
}
