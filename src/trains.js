import { AdditiveBlending, CanvasTexture, Group, Mesh, Quaternion, Sprite, SpriteMaterial, Vector3 } from 'three'
import { PHYSICS, ROUND, TRACK } from './config.js'
import { RAPIER, bindMesh, onTick, removeBody, unbindMesh, world } from './physics.js'
import { Kit, SLOT, sharedMaterial } from './vehicles.js'
import { launchPlayer, player } from './player.js'
import { paintSoftDot } from './textures.js'

// Trains: procedural diesels and wagons that run the rails as kinematic bodies (so they
// shove parked cars into a pile for real) and turn into dynamic, coupled rigid bodies the
// instant their HP runs out, so the derailment is an actual jackknife. The models face -X; a train's
// `dir` is -1 (out of the east tunnel, heading west) or +1 (out of the west one: its cars turned round).
const WHEEL_R = 0.56
const GAP = 1.1 // m between couplers
const COUPLER = { massShare: 1 / 8, stiffness: 0.3 } // share of a car's mass felt at a coupler; share of the gap closed per tick

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
const turn = new Quaternion()
const armA = new Vector3()
const armB = new Vector3()
const velA = new Vector3()
const velB = new Vector3()

// World point on a car's long axis through its centre of mass (low: the frame is the heavy part), `x`
// from the centre; `arm` receives the offset from the centre of mass, so pointVelocity is exact and a
// coupler's pull has no lever to roll or pitch the car with.
function couplerPoint(body, x, arm) {
  const r = body.rotation()
  const c = body.worldCom()
  arm.set(x, 0, 0).applyQuaternion(turn.set(r.x, r.y, r.z, r.w))
  return { x: c.x + arm.x, y: c.y + arm.y, z: c.z + arm.z }
}

// Velocity of the body at centre + arm.
function pointVelocity(body, arm, out) {
  const v = body.linvel()
  const w = body.angvel()
  return out.set(v.x + w.y * arm.z - w.z * arm.y, v.y + w.z * arm.x - w.x * arm.z, v.z + w.x * arm.y - w.y * arm.x)
}

export function createTrains(scene, fx, sound, hooks) {
  axleGeo ??= axleGeometry()
  const glowTex = new CanvasTexture(paintSoftDot(64))
  const beam = new Sprite(new SpriteMaterial({ map: glowTex, color: '#fff2c8', blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }))
  beam.scale.setScalar(9)
  scene.add(beam)

  let t = null // the running train

  function makeCar(model, x, dir) {
    const group = new Group()
    group.position.set(x, TRACK.top + model.H / 2, TRACK.z)
    if (dir > 0) group.rotation.y = Math.PI
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
    if (dir > 0) desc.setRotation({ x: 0, y: 1, z: 0, w: 0 }) // half a turn about Y: nose to +X
    const body = world.createRigidBody(desc)
    const col = RAPIER.ColliderDesc.cuboid(model.L / 2, model.H / 2 - 0.1, 2).setDensity(0.9).setFriction(0.22).setRestitution(0.08)
    const collider = world.createCollider(col, body)
    // The frame, trucks and engine: most of a car's weight rides low, so a wreck slides and rolls
    // onto its side like a heavy thing rather than tumbling end over end. Inside the hull, never touched.
    const frame = RAPIER.ColliderDesc.cuboid(model.L / 2 - 0.5, 0.45, 1.5).setTranslation(0, 0.75 - model.H / 2, 0).setDensity(6)
    world.createCollider(frame, body)
    bindMesh(body, group)
    return { group, body, collider, model, axles, offset: 0, burning: null, roll: 0, tip: 0 }
  }

  // `at`: `startHead`: join a train that is already running (shared round) at this position.
  // `maxHp`: the HP it was sized to (fair.js), which its HP bar and braking are measured against.
  // `dir`: -1 westbound (from the east tunnel), +1 eastbound.
  function spawn(spec, hp, startHead, maxHp = hp, dir = -1) {
    const head = startHead ?? -dir * (TRACK.mouth + spec.speed * ROUND.approachSeconds)
    const cars = []
    let back = 0 // m from the nose to this car's front, back along the train
    const list = ['loco', ...spec.wagons]
    list.forEach((kind) => {
      const model = modelFor(spec, kind)
      const offset = -dir * (back + model.L / 2)
      const c = makeCar(model, head + offset, dir)
      c.offset = offset
      back += model.L + GAP
      cars.push(c)
    })
    t = { spec, dir, cars, head, length: back, speed: spec.speed, target: spec.speed, hp, maxHp, state: 'run', timer: 0, horned: false, shake: 0, events: [], brake: 0, hitSmoke: 0, grindCd: 0, gougeCd: 0 }
    const loco = cars[0]
    t.smoke = fx.addEmitter({
      rate: 34,
      tick(p, n) {
        if (!t || t.state !== 'run') return false
        p.set(loco.group.position.x - dir * loco.model.stack[0], TRACK.top + loco.model.stack[1], TRACK.z)
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
    // From just ahead of the nose to the tail.
    if (t.dir * (p.x - t.head) > 1 || t.dir * (t.head - p.x) > t.length) return
    launchPlayer(t.dir * t.speed * 0.9, 13, Math.sign(p.z - TRACK.z || 1) * 15)
    sound.body(p.x, p.z)
    fx.dustRing(p.x, p.z, 1.6, 10)
  }

  // A wreck's cars stay coupled, nose to tail, through an impulse at each coupler that pulls its two
  // ends together. Not a Rapier joint: 0.14 panics on the step after a body that had one is removed,
  // however the joint is taken off first, and that kills the world for good.
  function couple(dt) {
    for (let i = 0; i < t.cars.length - 1; i++) {
      const a = t.cars[i].body
      const b = t.cars[i + 1].body
      if (a.isSleeping() && b.isSleeping()) continue
      const pa = couplerPoint(a, t.cars[i].model.L / 2 + GAP / 2, armA)
      const pb = couplerPoint(b, -t.cars[i + 1].model.L / 2 - GAP / 2, armB)
      const va = pointVelocity(a, armA, velA)
      const vb = pointVelocity(b, armB, velB)
      // A long body turns about its centre, so its end feels about a quarter of its mass; two of them, an eighth.
      const k = Math.min(a.mass(), b.mass()) * COUPLER.massShare
      const pull = COUPLER.stiffness / dt
      const impulse = {
        x: k * ((pb.x - pa.x) * pull + vb.x - va.x),
        y: k * ((pb.y - pa.y) * pull + vb.y - va.y),
        z: k * ((pb.z - pa.z) * pull + vb.z - va.z),
      }
      a.applyImpulseAtPoint(impulse, pa, true)
      b.applyImpulseAtPoint({ x: -impulse.x, y: -impulse.y, z: -impulse.z }, pb, true)
    }
  }

  // The first moments on the ground: the locomotive's nose ploughs into the ballast (a drag at its
  // lowest front corner, on the side it is slewing to, which swings it out and dips it while the
  // wagons pile into it), and the cars going over are levered onto their side by the wheels digging in.
  function wreck() {
    const W = ROUND.wreck
    const dt = world.timestep
    if (t.timer > W.ploughSeconds && t.timer > W.tipSeconds) return
    const loco = t.cars[0]
    const v = loco.body.linvel()
    const sp = Math.hypot(v.x, v.z)
    if (t.timer < W.ploughSeconds && sp > 2) {
      const p = couplerPoint(loco.body, -loco.model.L / 2, armA)
      p.y -= 1 // down to the pilot, just above the ground
      p.z += t.side * 1.6
      const k = (loco.body.mass() * W.plough * dt) / sp
      loco.body.applyImpulseAtPoint({ x: -v.x * k, y: 0, z: -v.z * k }, p, true)
    }
    if (t.timer > W.tipSeconds) return
    for (const c of t.cars) {
      if (!c.tip) continue
      const r = c.body.rotation()
      turn.set(r.x, r.y, r.z, r.w)
      if (out.set(0, 1, 0).applyQuaternion(turn).y < W.tipLean) {
        c.tip = 0 // over the tipping point: gravity takes it from here
        continue
      }
      // Torque about the long axis, pointed to +X so that a positive one tips the car toward +Z.
      out.set(1, 0, 0).applyQuaternion(turn)
      if (out.x < 0) out.negate()
      const m = c.body.mass() * 3.4 * W.tip * c.tip * dt // ~ the hull's inertia about its long axis
      c.body.applyTorqueImpulse({ x: out.x * m, y: out.y * m, z: out.z * m }, true)
    }
  }

  function step(dt) {
    if (!t) return
    t.timer += dt
    if (t.state === 'derail') {
      couple(dt)
      wreck()
    }
    if (t.state !== 'run') return
    const shared = hooks.shared?.()
    // Shared round: the server owns speed, hits and HP; the head only eases toward its last report.
    if (!shared) t.speed += Math.sign(t.target - t.speed) * Math.min(Math.abs(t.target - t.speed), 7 * dt)
    t.head += t.dir * t.speed * dt
    if (shared && t.netHead != null) t.head += (t.netHead - t.head) * Math.min(1, 8 * dt)
    const through = t.dir * t.head - t.length > TRACK.mouth + 6 // the tail is inside the far tunnel
    for (const c of t.cars) {
      c.roll += (t.speed * dt) / WHEEL_R
      c.body.setNextKinematicTranslation({ x: t.head + c.offset, y: TRACK.top + c.model.H / 2, z: TRACK.z })
    }
    hitPlayer()
    if (shared) {
      if (through) finish('through')
      return
    }
    let v = hooks.nextVehicle(t.head, t.dir)
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
      v = hooks.nextVehicle(t.head, t.dir)
    }
    if (through) finish('through')
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
    const W = ROUND.wreck
    // Steel on earth, set so any train's wreck grinds to a halt in about W.slide metres (a fast one
    // would otherwise end up in the tunnel); the nose's plough does a share of the braking.
    const friction = Math.min(0.9, Math.max(0.12, (speed * speed / (2 * W.slide) - W.plough * 0.4) / -PHYSICS.gravity))
    t.state = 'derail'
    t.timer = 0
    t.finalSpeed = speed
    t.side = side
    t.cars.forEach((c, i) => {
      c.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
      c.collider.setFriction(friction)
      c.collider.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      const lead = i === 0
      const flip = side * (i % 2 ? -1 : 1) // the wagons jackknife left and right behind it
      const k = lead ? 1 : 0.5 + Math.random() * 0.6
      // Every car keeps the train's momentum along the line: the nose jolts as the wheels climb the
      // rail and swings out, the wagons zigzag; nothing leaves the ground for more than a bump.
      c.body.setLinvel({ x: t.dir * speed * (0.98 + Math.random() * 0.05), y: W.hop * (lead ? 1 : Math.random() * 0.5), z: flip * W.slew * k }, true)
      c.body.setAngvel({ x: 0, y: -t.dir * flip * W.yaw * k, z: 0 }, true)
      c.body.setLinearDamping(W.linearDamping)
      c.body.setAngularDamping(W.angularDamping)
      c.tip = lead || Math.random() < W.tipChance ? flip : 0
    })
    const loco = t.cars[0]
    const nose = loco.group.position.x + (t.dir * loco.model.L) / 2
    explodeAt(nose - t.dir, 3, TRACK.z, 1.5)
    if (!hooks.shared?.()) hooks.onDerail(t) // online shared.js reports it, with the server's pay
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
    for (const c of t.cars) {
      removeBody(c.body)
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
      const noseX = t.cars[0].group.position.x + (t.dir * t.cars[0].model.L) / 2
      const y = TRACK.top + 2.6
      beam.position.set(noseX + t.dir * 0.4, y + 0.5, TRACK.z)
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
    // Ballast and earth thrown up ahead of the ploughing nose.
    const loco = t.cars[0]
    const lv = loco.body.linvel()
    const lsp = Math.hypot(lv.x, lv.z)
    if (carve && lsp > 4) {
      const p = couplerPoint(loco.body, -loco.model.L / 2, armA)
      fx.debris(p.x, 0.4, p.z, 3, ['#6b5a45', '#8a7a66', '#4a4038', '#5c5c60'], 4 + lsp * 0.18, (lv.x / lsp) * 0.9, (lv.z / lsp) * 0.9 + t.side * 0.4, 0.35)
      out.set(p.x, 0.5, p.z)
      fx.puff(out, 2.2, 'dust', 1.8, 1.8, 0.9, lv.x * 0.25, lv.z * 0.25)
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
