import { FUSE, SET, TRACK, VEHICLE_NAMES } from './config.js'
import { player } from './player.js'
import { spendCoins, state as progress } from './progress.js'

// The Fuse Machine's rules: carry a vehicle to its pad and press E to push it in; with every
// slot filled E opens the confirmation. Paying fuses them: Luck % decides if one vehicle comes
// out (with all their HP added up) or the machine keeps them.
export function createFuse({ rail, yard, hud, lobby, fx, sound }) {
  const slots = []
  const ring = SET.fuse.ring
  const near = () => Math.hypot(player.position.x - ring.x, player.position.z - ring.z) < ring.r + FUSE.reach
  const at = { x: ring.x, y: 3.6, z: ring.z }

  const nameOf = (spec) => VEHICLE_NAMES[spec.type] ?? spec.type
  const names = () => {
    const n = slots.map(nameOf)
    return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : (n[0] ?? '')
  }
  const sync = () => lobby.setFuseCount(slots.length)
  const open = () => hud.openFuse({ names: names(), chance: Math.min(100, progress.luck), cost: FUSE.cost })

  function insert() {
    const spec = yard.takeHeld()
    if (!spec) return
    slots.push(spec)
    lobby.fuseShow(slots.length - 1, spec)
    sync()
    sound.buy()
    for (let i = 0; i < 16; i++) fx.sparkle({ x: at.x, y: 2 + Math.random() * 2, z: at.z }, 'cyan', 2)
    if (slots.length >= FUSE.slots) open()
    else hud.toast(`Inserted ${nameOf(spec)} (${slots.length}/${FUSE.slots})`)
  }

  return {
    // Carrying a vehicle: E pushes it into the machine.
    wantInsert() {
      if (!near()) return null
      if (slots.length >= FUSE.slots) return { ...at, kind: 'fuse-full', text: 'Full', instant: true, act: open }
      return { ...at, kind: 'fuse-in', text: 'Insert', act: insert }
    },
    // Hands free and the machine loaded: E reopens the confirmation.
    want() {
      if (slots.length < FUSE.slots || !near()) return null
      return { ...at, kind: 'fuse-open', text: 'Fuse', instant: true, act: open }
    },
    hint() {
      hud.toast(`Bring ${FUSE.slots} vehicles here and press E to insert them (${slots.length}/${FUSE.slots})`)
    },
    // The confirm button.
    run() {
      if (slots.length < FUSE.slots) return
      if (!spendCoins(FUSE.cost)) {
        sound.deny()
        return
      }
      const chance = Math.min(100, progress.luck)
      const best = slots.reduce((a, b) => (b.hp > a.hp ? b : a))
      const hp = slots.reduce((sum, s) => sum + s.hp, 0)
      const won = Math.random() * 100 < chance
      slots.length = 0
      lobby.fuseClear()
      sync()
      hud.closeWindow()
      if (won) {
        const variant = best.variant === 'normal' ? 'golden' : 'emerald'
        const x = (Math.random() * 2 - 1) * TRACK.placeHalf * 0.6
        rail.seed({ type: best.type, paint: best.paint, variant, hp }, x, 8)
        sound.victory()
        hud.flash(0.5)
        hud.showBanner('FUSE SUCCESS!', `${nameOf(best)} with ${hp.toLocaleString('en-US')} HP is on the rail`)
      } else {
        sound.failed()
        hud.toast('Fuse failed: the machine kept your vehicles')
      }
    },
  }
}
