import { DEFAULT_WORLD, WORLD_TRAVEL, WORLDS } from './config.js'
import { net, onNetMessage, sendWorld } from './net.js'
import { player, respawn } from './player.js'
import { state as progress } from './progress.js'
import { applyTheme, currentWorld, onTheme } from './theme.js'

// Travel between worlds: the portal's gate, the warp, and everything that belongs to the world being
// left (its train, its rail, its round). The player arrives on the plaza with what they carry. The
// server answers with the new world's `round` (shared.js), or `worldRefused`: it has the last word on
// the rebirths, which also covers a sign-in to an account without them while in the Galaxy.
export function createWorlds({ game, rail, trains, fx, gym, hud, sound, lighting }) {
  let warping = false

  onTheme((world) => {
    lighting.setMoods(world.sky)
    sound.setAmbience(world.ambience)
  })

  function arrive(id) {
    const world = WORLDS[id]
    trains.abort()
    rail.reset()
    fx.fadeDecals()
    game.restart()
    applyTheme(id)
    sendWorld(id)
    if (!player.dead) {
      gym.stop(true)
      respawn()
    }
    hud.showBanner(world.title, world.subtitle, 3600)
  }

  function go(id) {
    if (warping || id === currentWorld().id) return
    warping = true
    sound.warp()
    hud.warp(WORLD_TRAVEL, () => arrive(id), () => (warping = false))
  }

  onNetMessage('worldRefused', ({ world }) => {
    if (world !== net.world) return
    hud.toast(`${WORLDS[world].name} needs ${WORLDS[world].rebirths} rebirths`)
    go(DEFAULT_WORLD)
  })

  return {
    go,
    // Walking into the portal: on to the world it leads to, or why not.
    usePortal() {
      const to = WORLDS[currentWorld().portal.to]
      if (progress.rebirths >= to.rebirths) return go(to.id)
      sound.deny()
      hud.toast(`${to.name} needs ${to.rebirths} rebirths. You have ${progress.rebirths}.`)
    },
  }
}
