import { Color, CylinderGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import { COINS } from './config.js'
import { upgradeValue } from './progress.js'
import { player } from './player.js'

// Gold coins that burst out of the smashed vehicles when a train derails or gets through and
// hover by the rail until the player walks through them.
const m = new Matrix4()
const p = new Vector3()
const q = new Quaternion()
const s = new Vector3()
const X = new Vector3(1, 0, 0)
const q2 = new Quaternion().setFromAxisAngle(X, Math.PI / 2)

export function createCoins(scene, fx, sound, onCollect) {
  const geo = new CylinderGeometry(0.42, 0.42, 0.1, 18)
  const mesh = new InstancedMesh(geo, new MeshStandardMaterial({ color: '#ffc21f', metalness: 0.85, roughness: 0.3, emissive: new Color('#a06400'), emissiveIntensity: 0.35 }), COINS.max)
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.castShadow = true
  mesh.frustumCulled = false
  scene.add(mesh)
  m.makeScale(0, 0, 0)
  for (let i = 0; i < COINS.max; i++) mesh.setMatrixAt(i, m)
  const coins = Array.from({ length: COINS.max }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hover: 1, phase: 0, life: 0, value: 0, settled: false }))
  let head = 0

  function spawn(x, z, value) {
    const n = COINS.perCluster
    const each = Math.ceil(value / n)
    for (let i = 0; i < n; i++) {
      const c = coins[head]
      head = (head + 1) % coins.length
      Object.assign(c, {
        on: true,
        x,
        y: 1.2,
        z: z + 1,
        vx: (Math.random() - 0.5) * 8,
        vy: 6 + Math.random() * 6,
        vz: 2 + Math.random() * 9,
        hover: 0.9 + Math.random() * 0.9,
        phase: Math.random() * 6,
        life: COINS.life,
        value: each,
        settled: false,
      })
    }
    sound.coinFall(x, z)
  }

  let chain = 0
  let chainT = 0
  function update(dt, elapsed) {
    chainT -= dt
    if (chainT <= 0) chain = 0
    let dirty = false
    const px = player.position.x
    const py = player.position.y + 1
    const pz = player.position.z
    const reach = upgradeValue('magnet') * COINS.magnetScale
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i]
      if (!c.on) continue
      dirty = true
      c.life -= dt
      if (!c.settled) {
        c.vy -= 22 * dt
        c.x += c.vx * dt
        c.y += c.vy * dt
        c.z += c.vz * dt
        if (c.y < c.hover && c.vy < 0) {
          c.y = c.hover
          c.settled = true
        }
      }
      const dx = px - c.x
      const dy = py - c.y
      const dz = pz - c.z
      const d = Math.hypot(dx, dy, dz)
      if (d < reach) {
        const pull = (1 - d / reach) * 34 * dt + 3 * dt
        c.x += dx * pull
        c.y += dy * pull
        c.z += dz * pull
        c.settled = true
      }
      if (d < COINS.pickup || c.life <= 0) {
        if (c.life > 0) {
          chain = Math.min(chain + 1, 14)
          chainT = 0.8
          sound.coin(1 + chain * 0.04)
          fx.sparkle({ x: c.x, y: c.y, z: c.z }, 'gold', 0.5)
          onCollect(c.value)
        }
        c.on = false
        m.makeScale(0, 0, 0)
        mesh.setMatrixAt(i, m)
        continue
      }
      const bob = c.settled ? Math.sin(elapsed * 2.6 + c.phase) * 0.14 : 0
      q.setFromAxisAngle(X.set(0, 1, 0), elapsed * 3 + c.phase).multiply(q2)
      X.set(1, 0, 0)
      const fade = Math.min(1, c.life / 0.4)
      m.compose(p.set(c.x, c.y + bob, c.z), q, s.setScalar(fade))
      mesh.setMatrixAt(i, m)
    }
    if (dirty) mesh.instanceMatrix.needsUpdate = true
  }

  return { spawn, update }
}
