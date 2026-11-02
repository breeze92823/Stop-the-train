import { BufferGeometry, Color, Float32BufferAttribute } from 'three'

// Greedy-free voxel mesher: one quad per exposed block face, so a big terrain is a
// single mesh per material. Face UVs are world metres (the texture's `repeat` sets
// its scale), so bricks line up across blocks.
//
// opts: nx, ny, nz (grid), cell [sx, sy, sz] (m), origin [x, y, z],
//   solid(i, j, k) -> bool
//   paint(i, j, k, face, band) -> { mat, color } (face: 'top' | 'side' | 'bottom';
//   band: 'cap' for the thin strip split off the top of a side face, else 'body')
//   cap: m of each exposed side split off as the 'cap' band
//   materials: how many material slots paint() may use
const FACES = [
  { n: [1, 0, 0], kind: 'side', c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], kind: 'side', c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 0, 1], kind: 'side', c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], kind: 'side', c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { n: [0, 1, 0], kind: 'top', c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], kind: 'bottom', c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
]

export function buildVoxels({ nx, ny, nz, cell, origin, solid, paint, cap = 0, materials = 1 }) {
  const [sx, sy, sz] = cell
  const [ox, oy, oz] = origin
  const out = Array.from({ length: materials }, () => ({ pos: [], norm: [], uv: [], col: [] }))
  const tint = new Color()

  const quad = (bucket, face, i, j, k, y0, y1, color) => {
    tint.set(color)
    const [nxv, nyv, nzv] = face.n
    const verts = face.c.map(([cx, cy, cz]) => {
      const x = ox + (i + cx) * sx
      const z = oz + (k + cz) * sz
      const y = cy ? y1 : y0
      return [x, y, z]
    })
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      const [x, y, z] = verts[idx]
      bucket.pos.push(x, y, z)
      bucket.norm.push(nxv, nyv, nzv)
      bucket.col.push(tint.r, tint.g, tint.b)
      if (face.kind !== 'side') bucket.uv.push(x, z)
      else bucket.uv.push(nxv !== 0 ? z : x, y)
    }
  }

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!solid(i, j, k)) continue
        const y0 = oy + j * sy
        const y1 = y0 + sy
        for (const face of FACES) {
          const [dx, dy, dz] = face.n
          if (dy < 0 && j === 0) continue
          const ni = i + dx
          const nj = j + dy
          const nk = k + dz
          const inside = ni >= 0 && nj >= 0 && nk >= 0 && ni < nx && nj < ny && nk < nz
          if (inside && solid(ni, nj, nk)) continue
          if (face.kind === 'side' && cap > 0 && !(j + 1 < ny && solid(i, j + 1, k))) {
            const a = paint(i, j, k, 'side', 'cap', dx, dz)
            const b = paint(i, j, k, 'side', 'body', dx, dz)
            quad(out[a.mat], face, i, j, k, y1 - cap, y1, a.color)
            quad(out[b.mat], face, i, j, k, y0, y1 - cap, b.color)
          } else {
            const p = paint(i, j, k, face.kind, 'body', dx, dz)
            quad(out[p.mat], face, i, j, k, y0, y1, p.color)
          }
        }
      }
    }
  }

  return out.map((b) => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(b.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(b.norm, 3))
    g.setAttribute('uv', new Float32BufferAttribute(b.uv, 2))
    g.setAttribute('color', new Float32BufferAttribute(b.col, 3))
    return g
  })
}
