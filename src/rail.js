import { Quaternion, Vector3 } from 'three'
import { PHYSICS, TRACK, VARIANTS } from './config.js'
import { RAPIER, addDynamic, lockFromPlayer, onTick, removeBody, unbindMesh, unlockFromPlayer } from './physics.js'
import { crumple, makeVehicle, sharedMaterial, variantMaterial, vehicleModel } from './vehicles.js'

// Vehicles out in the world: thrown onto the rail by the player, resting as real
// rigid bodies so they stack and topple, and smashed one by one by the train.
const TOSS_TIME = 0.72 // s a thrown vehicle hangs in the air
const SPENT_LIFE = 6.5 // s a smashed vehicle lies around
const MAX_SPENT = 24

const toLocal = new Quaternion()
const hit = new Vector3()
const dir = new Vector3()
const rnd = (a, b) => a + Math.random() * (b - a)

export function createRail(scene, fx, sound, hooks) {
  const parked = [] // on the rail, unhit
  const spent = [] // flung by a train, or dropped away from the rail

  function totals() {
    let hp = 0
    for (const v of parked) hp += v.hp
    return { hp, count: parked.length }
  }
  const announce = () => {
    const { hp, count } = totals()
    hooks.onChange(hp, count)
  }

  function body(item, x, y, z, yaw) {
    const { root, model } = item.vehicle
    root.position.set(x, y, z)
    root.rotation.set(0, yaw, 0)
    scene.add(root)
    const shape = RAPIER.ColliderDesc.cuboid(model.hx * 0.96, model.hy * 0.96, model.hz * 0.96)
    item.body = addDynamic(root, shape, { density: 0.5, friction: 0.7, restitution: 0.04, linearDamping: 0.06, angularDamping: 0.4, ccd: true })
  }

  // Ids tie an item to the server's shared rail (ids are random, so two players never clash).
  const newId = () => Math.random().toString(36).slice(2, 12)
  const byId = (id) => parked.find((v) => v.id === id) ?? null

  function make(spec, id) {
    const model = vehicleModel(spec.type, spec.paint)
    const material = spec.variant && spec.variant !== 'normal' ? variantMaterial(spec.variant) : sharedMaterial()
    const vehicle = makeVehicle(model, material)
    return { id: id ?? newId(), vehicle, spec, hp: spec.hp, x: 0, halfLen: model.hx, landed: false, age: 0, vyPrev: 0, squash: 0, flame: null }
  }

  // Burning aura of golden and emerald vehicles.
  function aura(item) {
    const v = VARIANTS[item.spec.variant]
    if (!v?.flame) return
    const kind = item.spec.variant === 'golden' ? 'gold' : 'emerald'
    item.flame = fx.addEmitter({
      rate: 16,
      tick(p, n) {
        const { root, model } = item.vehicle
        if (!root.parent) return false
        for (let i = 0; i < n; i++) {
          p.set(root.position.x + rnd(-model.hx, model.hx), root.position.y - model.hy * 0.6, root.position.z + rnd(-model.hz, model.hz))
          fx.flame(p, 0.8, kind, 2.8, 0.75)
        }
      },
    })
  }

  // Top of whatever already stands near x, so a toss lands on the pile.
  function pileTop(x, reach) {
    let top = TRACK.top
    for (const v of parked) {
      const p = v.vehicle.root.position
      if (Math.abs(p.x - x) < reach + v.halfLen * 0.7) top = Math.max(top, p.y + v.vehicle.model.hy)
    }
    return top
  }

  // Throws a vehicle from `from` (world) to rail position x, along a ballistic arc.
  // `id` / `remote` come from the shared rail: another player's throw is not sent back.
  // `foreign`: another player's vehicle, which the local player cannot shove.
  function park(spec, from, x, id, remote = false, foreign = false) {
    const item = make(spec, id)
    const { model } = item.vehicle
    const yaw = (Math.random() < 0.5 ? 0 : Math.PI) + rnd(-0.28, 0.28)
    const y = pileTop(x, model.hx) + model.hy + 0.1
    const z = TRACK.z + rnd(-0.22, 0.22)
    body(item, from.x, from.y, from.z, yaw)
    const g = PHYSICS.gravity
    item.body.setLinvel({ x: (x - from.x) / TOSS_TIME, y: (y - from.y - 0.5 * g * TOSS_TIME * TOSS_TIME) / TOSS_TIME, z: (z - from.z) / TOSS_TIME }, true)
    item.body.setAngvel({ x: rnd(-0.8, 0.8), y: rnd(-0.6, 0.6), z: rnd(-0.8, 0.8) }, true)
    item.x = x
    if (foreign) lockFromPlayer(item.body)
    parked.push(item)
    aura(item)
    announce()
    if (!remote) {
      hooks.onPark?.(item, spec, from, x)
      hooks.onParked?.()
    }
    return item
  }

  // Sets a vehicle straight down onto the rail (the lobby's first few).
  function seed(spec, x, height = 0, id, remote = false, foreign = false) {
    const item = make(spec, id)
    const { model } = item.vehicle
    body(item, x, TRACK.top + model.hy + 0.02 + height, TRACK.z + rnd(-0.2, 0.2), (Math.random() < 0.5 ? 0 : Math.PI) + rnd(-0.22, 0.22))
    item.landed = true
    item.x = x
    if (foreign) lockFromPlayer(item.body)
    parked.push(item)
    aura(item)
    announce()
    if (!remote) {
      hooks.onPark?.(item, spec, null, x)
      hooks.onParked?.()
    }
    return item
  }

  // The shared rail was (re)loaded: whatever stood here is replaced.
  function reset() {
    for (const item of parked.splice(0)) remove(item)
    announce()
  }

  // The server refused a throw: the vehicle tumbles off like a dropped one.
  function discard(id) {
    const item = byId(id)
    if (!item) return
    parked.splice(parked.indexOf(item), 1)
    item.age = SPENT_LIFE - 2.6
    spent.push(item)
    announce()
  }

  // What stands on the rail now, to stock a new shared room.
  const list = () => parked.map((v) => ({ spec: v.spec, x: v.x, halfLen: v.halfLen }))

  // A vehicle let go away from the rail: it bounces once and is reclaimed.
  function dropAway(spec, from, vx, vz) {
    const item = make(spec)
    const yaw = rnd(0, 6.28)
    body(item, from.x, from.y, from.z, yaw)
    item.body.setLinvel({ x: vx, y: 3, z: vz }, true)
    item.body.setAngvel({ x: rnd(-1, 1), y: rnd(-1, 1), z: rnd(-1, 1) }, true)
    item.age = SPENT_LIFE - 2.6
    spent.push(item)
  }

  // The eastmost vehicle the train's nose has reached, if any.
  function nextAt(front) {
    let best = null
    for (const v of parked) {
      const px = v.vehicle.root.position.x + v.halfLen
      if (px >= front - 0.2 && (!best || v.vehicle.root.position.x > best.vehicle.root.position.x)) best = v
    }
    return best
  }

  function smash(item, speed) {
    const i = parked.indexOf(item)
    if (i >= 0) parked.splice(i, 1)
    const { root, model } = item.vehicle
    const b = item.body
    unlockFromPlayer(b)
    const t = b.translation()
    const r = b.rotation()
    // Fold the side that took it.
    toLocal.set(r.x, r.y, r.z, r.w).invert()
    hit.set(model.hx, rnd(-0.1, 0.4), rnd(-0.4, 0.4)).applyQuaternion(new Quaternion(r.x, r.y, r.z, r.w))
    hit.x = Math.abs(hit.x)
    hit.applyQuaternion(toLocal)
    dir.set(-1, rnd(0.1, 0.5), rnd(-0.4, 0.4)).applyQuaternion(toLocal)
    crumple(item.vehicle, hit.x, hit.y, hit.z, dir.x, dir.y, dir.z, model.hx * 1.5, 1.1)
    crumple(item.vehicle, -hit.x * 0.6, rnd(0, 0.5), -hit.z, dir.x * 0.5, 0.6, dir.z, model.hx * 0.9, 0.5)

    const launch = Math.max(9, speed)
    b.setLinvel({ x: -launch * rnd(1.15, 1.8), y: rnd(6, 13) + speed * 0.18, z: rnd(-1, 1) * rnd(3, 11) }, true)
    b.setAngvel({ x: rnd(-7, 7), y: rnd(-5, 5), z: rnd(-8, 8) }, true)
    b.setAngularDamping(0.15)

    const px = t.x + model.hx * 0.5
    const py = t.y
    const pz = t.z
    fx.sparks(px, py, pz, 70, 21, -0.5, 0.5)
    fx.fireball(px, py, pz, 0.8, 4)
    fx.glass(px, py + 0.4, pz, 20, -0.6)
    fx.debris(px, py, pz, 12, [item.spec.paint, item.spec.paint, '#1a1a1e', '#8c8c96'], 16, -0.7)
    fx.smokeBurst(px, py, pz, 5, 1.8, 'smoke')
    fx.flash(px, py + 1, pz, 240, 7, '#ffcf9a')
    fx.dustRing(t.x, t.z, 2.6, 12, 'grass')
    if (Math.random() < 0.7) fx.wheel(t.x, 0.8, t.z + rnd(-1, 1), -speed * rnd(1, 1.6), rnd(5, 10), rnd(-7, 7))
    sound.crunch(t.x, t.z, Math.min(1, 0.55 + model.hx * 0.1))
    item.age = 0
    if (item.flame) fx.removeEmitter(item.flame)
    item.flame = null
    spent.push(item)
    if (spent.length > MAX_SPENT) remove(spent.shift())
    void root
    announce()
  }

  function remove(item) {
    const { root } = item.vehicle
    if (item.flame) fx.removeEmitter(item.flame)
    unbindMesh(root)
    scene.remove(root)
    removeBody(item.body)
    if (item.vehicle.ownGeometry) item.vehicle.mesh.geometry.dispose()
  }

  // Landing detection, once per physics tick.
  onTick(() => {
    for (const item of parked) {
      if (item.landed) continue
      item.age += PHYSICS.fixedStep
      const vy = item.body.linvel().y
      if (item.age > 0.2 && item.vyPrev < -5 && vy > item.vyPrev + 4) {
        item.landed = true
        const t = item.body.translation()
        const force = Math.min(1, -item.vyPrev / 22)
        item.squash = 1
        fx.dustRing(t.x, t.z, 2.4, 16, 'dust')
        fx.sparks(t.x, TRACK.top + 0.2, t.z, 16, 8)
        fx.debris(t.x, TRACK.top + 0.1, t.z, 3, '#c8703b', 7, 0, 0, 0.3)
        sound.carLand(t.x, t.z, force)
        hooks.onLand?.(t.x, t.z, force)
      }
      item.vyPrev = vy
    }
  })

  function update(dt) {
    for (let i = spent.length - 1; i >= 0; i--) {
      const item = spent[i]
      item.age += dt
      const left = SPENT_LIFE - item.age
      if (left < 0.5) {
        item.vehicle.root.scale.setScalar(Math.max(0.01, left / 0.5))
        if (left <= 0) {
          const p = item.vehicle.root.position
          fx.smokeBurst(p.x, p.y, p.z, 5, 1.8, 'dust')
          remove(item)
          spent.splice(i, 1)
        }
      }
    }
    for (const item of parked) {
      if (item.squash <= 0) continue
      item.squash = Math.max(0, item.squash - dt * 3)
      const k = Math.sin(item.squash * 14) * item.squash * 0.1
      item.vehicle.mesh.scale.y = 1 - k
    }
  }

  // A vehicle shaken off the rail bed by a wreck no longer counts; it is treated as smashed.
  function sweep() {
    for (let i = parked.length - 1; i >= 0; i--) {
      const v = parked[i]
      if (Math.abs(v.vehicle.root.position.z - TRACK.z) > 7) {
        parked.splice(i, 1)
        unlockFromPlayer(v.body)
        v.age = 0
        spent.push(v)
      }
    }
    announce()
  }

  // After a wreck the whole railway is cleaned: every vehicle left on it and every smashed one lying
  // around shrinks away in a puff of dust.
  function clearAll() {
    for (const v of parked.splice(0)) {
      unlockFromPlayer(v.body)
      if (v.flame) fx.removeEmitter(v.flame)
      v.flame = null
      spent.push(v)
    }
    for (const v of spent) v.age = Math.max(v.age, SPENT_LIFE - rnd(0.5, 1.6))
    announce()
  }

  // Trembles the parked vehicles as a train closes in.
  function rumble(k) {
    if (k <= 0) return
    for (const v of parked) v.vehicle.mesh.position.y = -v.vehicle.model.cy + Math.sin(performance.now() * 0.05 + v.x) * 0.012 * k
  }

  return { setOnPark: (fn) => (hooks.onPark = fn), park, seed, reset, discard, list, byId, dropAway, nextAt, smash, update, sweep, clearAll, rumble, totals, count: () => parked.length, spentCount: () => spent.length }
}
