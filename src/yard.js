import { CanvasTexture, Group, Mesh, MeshStandardMaterial, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three'
import { PLAYER_DIMS, TRACK, VARIANTS, YARD } from './config.js'
import { RAPIER, addFixed, world } from './physics.js'
import { lockedMaterial, makeOutline, makeVehicle, sharedMaterial, variantMaterial, vehicleModel } from './vehicles.js'
import { compact, state as progress, upgradeValue } from './progress.js'
import { WALK_BASE } from './config.js'
import { player } from './player.js'
import { fontReady } from './propkit.js'

// The Vehicle Yard and everything the player does with a vehicle: the bays and their
// labels, hold-E to grab (only with enough Strength), the press overhead, carrying,
// parking on the rail, dropping it anywhere else, and the bay's hologram until a
// new one appears. One vehicle at a time for now.

const NOSE_NORTH = Math.PI / 2
const yawTo = (dx, dz) => Math.atan2(dx, dz)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const ease = (t) => t * t * (3 - 2 * t)

export function drawBicep(ctx, x, y, s) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.lineJoin = 'round'
  ctx.lineWidth = 10
  ctx.strokeStyle = '#3b1a00'
  const g = ctx.createLinearGradient(0, -48, 0, 48)
  g.addColorStop(0, '#ffc22e')
  g.addColorStop(1, '#ff7a12')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(-48, 44)
  ctx.quadraticCurveTo(-60, 0, -40, -38)
  ctx.quadraticCurveTo(-22, -56, -6, -44)
  ctx.quadraticCurveTo(10, -32, -4, -18)
  ctx.quadraticCurveTo(-20, -8, -14, 6)
  ctx.quadraticCurveTo(10, -14, 36, 2)
  ctx.quadraticCurveTo(58, 22, 36, 42)
  ctx.quadraticCurveTo(-4, 54, -48, 44)
  ctx.closePath()
  ctx.stroke()
  ctx.fill()
  ctx.restore()
}

// "X1.5 / bicep 150 / GOLDEN" or "bicep 125K / REQUIRED", as a sprite over the bay.
function bayLabel(cfg, liftable) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 340
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  sprite.scale.set(5.4, 3.6, 1)
  const v = VARIANTS[cfg.variant ?? 'normal']
  const text = (ctx, s, x, y, size, fill, outline = '#16100a') => {
    ctx.font = `700 ${size}px Fredoka, "Arial Black", sans-serif`
    ctx.lineJoin = 'round'
    ctx.lineWidth = size * 0.2
    ctx.strokeStyle = outline
    ctx.strokeText(s, x, y)
    if (Array.isArray(fill)) {
      const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2)
      g.addColorStop(0.1, fill[0])
      g.addColorStop(0.9, fill[1])
      ctx.fillStyle = g
    } else ctx.fillStyle = fill
    ctx.fillText(s, x, y)
  }
  const draw = (canLift) => {
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, 512, 340)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const value = compact(cfg.req)
    if (v.mult > 1) text(ctx, `X${v.mult}`, 256, 60, 92, v.labelColor)
    ctx.textAlign = 'left'
    ctx.font = '700 96px Fredoka, "Arial Black", sans-serif'
    const w = ctx.measureText(value).width
    const left = 256 - (w + 92) / 2
    drawBicep(ctx, left + 36, 168, 0.68)
    text(ctx, value, left + 92, 170, 96, ['#ffe36b', '#ffb020'])
    ctx.textAlign = 'center'
    if (!canLift) text(ctx, 'REQUIRED', 256, 268, 60, '#ffffff')
    else if (v.label) text(ctx, v.label, 256, 268, 66, v.labelColor)
    tex.needsUpdate = true
  }
  draw(liftable)
  fontReady.then(() => draw(sprite.userData.canLift))
  sprite.userData.canLift = liftable
  sprite.userData.draw = draw
  return sprite
}

function respawnLabel() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 220
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  sprite.scale.set(5.2, 2.2, 1)
  let shown = -1
  sprite.userData.set = (secs) => {
    if (secs === shown) return
    shown = secs
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, 512, 220)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.font = '700 84px Fredoka, "Arial Black", sans-serif'
    ctx.lineWidth = 16
    ctx.strokeStyle = '#2b1500'
    const g = ctx.createLinearGradient(0, 16, 0, 96)
    g.addColorStop(0, '#ffe36b')
    g.addColorStop(1, '#ffa71e')
    ctx.fillStyle = g
    ctx.strokeText(`${secs}s`, 256, 62)
    ctx.fillText(`${secs}s`, 256, 62)
    ctx.font = '700 56px Fredoka, "Arial Black", sans-serif'
    ctx.lineWidth = 12
    ctx.strokeStyle = '#0b0b12'
    ctx.fillStyle = '#ffffff'
    ctx.strokeText('RESPAWNING IN:', 256, 164)
    ctx.fillText('RESPAWNING IN:', 256, 164)
    tex.needsUpdate = true
  }
  return sprite
}

const ghostMat = new MeshStandardMaterial({ color: '#a6ffd8', transparent: true, opacity: 0.26, roughness: 0.3, metalness: 0.2, emissive: '#5fffc0', emissiveIntensity: 0.3, depthWrite: false })

export function createYard(scene, fx, sound, rail, hud, interact) {
  const bays = []
  const root = new Group()
  scene.add(root)
  const respawnSprites = new Map()

  const liftable = (b) => progress.power >= b.cfg.req
  const hpOf = (cfg) => cfg.req * VARIANTS[cfg.variant ?? 'normal'].mult
  const materialFor = (b) => {
    if (!liftable(b)) return lockedMaterial()
    return b.cfg.variant ? variantMaterial(b.cfg.variant) : sharedMaterial()
  }

  function collider(b) {
    const { model } = b
    const half = Math.min(0.75, model.hy)
    b.collider = addFixed(RAPIER.ColliderDesc.cuboid(model.hz, half, model.hx * 0.92), { x: b.x, y: half, z: b.z })
  }

  function stock(b) {
    const v = makeVehicle(b.model, materialFor(b))
    v.root.position.set(b.x, b.model.cy, b.z)
    v.root.rotation.y = NOSE_NORTH
    root.add(v.root)
    b.vehicle = v
    b.state = 'ready'
    b.timer = 0
    b.pop = 1
    b.label.visible = true
    collider(b)
    const variant = VARIANTS[b.cfg.variant ?? 'normal']
    if (variant.flame) {
      const kind = b.cfg.variant === 'golden' ? 'gold' : 'emerald'
      b.flame = fx.addEmitter({
        rate: 26,
        tick(p, n) {
          if (b.vehicle !== v || !liftable(b)) return
          for (let i = 0; i < n; i++) {
            p.set(b.x + (Math.random() - 0.5) * 2.2, 0.5 + Math.random() * 0.6, b.z + (Math.random() - 0.5) * 4.6)
            fx.flame(p, 0.7, kind, 2.6, 0.7)
          }
        },
      })
    }
  }

  for (const row of YARD.rows) {
    row.bays.forEach((cfg, i) => {
      const b = { cfg, x: row.x - i * row.step, z: row.z, model: vehicleModel(cfg.type, cfg.paint), state: 'ready', timer: 0, vehicle: null, ghost: null, collider: null, flame: null, pop: 0 }
      b.label = bayLabel(cfg, liftable(b))
      b.label.position.set(b.x, b.model.H + 2.5, b.z)
      root.add(b.label)
      stock(b)
      b.pop = 0
      bays.push(b)
    })
  }

  // Strength changes redraw the bays it unlocks.
  let shownPower = progress.power
  function refresh() {
    shownPower = progress.power
    for (const b of bays) {
      const can = liftable(b)
      if (b.label.userData.canLift === can) continue
      b.label.userData.canLift = can
      b.label.userData.draw(can)
      if (b.vehicle) b.vehicle.mesh.material = materialFor(b)
    }
  }

  // --- The vehicle in the player's hands -------------------------------------------------
  const held = { bay: null, vehicle: null, stage: 'none', t: 0, spec: null, from: new Vector3(), outline: null }
  const anim = { grip: 0, carry: 0, toss: 0 }
  let hold = 0 // 0..1 of the E hold
  let target = null // what the prompt points at
  let tossT = 0
  let strainCd = 0
  const headY = () => PLAYER_DIMS.height + YARD.headClear

  const carrying = () => held.stage !== 'none'

  function grab(b) {
    if (b.flame) fx.removeEmitter(b.flame)
    b.flame = null
    world.removeCollider(b.collider, true)
    b.collider = null
    const v = b.vehicle
    b.vehicle = null
    b.state = 'respawn'
    b.timer = YARD.respawnSeconds
    b.label.visible = false
    b.ghost = new Mesh(b.model.geometry, ghostMat)
    b.ghost.position.set(b.x, 0, b.z)
    b.ghost.rotation.y = NOSE_NORTH
    root.add(b.ghost)
    let sprite = respawnSprites.get(b)
    if (!sprite) {
      sprite = respawnLabel()
      sprite.position.set(b.x, b.model.H + 1.6, b.z)
      root.add(sprite)
      respawnSprites.set(b, sprite)
    }
    sprite.visible = true
    sprite.userData.set(YARD.respawnSeconds)

    held.bay = b
    held.vehicle = v
    held.spec = { type: b.cfg.type, paint: b.cfg.paint, variant: b.cfg.variant ?? 'normal', hp: hpOf(b.cfg) }
    held.stage = 'lifting'
    held.t = 0
    held.from.copy(v.root.position)
    root.remove(v.root)
    scene.add(v.root)
    held.outline = makeOutline(b.model)
    v.root.add(held.outline)
    sound.liftSnatch(b.x, b.z)
    fx.dustRing(b.x, b.z, 3, 14, 'dust')
    hud.showDrop(true)
  }

  function releaseHeld() {
    const v = held.vehicle
    v.root.remove(held.outline)
    scene.remove(v.root)
    const p = v.root.position.clone()
    Object.assign(held, { bay: null, vehicle: null, stage: 'none', t: 0, spec: null, outline: null })
    tossT = 1
    hud.showDrop(false)
    return p
  }

  function railTargetX() {
    return clamp(player.position.x, -TRACK.placeHalf, TRACK.placeHalf)
  }
  const nearRail = () => Math.abs(player.position.z - TRACK.z) < TRACK.placeReach

  function parkOnRail() {
    if (held.stage !== 'carrying') return
    const spec = held.spec
    const from = releaseHeld()
    rail.park(spec, from, railTargetX())
    sound.toss(from.x, from.z)
    interact.reset()
  }

  // DROP CAR: onto the rail when it is in reach, anywhere else the vehicle is lost back to the yard.
  function drop() {
    if (held.stage !== 'carrying') return
    if (nearRail() && rail.count() < hud.railCap()) return parkOnRail()
    const spec = held.spec
    const from = releaseHeld()
    rail.dropAway(spec, from, Math.sin(player.facing) * 6, Math.cos(player.facing) * 6)
    sound.toss(from.x, from.z)
  }

  function nearestBay() {
    let best = null
    let bestD = YARD.grabReach
    const p = player.position
    for (const b of bays) {
      if (b.state !== 'ready') continue
      const d = Math.max(Math.hypot(p.x - b.x, p.z - b.z) - b.model.hx * 0.5, 0)
      if (d < bestD) {
        bestD = d
        best = b
      }
    }
    return best
  }

  function updateHeld(dt) {
    const v = held.vehicle
    if (!v) return
    held.t += dt
    const f = player.facing
    const p = player.renderPosition
    const s = YARD.carryScale
    const overhead = p.y + headY() + v.model.hy * s
    if (held.stage === 'lifting') {
      const k = ease(clamp(held.t / 0.5, 0, 1))
      v.root.position.set(held.from.x + (p.x - held.from.x) * k, held.from.y + (overhead - held.from.y) * k + Math.sin(k * Math.PI) * 0.7, held.from.z + (p.z - held.from.z) * k)
      v.root.rotation.y = NOSE_NORTH + (((f - NOSE_NORTH + Math.PI) % (Math.PI * 2)) - Math.PI) * k
      const size = 1 + (s - 1) * k
      v.root.scale.setScalar(size)
      if (held.t >= 0.5) {
        held.stage = 'carrying'
        sound.liftSet(p.x, p.z)
      }
      return
    }
    const speed = Math.hypot(player.velocity.x, player.velocity.z)
    const sway = Math.sin(performance.now() * 0.009) * Math.min(1, speed / 8)
    v.root.position.set(p.x, overhead + Math.abs(sway) * 0.1, p.z)
    v.root.rotation.set(0, f, sway * 0.06)
  }

  // extra: what else E could act on here (a bench, the chest), offered when no vehicle is.
  function update(dt, elapsed, canInteract, extra, carryExtra) {
    if (progress.power !== shownPower) refresh()

    for (const b of bays) {
      if (b.state === 'respawn') {
        b.timer -= dt
        respawnSprites.get(b).userData.set(Math.max(1, Math.ceil(b.timer)))
        if (b.ghost) b.ghost.material.opacity = 0.22 + Math.sin(elapsed * 4) * 0.05
        if (b.timer <= 0) {
          root.remove(b.ghost)
          b.ghost = null
          respawnSprites.get(b).visible = false
          stock(b)
          sound.vehicleSpawn(b.x, b.z)
          for (let i = 0; i < 20; i++) fx.sparkle({ x: b.x, y: 1, z: b.z }, 'gold', 2.4)
        }
      }
      if (b.pop > 0 && b.vehicle) {
        b.pop = Math.max(0, b.pop - dt * 3.4)
        b.vehicle.root.scale.setScalar(1 - b.pop * b.pop * 0.8 + Math.sin(b.pop * 9) * b.pop * 0.1)
      }
    }

    for (const b of bays) {
      const near = Math.hypot(player.position.x - b.x, player.position.z - b.z) < YARD.labelReach
      if (b.state === 'ready') b.label.visible = near
    }

    // What E would act on right now.
    let want = null
    if (canInteract) {
      if (held.stage === 'carrying') {
        if (nearRail() && rail.count() < hud.railCap()) want = { kind: 'park', x: railTargetX(), y: TRACK.top + 2.6, z: TRACK.z, text: 'Park' }
        else want = carryExtra?.() ?? null
      } else if (held.stage === 'none') {
        const b = nearestBay()
        if (b && liftable(b)) want = { kind: 'grab', bay: b, x: b.x, y: b.model.H * 0.6 + 0.6, z: b.z, text: 'Grab' }
        else want = extra?.() ?? null
      }
    }
    const same = want && target && want.kind === target.kind && want.bay === target.bay
    if (!same) hold = 0
    target = want
    if (target) {
      const down = interact.down()
      if (down) hold = target.instant ? 1 : Math.min(1, hold + dt / YARD.holdSeconds)
      else hold = Math.max(0, hold - dt * 3)
      hud.showPrompt(target, hold)
      if (down && target.kind === 'grab') {
        player.facing = yawTo(target.bay.x - player.position.x, target.bay.z - player.position.z)
        strainCd -= dt
        if (strainCd <= 0) {
          strainCd = 0.42
          sound.strain(hold, target.bay.x, target.bay.z)
        }
        if (target.bay.vehicle) {
          // The car rises a little on its springs as the grip tightens.
          const lift = hold * hold * 0.34
          target.bay.vehicle.root.position.y = target.bay.model.cy + lift
          target.bay.vehicle.root.rotation.z = Math.sin(elapsed * 40) * 0.006 * hold
        }
      } else if (target.kind === 'grab' && target.bay.vehicle) {
        target.bay.vehicle.root.position.y = target.bay.model.cy
        target.bay.vehicle.root.rotation.z = 0
      }
      if (hold >= 1) {
        hold = 0
        interact.reset()
        if (target.kind === 'grab') grab(target.bay)
        else if (target.act) target.act()
        else parkOnRail()
        target = null
        hud.showPrompt(null, 0)
      }
    } else {
      hud.showPrompt(null, 0)
    }

    updateHeld(dt)

    anim.grip = target?.kind === 'grab' && interact.down() ? hold : 0
    anim.carry = held.stage === 'carrying' || held.stage === 'lifting' ? 1 : 0
    if (tossT > 0) tossT = Math.max(0, tossT - dt * 2.6)
    anim.toss = tossT
    player.speedScale = (carrying() ? YARD.carrySpeed : 1) * (upgradeValue('walkspeed') / WALK_BASE)
  }

  // Hands the carried vehicle over (the Fuse Machine eats it): its spec, or null.
  function takeHeld() {
    if (held.stage !== 'carrying') return null
    const spec = held.spec
    releaseHeld()
    return spec
  }

  // The vehicle in the hands (type, paint, variant) for the others to draw, or null.
  const heldSpec = () => (held.spec ? { type: held.spec.type, paint: held.spec.paint, variant: held.spec.variant } : null)
  return { update, drop, carrying, takeHeld, anim, bays, heldSpec }
}
