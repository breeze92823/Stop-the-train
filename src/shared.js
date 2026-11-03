import { TRAINS } from './config.js'
import { net, onNetMessage, sendNet } from './net.js'

// The shared round: the server (backend round.ts) holds ONE rail and ONE train per world, so every
// player's vehicles stack up against the same train and the HP they add up is what it must beat.
// This only mirrors that state: the throw, the train's position and every hit arrive as messages
// and are drawn here; the piles and the wreck stay local rigid bodies. With no server the local
// round in game.js keeps running unchanged. Travelling drops g.shared until the new world's `round`
// arrives, so what is still on its way from the old world finds nothing to act on.
export function createShared({ game, rail, trains, hud }) {
  const { g } = game
  const mine = (by) => !!by && by === net.sessionId
  // Another player's vehicle (the seeded ones have no owner): the local player cannot push it.
  const theirs = (by) => !!by && by !== net.sessionId
  const specOf = (idx) => TRAINS[Math.min(idx, TRAINS.length - 1)]
  const elsewhere = (snap) => !!snap.world && snap.world !== net.world
  const apply = (snap) => game.apply(snap, specOf(snap.idx), mine(snap.underdog))

  // Parking: tell the server; the throw already happened here, the echo is ignored (same id).
  rail.setOnPark((item, spec, from, x) => {
    if (!g.shared || !net.connected) return
    sendNet('park', { id: item.id, spec, x, halfLen: item.halfLen, from: from && { x: from.x, y: from.y, z: from.z } })
  })

  // First sight of the room (and every train start): replace the rail and the round with the server's.
  onNetMessage('round', (snap) => {
    if (elsewhere(snap)) return
    const first = !g.shared
    g.shared = true
    if (first && !snap.seeded) sendNet('seedRail', rail.list())
    if (first) {
      rail.reset()
      for (const v of snap.rail) rail.seed(v.spec, v.x, 0, v.id, true, theirs(v.by))
    }
    apply(snap)
    if (snap.phase === 'run') {
      if (!trains.active) game.startTrain(snap.head)
    } else {
      g.phase = 'countdown'
    }
  })

  onNetMessage('railAdd', (m) => {
    if (!g.shared || rail.byId(m.id)) return
    // Another player's throw starts from where they stood; the fuse machine's drops from above.
    if (m.from) rail.park(m.spec, m.from, m.x, m.id, true, theirs(m.by))
    else rail.seed(m.spec, m.x, m.by ? 8 : 0, m.id, true, theirs(m.by))
  })

  onNetMessage('railRefuse', (m) => {
    rail.discard(m.id)
    hud.toast('The rail is full')
  })

  onNetMessage('trainTick', (m) => trains.netSync(m.head, m.speed))

  onNetMessage('hit', (m) => {
    const t = trains.netHit(m.hp, m.speed)
    if (!t) return
    const v = rail.byId(m.id)
    if (v) game.hooks.onHit(v, m.damage, t, m.speed, mine(m.by))
    else hud.setTrainHp(m.hp, t.maxHp)
    g.hp = m.hp
  })

  onNetMessage('derail', (m) => {
    const t = trains.active
    if (!t) return
    trains.netDerail()
    // The server splits the reward by damage (fair.ts): `pay` is per sessionId.
    const pay = m.pay?.[net.sessionId] ?? 0
    game.hooks.onDerail(t, { rewarded: m.contributors.some(mine), pay, streak: m.streak ?? 0, milestone: m.milestone ?? null })
  })

  onNetMessage('gone', (m) => {
    if (elsewhere(m)) return
    trains.netFinish(m.result)
    apply(m)
    g.phase = 'countdown'
  })

  // The link dropped: the local round takes over until the server's next `round` message.
  return {
    update() {
      if (g.shared && !net.connected) g.shared = false
    },
  }
}
