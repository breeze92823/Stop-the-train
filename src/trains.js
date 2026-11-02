import { AdditiveBlending, CanvasTexture, Group, Mesh, Sprite, SpriteMaterial, Vector3 } from 'three'
import { ROUND, TRACK } from './config.js'
import { RAPIER, bindMesh, onTick, removeBody, unbindMesh, world } from './physics.js'
import { Kit, SLOT, sharedMaterial } from './vehicles.js'
import { launchPlayer, player } from './player.js'
import { paintSoftDot } from './textures.js'

// Trains: procedural diesels and wagons that run the rails as kinematic bodies (so they
// shove parked cars into a pile for real) and turn into dynamic, coupled rigid bodies the
// instant their HP runs out, so the derailment is an actual jackknife. Trains face -X.
const WHEEL_R = 0.56
const GAP = 1.1 // m between couplers

function axleGeometry() {
  const kit = new Kit()
  for (const s of [-1, 1]) {
    const z = (s * TRACK.gauge) / 2
    kit.cyl(WHEEL_R, 0.2, 0, 0, z, SLOT.steel, '#35353c', 'z', 18)
    kit.cyl(WHEEL_R + 0.06, 0.06, 0, 0, z - s * 0.12, SLOT.steel, '#4a4a52', 'z', 18) // flange
    kit.cyl(WHEEL_R * 0.42, 0.24, 0, 0, z, SLOT.chrome, '#8a8a94', 'z', 10)
    kit.box(WHEEL_R * 1.3, 0.1, 0.04, 0, 0, z + s * 0.12, SLOT.trim, '#16161a')
  }
  kit.cyl(0.11, TRACK.gauge, 0, 0, 0, SLOT.steel, '#2a2a30', 'z', 8)
  return kit.build()
}

function truck(kit, x, axles, spacing) {
  const y = WHEEL_R
  const dark = '#1d1e24'
  const len = (axles - 1) * spacing + 1.5
  for (const s of [-1, 1]) {
    const z = s * (TRACK.gauge / 2 + 0.34)
    kit.box(len, 0.52, 0.18, x, y + 0.06, z, SLOT.trim, dark)
    kit.box(len - 0.6, 0.2, 0.2, x, y + 0.42, z, SLOT.trim, '#26272e')
    for (let i = 0; i < axles; i++) {
      const ax = x + (i - (axles - 1) / 2) * spacing
      kit.cyl(0.16, 0.22, ax, y, z + s * 0.1, SLOT.steel, '#54545c', 'z', 8) // journal box
      kit.cyl(0.13, 0.5, ax + spacing * 0.3, y + 0.44, z, SLOT.chrome, '#7c7c86', 'y', 8) // spring
    }
  }
  kit.box(len * 0.6, 0.3, TRACK.gauge + 0.7, x, y + 0.62, 0, SLOT.trim, dark)
}

function locoBody(spec) {
  const kit = new Kit()
  const L = 19
  const { paint, trim, stripe } = spec
  const dark = '#17181d'
  const X = (v) => v - L / 2 // x measured from the nose
  // Frame and fuel tank.
  kit.box(L, 0.34, 4.1, 0, 1.54, 0, SLOT.trim, trim)
  kit.box(L + 0.02, 0.14, 4.14, 0, 1.46, 0, SLOT.paint, stripe)
  kit.box(5.4, 1.0, 3, 0, 0.98, 0, SLOT.trim, dark)
  kit.cyl(0.38, 3.6, 0, 0.72, 1.62, SLOT.steel, '#7c7c86', 'x', 12)
  kit.cyl(0.38, 3.6, 0, 0.72, -1.62, SLOT.steel, '#7c7c86', 'x', 12)
  truck(kit, X(3.9), 3, 1.6)
  truck(kit, X(15.1), 3, 1.6)

  // Long hood with louvres, fans and the exhaust stack.
  const hoodX = X(13.2)
  kit.box(10.8, 2.5, 2.9, hoodX, 2.97, 0, SLOT.paint, paint)
  kit.box(10.8, 0.5, 2.94, hoodX, 2.3, 0, SLOT.paint, stripe)
  kit.skin([
    { x: hoodX + 5.4, top: 4.34, bot: 3.9, w: 1.36 },
    { x: hoodX - 5.4, top: 4.34, bot: 3.9, w: 1.36 },
  ], SLOT.paint, paint, 12, 3)
  for (let i = 0; i < 12; i++) {
    for (const s of [-1, 1]) {
      kit.box(0.5, 0.86, 0.04, hoodX - 4.6 + i * 0.84, 3.1, s * 1.47, SLOT.trim, dark)
      for (let j = 0; j < 4; j++) kit.box(0.46, 0.05, 0.05, hoodX - 4.6 + i * 0.84, 2.78 + j * 0.2, s * 1.49, SLOT.steel, '#4c4c54')
    }
  }
  for (const fx of [hoodX + 3.2, hoodX + 1, hoodX - 1.2]) {
    kit.cyl(0.74, 0.2, fx, 4.38, 0, SLOT.trim, dark, 'y', 16)
    kit.box(1.4, 0.05, 0.1, fx, 4.5, 0, SLOT.steel, '#6a6a72')
    kit.box(0.1, 0.05, 1.4, fx, 4.5, 0, SLOT.steel, '#6a6a72')
  }
  kit.box(1.1, 0.5, 0.7, hoodX - 3.6, 4.6, 0, SLOT.trim, dark)

  // Cab.
  const cabX = X(6.6)
  kit.box(3.5, 3.1, 4, cabX, 3.3, 0, SLOT.paint, paint)
  kit.box(3.5, 0.5, 4.04, cabX, 2.3, 0, SLOT.paint, stripe)
  kit.box(3.9, 0.22, 4.3, cabX, 4.95, 0, SLOT.trim, trim)
  kit.box(3.7, 0.16, 3.9, cabX, 5.14, 0, SLOT.trim, trim)
  kit.box(0.06, 1.05, 1.6, cabX - 1.76, 3.95, 0.98, SLOT.glass, '#7cc0e6')
  kit.box(0.06, 1.05, 1.6, cabX - 1.76, 3.95, -0.98, SLOT.glass, '#7cc0e6')
  for (const s of [-1, 1]) {
    kit.box(1.5, 0.96, 0.06, cabX - 0.5, 3.95, s * 2.02, SLOT.glass, '#7cc0e6')
    kit.box(0.8, 1.9, 0.06, cabX + 1, 3, s * 2.02, SLOT.trim, trim)
  }
  // Short hood and face.
  const noseX = X(2.6)
  kit.box(3.4, 1.7, 2.8, noseX, 2.55, 0, SLOT.paint, paint)
  kit.box(3.42, 0.4, 2.84, noseX, 2.2, 0, SLOT.paint, stripe)
  kit.box(0.08, 0.58, 2.2, noseX - 1.72, 3.1, 0, SLOT.trim, dark)
  for (const s of [-1, 1]) {
    kit.cyl(0.2, 0.1, noseX - 1.74, 3.12, s * 0.52, SLOT.head, '#ffffff', 'x', 14)
    kit.cyl(0.2, 0.1, X(0.3), 1.2, s * 1.5, SLOT.head, '#ffffff', 'x', 12)
  }
  // Pilot: the wedge plow, coupler, steps.
  kit.box(0.5, 1.05, 4.1, X(0.1), 0.98, 0, SLOT.paint, stripe, 0, 0, 0.32)
  kit.box(0.7, 0.34, 0.6, X(-0.1), 1.12, 0, SLOT.steel, '#32323a')
  kit.box(0.7, 0.34, 0.6, X(L + 0.1), 1.12, 0, SLOT.steel, '#32323a')
  for (let i = 0; i < 3; i++) kit.box(0.9, 0.06, 3.9, X(0.7), 0.5 + i * 0.32, 0, SLOT.steel, '#5a5a64')
  // Hand rails along the walkway.
  for (const s of [-1, 1]) {
    kit.cyl(0.05, 16.4, X(9.6), 2.72, s * 1.96, SLOT.chrome, '#e4e4ec', 'x', 6)
    for (let i = 0; i < 9; i++) kit.cyl(0.04, 1.06, X(1.6 + i * 2), 2.2, s * 1.96, SLOT.chrome, '#e4e4ec', 'y', 6)
  }
  kit.box(1.4, 0.16, 1.6, hoodX + 0.6, 4.5, 0, SLOT.tail, spec.stripe)
  return { geometry: kit.build(), L, H: 5.2, axles: [X(2.3), X(3.9), X(5.5), X(13.5), X(15.1), X(16.7)], stack: [hoodX - 3.6, 4.9] }
}

function wagonBody(kind, spec) {
  const kit = new Kit()
  const L = 14
  const { paint, trim, stripe } = spec
  const dark = '#1b1c22'
  kit.box(L, 0.3, 3.5, 0, 1.46, 0, SLOT.trim, dark)
  truck(kit, -L / 2 + 2.4, 2, 1.9)
  truck(kit, L / 2 - 2.4, 2, 1.9)
  kit.box(0.6, 0.3, 0.5, -L / 2 - 0.2, 1.12, 0, SLOT.steel, '#32323a')
  kit.box(0.6, 0.3, 0.5, L / 2 + 0.2, 1.12, 0, SLOT.steel, '#32323a')
  if (kind === 'box') {
    kit.box(L - 0.4, 3, 3.5, 0, 3.1, 0, SLOT.paint, paint)
    kit.box(L, 0.2, 3.7, 0, 4.7, 0, SLOT.trim, trim)
    for (let i = 0; i < 16; i++) {
      for (const s of [-1, 1]) kit.box(0.12, 3, 0.1, -L / 2 + 0.45 + i * 0.87, 3.1, s * 1.77, SLOT.paint, trim)
    }
    for (const s of [-1, 1]) {
      kit.box(2.6, 2.7, 0.1, 0.4, 3, s * 1.8, SLOT.paint, stripe)
      kit.box(0.1, 2.8, 0.14, 1.1, 3, s * 1.84, SLOT.steel, '#6a6a72')
      kit.box(L - 0.4, 0.16, 0.14, 0, 4.48, s * 1.78, SLOT.trim, trim)
      kit.box(L - 0.4, 0.16, 0.14, 0, 1.74, s * 1.78, SLOT.trim, trim)
    }
  } else if (kind === 'gondola') {
    // Open lattice car, heaped with cargo.
    for (const s of [-1, 1]) {
      kit.box(L - 0.4, 0.26, 0.14, 0, 1.76, s * 1.76, SLOT.paint, paint)
      kit.box(L - 0.4, 0.26, 0.14, 0, 4.2, s * 1.76, SLOT.paint, paint)
      kit.box(L - 0.4, 2.3, 0.04, 0, 2.96, s * 1.68, SLOT.trim, trim)
      for (let i = 0; i < 20; i++) kit.box(0.14, 2.5, 0.14, -L / 2 + 0.5 + i * 0.68, 2.96, s * 1.76, SLOT.paint, paint)
    }
    for (const e of [-1, 1]) kit.box(0.14, 2.6, 3.5, (e * (L - 0.4)) / 2, 2.96, 0, SLOT.paint, paint)
    kit.box(L - 0.8, 2, 3.2, 0, 2.7, 0, SLOT.trim, trim)
    for (let i = 0; i < 10; i++) kit.ball(1.1, -L / 2 + 1.6 + i * 1.2, 3.7 + (i % 3) * 0.1, (i % 2 ? 1 : -1) * 0.5, SLOT.rust, '#3c3b42', 1, 0.5, 1)
  } else {
    kit.cyl(1.72, L - 1.4, 0, 3.32, 0, SLOT.paint, paint, 'x', 20)
    kit.ball(1.72, L / 2 - 0.7, 3.32, 0, SLOT.paint, paint, 0.34, 1, 1)
    kit.ball(1.72, -L / 2 + 0.7, 3.32, 0, SLOT.paint, paint, 0.34, 1, 1)
    kit.cyl(0.5, 0.5, 0, 5.1, 0, SLOT.trim, trim, 'y', 14)
    for (const px of [-4.6, -1.5, 1.5, 4.6]) kit.box(0.16, 0.9, 3.5, px, 1.9, 0, SLOT.trim, dark)
    kit.cyl(1.74, 1.1, 0, 3.32, 0, SLOT.paint, stripe, 'x', 20)
    for (const px of [-3.4, 3.4]) kit.cyl(1.76, 0.1, px, 3.32, 0, SLOT.steel, '#6a6a72', 'x', 20)
  }
  const a = L / 2 - 2.4
  return { geometry: kit.build(), L, H: 4.8, axles: [-a - 0.95, -a + 0.95, a - 0.95, a + 0.95] }
}

const models = new Map()
function modelFor(spec, kind) {
  const key = `${spec.id}|${kind}`
  if (!models.has(key)) models.set(key, kind === 'loco' ? locoBody(spec) : wagonBody(kind, spec))
  return models.get(key)
}

let axleGeo = null
const out = new Vector3()

export function createTrains(scene, fx, sound, hooks) {
  axleGeo ??= axleGeometry()
  const glowTex = new CanvasTexture(paintSoftDot(64))
  const beam = new Sprite(new SpriteMaterial({ map: glowTex, color: '#fff2c8', blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }))
  beam.scale.setScalar(9)
  scene.add(beam)

  let t = null // the running train

  function makeCar(model, x) {
    const group = new Group()
    group.position.set(x, TRACK.top + model.H / 2, TRACK.z)
    const mesh = new Mesh(model.geometry, sharedMaterial())
    mesh.position.y = -model.H / 2
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    const axles = model.axles.map((ax) => {
      const a = new Mesh(axleGeo, sharedMaterial())
      a.position.set(ax, WHEEL_R - model.H / 2, 0)
      a.castShadow = true
      group.add(a)
      return a
    })
    scene.add(group)
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(group.position.x, group.position.y, group.position.z)
    const body = world.createRigidBody(desc)
    const col = RAPIER.ColliderDesc.cuboid(model.L / 2, model.H / 2 - 0.1, 2).setDensity(0.9).setFriction(0.22).setRestitution(0.08)
    world.createCollider(col, body)
    bindMesh(body, group)
    return { group, body, model, axles, offset: 0, burning: null, roll: 0 }
  }

  // `at`: `startHead`: join a train that is already running (shared round) at this position.
  function spawn(spec, hp, startHead) {
    const head = startHead ?? TRACK.mouth + spec.speed * ROUND.approachSeconds
    const cars = []
    let at = head
    const list = ['loco', ...spec.wagons]
    list.forEach((kind) => {
      const model = modelFor(spec, kind)
      const c = makeCar(model, at + model.L / 2)
      c.offset = at + model.L / 2 - head
      at += model.L + GAP
      cars.push(c)
    })
    t = { spec, cars, head, length: at - head, speed: spec.speed, target: spec.speed, hp, maxHp: spec.hp, state: 'run', timer: 0, joints: [], horned: false, shake: 0, events: [], brake: 0, hitSmoke: 0, grindCd: 0, gougeCd: 0 }
    const loco = cars[0]
    t.smoke = fx.addEmitter({
      rate: 34,
      tick(p, n) {
        if (!t || t.state !== 'run') return false
        p.set(loco.group.position.x + loco.model.stack[0], TRACK.top + loco.model.stack[1], TRACK.z)
        for (let i = 0; i < n; i++) fx.puff(p, 0.7, 'smoke', 5, 1.8, 0.8, t.speed * 0.1)
      },
    })
    if (spec.aura) {
      t.aura = fx.addEmitter({
        rate: 90,
        tick(p, n) {
          if (!t || t.state !== 'run') return false
          for (let i = 0; i < n; i++) {
            const c = t.cars[Math.floor(Math.random() * t.cars.length)]
            p.set(c.group.position.x + (Math.random() - 0.5) * c.model.L, TRACK.top + 2.6, TRACK.z)
            fx.sparkle(p, 'magic', 2.6)
          }
        },
      })
    }
    sound.horn(head)
    hooks.onSpawn?.(t)
    return t
  }

  const carSpeed = () => t.speed

  // Shared round: the server's report of where the train is and how fast.
  function netSync(head, speed) {
    if (!t || t.state !== 'run') return
    t.netHead = head
    t.speed = speed
  }
  // The server's verdict on a hit: the train's HP and braking (the crash itself is hooks.onHit).
  function netHit(hp, speed) {
    if (!t || t.state !== 'run') return null
    t.hp = hp
    t.speed = speed
    t.target = t.spec.speed * (0.48 + 0.52 * (hp / t.maxHp))
    t.brake = 1
    return t
  }
  const netDerail = () => t?.state === 'run' && derail()
  // The server ended the wreck / the pass: wrap up here at once.
  const netFinish = (result) => t && finish(result)

  function hitPlayer() {
    const p = player.position
    if (p.y > 6 || Math.abs(p.z - TRACK.z) > 3.2) return
    if (p.x < t.head - 1 || p.x > t.head + t.length) return
    launchPlayer(-t.speed * 0.9, 13, Math.sign(p.z - TRACK.z || 1) * 15)
    sound.body(p.x, p.z)
    fx.dustRing(p.x, p.z, 1.6, 10)
  }

  function step(dt) {
    if (!t) return
    t.timer += dt
    if (t.state !== 'run') return
    const shared = hooks.shared?.()
    // Shared round: the server owns speed, hits and HP; the head only eases toward its last report.
    if (!shared) t.speed += Math.sign(t.target - t.speed) * Math.min(Math.abs(t.target - t.speed), 7 * dt)
    t.head -= t.speed * dt
    if (shared && t.netHead != null) t.head += (t.netHead - t.head) * Math.min(1, 8 * dt)
    for (const c of t.cars) {
      c.roll += (t.speed * dt) / WHEEL_R
      c.body.setNextKinematicTranslation({ x: t.head + c.offset, y: TRACK.top + c.model.H / 2, z: TRACK.z })
    }
    hitPlayer()
    if (shared) {
      if (t.head + t.length < -TRACK.mouth - 6) finish('through')
      return
    }
    let v = hooks.nextVehicle(t.head)
    while (v) {
      const hp = t.hp
      const damage = Math.min(v.hp, hp)
      t.hp = Math.max(0, hp - v.hp)
      const ratio = Math.min(1, v.hp / Math.max(1, t.maxHp * 0.25))
      t.speed *= 1 - 0.1 - 0.16 * ratio
      t.target = t.spec.speed * (0.48 + 0.52 * (t.hp / t.maxHp))
      t.brake = 1
      hooks.onHit(v, damage, t, t.speed)
      if (t.hp <= 0) {
        derail()
        return
      }
      v = hooks.nextVehicle(t.head)
    }
    if (t.head + t.length < -TRACK.mouth - 6) finish('through')
  }
  onTick(step)

  function explodeAt(x, y, z, big = 1) {
    fx.fireball(x, y, z, 2.8 * big, 28)
    fx.smokeBurst(x, y + 1, z, 12, 3.4 * big)
    fx.sparks(x, y, z, 90, 22)
    fx.debris(x, y, z, 26, ['#2b2b30', t.spec.paint, t.spec.trim, '#55555c'], 20)
    fx.flash(x, y + 1, z, 900 * big, 2.4, '#ffa35a')
    fx.shockwave(x, 0.15, z, 26 * big)
    fx.scorch(x, z, 12 * big, Math.random() * 3)
    sound.explosion(x, z, big)
    hooks.onBlast?.(x, y, z, big)
  }

  function derail() {
    // However hard the last hits braked it, the wagons still carry the train's full weight.
    const speed = Math.max(t.speed, t.spec.speed * 0.82)
    const side = Math.random() < 0.5 ? -1 : 1
    t.state = 'derail'
    t.timer = 0
    t.finalSpeed = speed
    t.cars.forEach((c, i) => {
      c.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
      const flip = side * (i % 2 ? -1 : 1)
      const s = speed * (1 + 0.1 * i)
      // The locomotive rears up and rolls; the wagons behind jackknife left and right.
      c.body.setLinvel({ x: -s, y: i === 0 ? 8.5 : 2.5 + Math.random() * 3, z: flip * (i === 0 ? 7.5 : 4 + Math.random() * 4) }, true)
      c.body.setAngvel({ x: flip * (i === 0 ? 2.4 : 0.9 + Math.random() * 1.1), y: flip * (i === 0 ? 1.1 : 0.7 + Math.random() * 0.7), z: i === 0 ? -0.65 : (Math.random() - 0.5) * 0.7 }, true)
      c.body.setLinearDamping(0.08)
      c.body.setAngularDamping(0.25)
      if (i < t.cars.length - 1) {
        const n = t.cars[i + 1]
        const data = RAPIER.JointData.spherical({ x: c.model.L / 2 + GAP / 2, y: 0, z: 0 }, { x: -n.model.L / 2 - GAP / 2, y: 0, z: 0 })
        t.joints.push(world.createImpulseJoint(data, c.body, n.body, true))
      }
    })
    const loco = t.cars[0]
    const nose = loco.group.position.x - loco.model.L / 2
    explodeAt(nose + 1, 3, TRACK.z, 1.5)
    hooks.onDerail(t)
    sound.derail(nose)
    // The chain reaction down the train.
    const plan = [[0.32, 0], [0.75, 1], [1.15, 0], [1.6, 2], [2.2, 1], [3.2, 0]]
    t.events = plan.filter(([, i]) => i < t.cars.length).map(([at, i]) => ({ at, i, done: false }))
    for (const [i, c] of t.cars.entries()) {
      if (i > 2) break
      c.burning = fx.addEmitter({
        rate: i === 0 ? 150 : 80,
        tick(p, n) {
          const g = c.group
          if (!g.parent) return false
          for (let k = 0; k < n; k++) {
            p.set(g.position.x + (Math.random() - 0.5) * c.model.L * 0.8, g.position.y + 1.2, g.position.z + (Math.random() - 0.5) * 2)
            if (k % 3 === 2) fx.puff(p, 1.8, 'blacksmoke', 5, 4.6, 0.9)
            else fx.flame(p, 1.5, 'fire', 4.6)
          }
        },
      })
    }
  }

  function clear(dust) {
    // Pulling bodies out of the world mid-wreck panics Rapier (the joints and contacts still point at
    // them), so they are switched off now and removed once the world has stepped without them.
    // The coupling joints go first, while both of their bodies are still alive: disabling or removing
    // a body that still owns a joint is what trips Rapier's `unreachable`.
    const bodies = t.cars.map((c) => c.body)
    for (const j of t.joints) world.removeImpulseJoint(j, false)
    t.joints.length = 0
    for (const b of bodies) {
      b.setLinvel({ x: 0, y: 0, z: 0 }, false)
      b.setAngvel({ x: 0, y: 0, z: 0 }, false)
      b.setEnabled(false)
    }
    setTimeout(() => {
      for (const b of bodies) if (world.getRigidBody(b.handle)) removeBody(b)
    }, 250)
    for (const c of t.cars) {
      if (c.burning) fx.removeEmitter(c.burning)
      if (dust) {
        fx.smokeBurst(c.group.position.x, 1.5, c.group.position.z, 16, 3.6, 'dust')
        fx.dustRing(c.group.position.x, c.group.position.z, 5, 16, 'dust')
      }
      unbindMesh(c.group)
      scene.remove(c.group)
    }
    beam.material.opacity = 0
  }

  function finish(result) {
    const done = t
    if (done.smoke) fx.removeEmitter(done.smoke)
    if (done.aura) fx.removeEmitter(done.aura)
    clear(result === 'stopped')
    t = null
    hooks.onGone(result, done)
  }

  // The player left this world: its train is simply gone, with no result to report.
  function abort() {
    if (!t) return
    if (t.smoke) fx.removeEmitter(t.smoke)
    if (t.aura) fx.removeEmitter(t.aura)
    clear(false)
    t = null
  }

  // Per-frame: wheels, light, wreck sparks, the burn-down.
  function update(dt) {
    sound.trainTick(t, dt)
    if (!t) return
    if (t.state === 'run') {
      for (const c of t.cars) for (const a of c.axles) a.rotation.z = c.roll
      const noseX = t.cars[0].group.position.x - t.cars[0].model.L / 2
      const y = TRACK.top + 2.6
      beam.position.set(noseX - 0.4, y + 0.5, TRACK.z)
      beam.material.opacity = 0.9
      if (t.brake > 0) {
        t.brake = Math.max(0, t.brake - dt * 0.7)
        for (const c of t.cars) {
          out.set(c.group.position.x, TRACK.top + 0.1, TRACK.z)
          for (const s of [-1, 1]) if (Math.random() < 0.8) fx.sparks(out.x + (Math.random() - 0.5) * c.model.L, out.y, TRACK.z + (s * TRACK.gauge) / 2, 2, 7, 0.5, 0.4)
        }
      }
      return
    }
    beam.material.opacity *= Math.exp(-3 * dt)
    for (const e of t.events) {
      if (e.done || t.timer < e.at) continue
      e.done = true
      const c = t.cars[e.i]
      explodeAt(c.group.position.x, c.group.position.y, c.group.position.z, e.i === 0 ? 1.1 : 0.8)
    }
    let fastest = 0
    t.gougeCd -= dt
    const carve = t.gougeCd <= 0
    if (carve) t.gougeCd = 0.05
    for (const c of t.cars) {
      const v = c.body.linvel()
      const sp = Math.hypot(v.x, v.z)
      fastest = Math.max(fastest, sp)
      const low = c.group.position.y < c.model.H * 0.95
      if (sp > 2.5 && low) {
        const px = c.group.position.x + (Math.random() - 0.5) * c.model.L
        const pz = c.group.position.z + (Math.random() - 0.5) * 3
        fx.sparks(px, 0.25, pz, 8, 9 + sp * 0.6, (v.x / sp) * 0.7, 0.45, (v.z / sp) * 0.7)
        out.set(px, 0.3, pz)
        if (Math.random() < 0.5) fx.puff(out, 1.3, 'dust', 1.4, 1.4, 0.8)
        if (carve && sp > 4) fx.scorch(c.group.position.x, c.group.position.z, 3.2, Math.atan2(-v.z, v.x), 2.2, 0.75)
      }
    }
    sound.grind(fastest, t.cars[0].group.position.x, t.cars[0].group.position.z)
    if (t.timer > ROUND.wreckSeconds) finish('stopped')
  }

  return {
    spawn,
    abort,
    update,
    get active() {
      return t
    },
    speed: carSpeed,
    netSync,
    netHit,
    netDerail,
    netFinish,
    // The first car's position, for the camera shake and sounds.
    frontX: () => (t ? t.cars[0].group.position.x : 0),
  }
}
