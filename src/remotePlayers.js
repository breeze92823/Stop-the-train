// The other players in the room, drawn in the world: their Bloxity look (skin, accessories, proportions),
// the same locomotion / carry / bench animations as the local avatar, the vehicle held overhead, the
// press on the gym bench, platform emotes and chat bubbles. Poses come from the synced roster
// (net.js, backend PlayerState), eased toward the last pose plus speed x heading for the time since
// (dead reckoning), so others glide instead of stepping. Diffed against the roster every frame, so
// joins, leaves and changes need no events. Nearest first and capped (fewer on touch); name tags only up close.
import * as THREE from 'three'
import { Group } from 'three'
import { COARSE_POINTER, GYM, NET, PLAYER_DIMS, YARD } from './config.js'
import { roster, net } from './net.js'
import * as bloxity from './bloxity.js'
import { makeVehicle, sharedMaterial, variantMaterial, vehicleModel } from './vehicles.js'
import { label } from './propkit.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'

const MAX = COARSE_POINTER ? NET.maxRemotesTouch : NET.maxRemotes
const ease = (t) => t * t * (3 - 2 * t)
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from))

function parseCarry(json) {
  if (!json) return null
  try {
    const c = JSON.parse(json)
    return c && c.type ? c : null
  } catch {
    return null
  }
}

class Remote {
  constructor(scene) {
    this.scene = scene
    this.group = new Group()
    this.group.rotation.order = 'YXZ'
    this.group.visible = false
    scene.add(this.group)
    this.avatar = null
    this.animator = null
    this.avatarJson = null // what the current rig was built from
    this.generation = 0
    this.label = null
    this.name = ''
    this.placed = false
    this.base = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, at: 0, key: '' }
    this.facing = 0
    this.speed = 0
    this.carryKey = ''
    this.vehicle = null
    this.carryW = 0
    this.benchW = 0
    this.emoteSeq = 0
    this.setAvatar(buildDefaultCharacter())
  }

  setAvatar(next) {
    if (this.avatar) this.group.remove(this.avatar)
    disposeAnimator(this.animator)
    this.avatar = next
    next.traverse((o) => o.isMesh && (o.castShadow = false)) // shadow passes add up in a full room
    this.group.add(next)
    this.animator = makeAnimator(next)
  }

  // A signed-in player's look arrives as JSON { equipped, proportions, skin }; "" = default.
  async syncAvatar(json) {
    if (json === this.avatarJson) return
    this.avatarJson = json
    const mine = ++this.generation
    if (!json) return this.setAvatar(buildDefaultCharacter())
    let look = null
    try {
      look = JSON.parse(json)
    } catch {
      return
    }
    try {
      const group = await loadBaseCharacter()
      if (mine !== this.generation) return
      await attachEquippedAccessories(group, look?.equipped, { skinTextureUrl: look?.skin || undefined })
      if (mine !== this.generation) return
      applyProportions(group, look?.proportions)
      this.setAvatar(group)
    } catch (err) {
      console.warn('[remote] avatar failed to load', err)
    }
  }

  syncName(name) {
    name = name || 'Player'
    if (name === this.name) return
    this.name = name
    if (this.label) {
      this.group.remove(this.label)
      this.label.material.map?.dispose()
      this.label.material.dispose()
    }
    this.label = label(name, 0.5, { color: '#ffffff', outline: '#1a0a14', font: '700 64px Fredoka, sans-serif', outlineWidth: 10 })
    this.label.position.y = PLAYER_DIMS.height + 1.6
    this.group.add(this.label)
  }

  // The vehicle held overhead, rebuilt only when it changes.
  syncCarry(json) {
    if (json === this.carryKey) return
    this.carryKey = json
    if (this.vehicle) {
      this.scene.remove(this.vehicle.root)
      this.vehicle = null
    }
    const spec = parseCarry(json)
    if (!spec) return
    try {
      const model = vehicleModel(spec.type, spec.paint)
      const material = spec.variant && spec.variant !== 'normal' ? variantMaterial(spec.variant) : sharedMaterial()
      this.vehicle = makeVehicle(model, material)
      this.vehicle.root.scale.setScalar(YARD.carryScale)
      this.vehicle.mesh.castShadow = false
      this.scene.add(this.vehicle.root)
    } catch (err) {
      console.warn('[remote] unknown vehicle', spec, err)
    }
  }

  async playEmote(id) {
    if (!id) return this.animator?.stopEmote()
    const clip = (await bloxity.loadEmotes()).get(id)?.clip
    if (clip) this.animator?.playEmote(clip)
  }

  setVisible(on) {
    this.group.visible = on
    if (this.vehicle) this.vehicle.root.visible = on
  }

  update(dt, p, gym) {
    const b = this.base
    const now = performance.now()
    const key = `${p.x}|${p.y}|${p.z}|${p.yaw}|${p.speed}`
    if (key !== b.key) {
      Object.assign(b, { x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: p.speed, at: now, key })
    }
    // Dead reckoning along the heading, for a moment only.
    const age = Math.min(0.25, (now - b.at) / 1000)
    const tx = b.x + Math.sin(b.yaw) * b.speed * age
    const tz = b.z + Math.cos(b.yaw) * b.speed * age
    const k = this.placed ? 1 - Math.exp(-NET.remoteLerp * dt) : 1
    const g = this.group
    const px = g.position.x
    const py = g.position.y
    const pz = g.position.z

    // On a bench the avatar lies on it (placeAvatar's pose); otherwise on its feet.
    const bench = p.bench >= 0 ? gym?.benches?.[p.bench] : null
    this.benchW += ((bench ? 1 : 0) - this.benchW) * (1 - Math.exp(-6 * dt))
    const w = ease(Math.min(1, this.benchW))
    let x = tx
    let y = b.y
    let z = tz
    let yaw = b.yaw
    if (bench && w > 0.001) {
      x += (bench.x - x) * w
      y += (GYM.feetY - y) * w
      z += (bench.wz(GYM.feetZ) - z) * w
      yaw += angleDelta(yaw, bench.yaw) * w
    }
    g.position.set(this.placed ? px + (x - px) * k : x, this.placed ? py + (y - py) * k : y, this.placed ? pz + (z - pz) * k : z)
    this.facing += angleDelta(this.facing, yaw) * (this.placed ? Math.min(1, 14 * dt) : 1)
    g.rotation.y = this.facing
    g.rotation.x = (-Math.PI / 2) * w
    this.placed = true

    // Speed from the actual movement, so the legs match what is drawn.
    const moved = dt > 0 ? Math.hypot(g.position.x - px, g.position.z - pz) / dt : 0
    this.speed += (Math.min(moved, 40) - this.speed) * Math.min(1, 10 * dt)
    const shown = this.speed < 0.3 ? 0 : this.speed

    this.carryW += ((this.carryKey ? 1 : 0) - this.carryW) * (1 - Math.exp(-10 * dt))
    this.animator?.update(dt, {
      grounded: p.grounded !== false,
      speed: shown,
      verticalVelocity: p.vy || 0,
      turn: 0,
      load: { grip: 0, carry: this.carryW, toss: 0 },
      bench: { w, rep: p.benchRep ?? 1 },
    })

    if (this.vehicle) {
      const { root, model } = this.vehicle
      const s = YARD.carryScale
      const sway = Math.sin(now * 0.009 + this.facing) * Math.min(1, shown / 8)
      root.position.set(g.position.x, g.position.y + PLAYER_DIMS.height + YARD.headClear + model.hy * s + Math.abs(sway) * 0.1, g.position.z)
      root.rotation.set(0, this.facing, sway * 0.06)
    }
    if (p.emoteSeq !== this.emoteSeq) {
      this.emoteSeq = p.emoteSeq
      void this.playEmote(p.emote)
    }
  }

  dispose() {
    this.scene.remove(this.group)
    if (this.vehicle) this.scene.remove(this.vehicle.root)
    disposeAnimator(this.animator)
    if (this.label) {
      this.label.material.map?.dispose()
      this.label.material.dispose()
    }
  }
}

// gym: createGym's result (the benches' world transforms). localRoot: the local player's group (chat bubbles).
export function createRemotePlayers(scene, { gym, localRoot, getPosition }) {
  const remotes = new Map() // sessionId -> Remote
  const order = []

  // Chat lines become bubbles over the speaker: the local player, or the roster entry with that name.
  bloxity.onChat((m) => {
    try {
      const text = bloxity.chatBubbleText(m)
      if (!text) return
      let root = m.isLocalPlayer ? localRoot : null
      if (!root) {
        for (const r of remotes.values()) if (r.name === (m.username || 'Player')) root = r.group
      }
      if (root) bloxity.attachChatBubble(THREE, root, text)
    } catch {
      // Bubbles are decoration.
    }
  })

  function update(dt) {
    const players = roster()
    if (!players) {
      if (remotes.size) {
        for (const r of remotes.values()) r.dispose()
        remotes.clear()
      }
      return
    }
    const me = getPosition()
    order.length = 0
    players.forEach((p, id) => {
      if (id === net.sessionId) return
      order.push({ id, p, d: Math.hypot(p.x - me.x, p.z - me.z) })
    })
    order.sort((a, b) => a.d - b.d)

    const seen = new Set()
    order.forEach(({ id, p, d }, i) => {
      seen.add(id)
      const show = i < MAX && d < NET.remoteFade
      let r = remotes.get(id)
      if (!show) {
        r?.setVisible(false)
        return
      }
      if (!r) remotes.set(id, (r = new Remote(scene)))
      r.setVisible(true)
      r.syncName(p.username)
      r.syncAvatar(p.avatar || '')
      r.syncCarry(p.carry || '')
      r.update(dt, p, gym)
      if (r.label) r.label.visible = d < NET.nameTag
    })
    for (const [id, r] of remotes) {
      if (!seen.has(id)) {
        r.dispose()
        remotes.delete(id)
      }
    }
  }

  return { update, count: () => remotes.size }
}
