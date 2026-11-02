// Procedural locomotion animator, ported from Clean Leaves for Loot (itself from
// +1 Cut Grass Adventure's PlayerAnimator + LocomotionCycle). States idle / run /
// airborne / landing are blended through pose buffers; the walk and run are ONE
// cycle at two depths, its phase advancing with distance travelled so the feet
// stay planted at any speed. Writes only to bones and the avatar root's
// rotation / position.y (the player group owns world placement).
import { Euler, Quaternion, Vector3 } from 'three'
import { ANIM, EMOTE } from '../config.js'
import { BONE_INDEX, PlayerRig, PoseBuffer } from './rig.js'

const TAU = Math.PI * 2
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a, b, t) => a + (b - a) * t
const ease = (t) => t * t * (3 - 2 * t)
const smoothstep = (e0, e1, v) => ease(clamp((v - e0) / (e1 - e0 || 1), 0, 1))
const kneeCurve = (phase) => {
  const raw = Math.sin(phase - Math.PI / 2.6)
  return raw > 0 ? raw * raw : 0
}

const L = ANIM.locomotion
const DEG = Math.PI / 180
const eulerTmp = new Euler()
const quatTmp = new Quaternion()
const handShoulder = new Vector3()
const handElbow = new Vector3()
const handForearm = new Vector3()

export function makeAnimator(root) {
  if (!root) return null
  return new PlayerAnimator(root)
}

export function disposeAnimator(animator) {
  animator?.dispose()
}

class PlayerAnimator {
  constructor(root) {
    this.root = root
    this.rig = new PlayerRig(root)
    this.target = new PoseBuffer()
    this.from = new PoseBuffer()
    this.output = new PoseBuffer()
    this.scratch = new PoseBuffer()
    this.state = 'idle'
    this.stateTime = 0
    this.blendTime = 0
    this.blendDuration = 0
    this.phase = 0
    this.idleTime = 0
    this.airTime = 0
    this.bank = 0
    this.gripW = 0
    this.carryW = 0
    this.overlayPose = new PoseBuffer()
    this.emote = null
  }

  // A platform emote clip { len, loop, tracks: { Bone: [[t, xDeg, yDeg, zDeg], ...] } }: per-bone degree
  // deltas over the bind pose (XYZ euler), smoothstep between keys. Stops on movement or a jump.
  playEmote(clip) {
    if (!clip?.tracks) return
    const tracks = []
    for (const name in clip.tracks) {
      const bone = this.root.nodes?.[name]
      const keys = clip.tracks[name]
      if (!bone || !Array.isArray(keys) || !keys.length) continue
      const bound = this.rig.bindings.find((b) => b.bone === bone)
      tracks.push({ bone, rest: bound ? bound.rest : bone.quaternion.clone(), keys })
    }
    if (!tracks.length) return
    const last = Math.max(...tracks.map((t) => t.keys[t.keys.length - 1][0]))
    this.emote = { clip, tracks, t: 0, w: 0, stopping: false, len: clip.len > 0 ? clip.len : last || 1 }
  }

  stopEmote() {
    if (this.emote) this.emote.stopping = true
  }

  isEmoting() {
    return !!this.emote && !this.emote.stopping
  }

  applyEmote(dt, input) {
    const e = this.emote
    if (!e) return
    if (input.speed > EMOTE.stopSpeed || !input.grounded || (input.bench?.w ?? 0) > 0.05) e.stopping = true
    e.t += dt
    if (!e.clip.loop && e.t >= e.len) e.stopping = true
    e.w = clamp(e.w + ((e.stopping ? -1 : 1) * dt) / EMOTE.fade, 0, 1)
    if (e.stopping && e.w <= 0) {
      this.emote = null
      return
    }
    const time = e.clip.loop ? e.t % e.len : Math.min(e.t, e.len)
    for (const tr of e.tracks) {
      const k = tr.keys
      let i = 0
      while (i < k.length - 1 && k[i + 1][0] <= time) i++
      const a = k[i]
      const b = k[Math.min(i + 1, k.length - 1)]
      const f = b[0] > a[0] ? ease(clamp((time - a[0]) / (b[0] - a[0]), 0, 1)) : 0
      eulerTmp.set(lerp(a[1], b[1], f) * DEG, lerp(a[2], b[2], f) * DEG, lerp(a[3], b[3], f) * DEG, 'XYZ')
      quatTmp.setFromEuler(eulerTmp)
      quatTmp.premultiply(tr.rest) // rest * delta
      // Blend from the procedural pose already on the bone.
      tr.bone.quaternion.slerp(quatTmp, e.w)
    }
  }

  // Writes the world point midway between the two palms into `out` (a Vector3) and returns true.
  // The palm is the elbow plus the forearm, taken as `reach` times the upper arm in the same direction.
  // False when the rig has no arms to measure (the procedural fallback has no elbows).
  handAnchor(out, reach = 1) {
    const n = this.root.nodes
    if (!n?.ArmL1 || !n.ArmL2 || !n.ArmR1 || !n.ArmR2) return false
    out.set(0, 0, 0)
    for (const side of ['L', 'R']) {
      n[`Arm${side}1`].getWorldPosition(handShoulder)
      n[`Arm${side}2`].getWorldPosition(handElbow)
      handForearm.subVectors(handElbow, handShoulder).multiplyScalar(reach)
      out.add(handElbow.add(handForearm))
    }
    out.multiplyScalar(0.5)
    return true
  }

  dispose() {
    this.rig.resetToBindPose()
    this.root.rotation.set(0, 0, 0)
    this.root.position.y = 0
  }

  // input: { grounded, speed, verticalVelocity, turn (-1..1), load: { grip, carry, toss }, bench: { w, rep } }
  update(dt, input) {
    if (!(dt > 0)) return
    this.stateTime += dt
    this.resolveState(dt, input)
    this.writePose(dt, input)
    this.blend(dt)
    this.applyLoad(dt, input)
    this.applyBench(input)
    this.rig.applyPose(this.output)
    this.applyEmote(dt, input)
    this.applyVisual(dt, input)
  }

  resolveState(dt, input) {
    if (!input.grounded) {
      // Ignore the few frames of a step down a ledge; only a real drop is airborne.
      this.airTime += dt
      if (this.airTime > ANIM.airborneDelay) this.setState('airborne', ANIM.transitions.toAirborne)
      return
    }
    this.airTime = 0
    if (this.state === 'airborne') {
      this.setState('landing', ANIM.transitions.toLanding)
      return
    }
    if (this.state === 'landing' && this.stateTime < ANIM.landing.duration) return
    this.setState(input.speed < L.idleSpeed ? 'idle' : 'run', ANIM.transitions.toLocomotion)
  }

  setState(next, duration) {
    if (next === this.state) return
    this.from.copyFrom(this.output)
    this.state = next
    this.stateTime = 0
    this.blendTime = 0
    this.blendDuration = duration
  }

  writePose(dt, input) {
    const t = this.target
    switch (this.state) {
      case 'idle': {
        // Ease the stride back to a neutral standing phase.
        const goal = this.phase > Math.PI ? TAU : 0
        this.phase += (goal - this.phase) * (1 - Math.exp(-8 * dt))
        if (this.phase >= TAU - 1e-4) this.phase = 0
        this.idleTime += dt
        const breath = Math.sin(this.idleTime * ANIM.idle.breathFrequency * TAU)
        t.applyDefinition(ANIM.idle.basePose)
        t.add('Spine1', breath * ANIM.idle.breathAmount)
        t.add('Neck1', -breath * ANIM.idle.breathAmount * 0.6)
        t.bobY = breath * ANIM.idle.breathBob
        break
      }
      case 'run': {
        const frequency = clamp(input.speed / L.strideDistance, L.minFrequency, L.maxFrequency)
        this.phase = (this.phase + frequency * TAU * dt) % TAU
        this.writeLocomotion(t, input.speed)
        break
      }
      case 'airborne': {
        const rising = clamp(input.verticalVelocity / ANIM.airborne.velocityReference, -1, 1)
        t.applyDefinition(ANIM.airborne.fall)
        this.scratch.applyDefinition(ANIM.airborne.rise)
        t.lerpBetween(t, this.scratch, clamp(0.5 + rising * 0.5, 0, 1))
        t.bobY = 0
        break
      }
      case 'landing': {
        const depth = 1 - ease(clamp(this.stateTime / ANIM.landing.duration, 0, 1))
        t.applyDefinition(ANIM.landing.pose, depth)
        t.bobY = ANIM.landing.bobY * depth
        break
      }
    }
  }

  // One cycle at two depths (walk -> run), derived from actual speed.
  writeLocomotion(out, speed) {
    const run = smoothstep(L.walkSpeed, L.runSpeed, speed)
    const sprint = smoothstep(L.runSpeed, L.sprintSpeed, speed) * 0.4
    const depth = (d) => lerp(lerp(d.walk, d.run, run), d.sprint, sprint)
    const phase = this.phase
    const swing = Math.sin(phase)
    const opposite = -swing
    const hip = depth(L.hipSwing)
    const knee = depth(L.kneeBend)
    const arm = depth(L.armSwing)
    const elbow = depth(L.elbowBend)
    const twist = depth(L.torsoTwist)
    const lean = depth(L.torsoLean)
    const headTwist = depth(L.headCounterTwist)
    const roll = depth(L.torsoRoll)
    const bob = depth(L.bob)

    out.reset()
    // Thighs half a cycle apart; the stride is pushed back more than forward at speed.
    const back = 1 + sprint * 0.35
    out.set('LegL1', hip * (swing > 0 ? swing : swing * back))
    out.set('LegR1', hip * (opposite > 0 ? opposite : opposite * back))
    out.set('LegL2', knee * kneeCurve(phase))
    out.set('LegR2', knee * kneeCurve(phase + Math.PI))
    // Arms counter-swing against the leg on the same side.
    out.set('ArmL1', arm * opposite - sprint * 0.25, 0, sprint * 0.12)
    out.set('ArmR1', arm * swing - sprint * 0.25, 0, -sprint * 0.12)
    out.set('ArmL2', elbow + elbow * 0.35 * Math.max(0, opposite))
    out.set('ArmR2', elbow + elbow * 0.35 * Math.max(0, swing))
    // Torso leans in, twists with the stride and rolls on the footfall.
    out.set('Spine1', lean, twist * opposite, roll * Math.sin(phase * 2))
    out.set('Spine2', lean * 0.4, twist * 0.5 * opposite, 0)
    out.set('Neck1', -lean * 0.7, headTwist * swing, 0)
    out.bobY = -bob * Math.cos(phase * 2)
  }

  blend(dt) {
    if (this.blendDuration > 0) {
      this.blendTime += dt
      const t = clamp(this.blendTime / this.blendDuration, 0, 1)
      this.output.lerpBetween(this.from, this.target, ease(t))
      if (t >= 1) this.blendDuration = 0
    } else {
      this.output.copyFrom(this.target)
    }
  }

  // Vehicle work laid over the locomotion pose: the squat and tremble of a hold-E grab,
  // the arms locked overhead while carrying, and the follow-through of a toss.
  applyLoad(dt, input) {
    const load = input.load
    const G = ANIM.grip
    const C = ANIM.carry
    const gripping = (load?.grip ?? 0) > 0 ? 1 : 0
    this.gripW += (gripping - this.gripW) * (1 - Math.exp(-G.rate * dt))
    this.carryW += ((load?.carry ?? 0) - this.carryW) * (1 - Math.exp(-C.rate * dt))
    const o = this.output
    const p = this.overlayPose
    if (this.carryW > 0.002) {
      p.applyDefinition(C.pose)
      const swing = Math.sin(this.phase) * C.sway * clamp(input.speed / 6, 0, 1)
      p.add('ArmL1', swing)
      p.add('ArmR1', -swing)
      for (const bone of ['ArmL1', 'ArmL2', 'ArmR1', 'ArmR2', 'Spine1', 'Spine2', 'Neck1']) this.mixBone(bone, p, this.carryW)
    }
    const toss = load?.toss ?? 0
    if (toss > 0.002) {
      p.applyDefinition(ANIM.toss.pose)
      const k = Math.sin(toss * Math.PI)
      for (const bone of ['ArmL1', 'ArmL2', 'ArmR1', 'ArmR2', 'Spine1', 'Spine2']) this.mixBone(bone, p, k)
    }
    if (this.gripW > 0.002) {
      const strain = load?.grip ?? 0
      p.applyDefinition(G.pose)
      const t = performance.now() * 0.05
      p.add('ArmL1', Math.sin(t) * G.tremble * strain)
      p.add('ArmR1', Math.sin(t + 1) * G.tremble * strain)
      p.add('Spine1', Math.sin(t * 0.7) * G.tremble * 0.5 * strain)
      // Drive up out of the squat as the hold fills.
      const rise = 1 - strain * 0.35
      for (let i = 0; i < p.rotations.length; i++) o.rotations[i] += (p.rotations[i] * rise - o.rotations[i]) * this.gripW
      o.bobY += (G.bobY * rise - o.bobY) * this.gripW
    }
  }

  // On the bench the whole pose is the press; w blends in as the body lies back.
  applyBench(input) {
    const w = input.bench?.w ?? 0
    if (w <= 0.002) return
    const p = this.overlayPose
    const top = this.scratch
    p.applyDefinition(ANIM.bench.bottom)
    top.applyDefinition(ANIM.bench.top)
    p.lerpBetween(p, top, input.bench.rep)
    const o = this.output
    for (let i = 0; i < p.rotations.length; i++) o.rotations[i] += (p.rotations[i] - o.rotations[i]) * w
    o.bobY *= 1 - w
  }

  mixBone(bone, pose, w) {
    const at = BONE_INDEX[bone] * 3
    const a = this.output.rotations
    const b = pose.rotations
    for (let i = 0; i < 3; i++) a[at + i] += (b[at + i] - a[at + i]) * w
  }

  applyVisual(dt, input) {
    const wantBank = this.state === 'run' ? -input.turn * L.bankAngle * 0.6 : 0
    this.bank += (wantBank - this.bank) * (1 - Math.exp(-L.bankRate * dt))
    this.root.rotation.set(0, 0, this.bank)
    this.root.position.y = this.output.bobY
  }
}
