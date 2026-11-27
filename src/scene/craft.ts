import * as THREE from 'three'

const white = new THREE.MeshStandardMaterial({ color: '#e7eef6', metalness: 0.72, roughness: 0.32 })
const alum = new THREE.MeshStandardMaterial({ color: '#c5ced8', metalness: 0.86, roughness: 0.28 })
const dark = new THREE.MeshStandardMaterial({ color: '#1c2430', metalness: 0.5, roughness: 0.45 })
const gold = new THREE.MeshStandardMaterial({ color: '#e0b45a', metalness: 1, roughness: 0.22, emissive: '#8a5a12', emissiveIntensity: 0.55 })
const kapton = new THREE.MeshStandardMaterial({ color: '#c47b32', metalness: 0.45, roughness: 0.38 })
const radiator = new THREE.MeshStandardMaterial({ color: '#f4f7fb', metalness: 0.25, roughness: 0.4 })
const glass = new THREE.MeshStandardMaterial({ color: '#9ec9ff', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.45, emissive: '#12304a', emissiveIntensity: 0.4 })
const purple = new THREE.MeshStandardMaterial({ color: '#b9a6d6', metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide })
const silver = new THREE.MeshStandardMaterial({ color: '#d5dbe3', metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide })

function solarTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#16315f'
  g.fillRect(0, 0, 256, 128)
  g.strokeStyle = '#d7b16a'
  g.lineWidth = 2
  for (let x = 0; x <= 256; x += 16) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, 128)
    g.stroke()
  }
  for (let y = 0; y <= 128; y += 16) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(256, y)
    g.stroke()
  }
  g.strokeStyle = '#8eb4ff'
  g.strokeRect(2, 2, 252, 124)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const solarMat = new THREE.MeshStandardMaterial({
  map: solarTex(),
  metalness: 0.65,
  roughness: 0.28,
  emissive: '#0a1a33',
  emissiveIntensity: 0.25,
  side: THREE.DoubleSide,
})

function box(w: number, h: number, d: number, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.castShadow = false
  parent.add(m)
  return m
}

function cyl(r: number, len: number, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, axis: 'x' | 'y' | 'z' = 'z'): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24), mat)
  if (axis === 'x') m.rotation.z = Math.PI / 2
  if (axis === 'z') m.rotation.x = Math.PI / 2
  m.position.set(x, y, z)
  parent.add(m)
  return m
}

function light(color: string, parent: THREE.Object3D, x: number, y: number, z: number): void {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshStandardMaterial({ color: '#000', emissive: color, emissiveIntensity: 6, roughness: 1 }),
  )
  m.position.set(x, y, z)
  parent.add(m)
}

export function buildISS(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'iss'
  box(108, 1.6, 1.7, alum, g)
  for (const x of [-48, -36, -18, 18, 36, 48]) box(1.2, 2.4, 2.4, white, g, x, 0, 0)
  box(70, 0.15, 3.2, radiator, g, 0, 0.2, 2.4)
  box(70, 0.15, 3.2, radiator, g, 0, 0.2, -2.4)
  const mods: [number, number, number, number, number][] = [
    [2.1, 13, 0, 0, -18],
    [2.05, 12, 0, 0, -8],
    [2.15, 9, 0, 0, 4],
    [2.2, 7.2, 0, 0, 12],
  ]
  for (const [r, len, x, y, z] of mods) cyl(r, len, white, g, x, y, z, 'z')
  box(4.6, 4.2, 5.2, white, g, 0, 0, 0)
  cyl(2.15, 6.8, white, g, 7.2, 0, 1, 'x')
  cyl(2.2, 11, white, g, -8.2, 0, 2, 'x')
  cyl(1.5, 1.6, white, g, 0, -2.4, 1.2, 'y')
  const cup = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass)
  cup.position.set(0, -3.3, 1.2)
  cup.rotation.x = Math.PI
  g.add(cup)
  const wings = [-50, -38, 38, 50]
  for (const x of wings) {
    box(6, 0.08, 32, solarMat, g, x, 0, 20)
    box(6, 0.08, 32, solarMat, g, x, 0, -20)
  }
  const arm = new THREE.Group()
  cyl(0.18, 8, alum, arm, 0, 2.2, 6, 'z')
  cyl(0.16, 6, kapton, arm, 0, 2.2, 12, 'y')
  cyl(0.14, 5, alum, arm, 2.2, 5, 12, 'x')
  g.add(arm)
  light('#ff4040', g, 54, 1.2, 0)
  light('#9dff6a', g, -54, 1.2, 0)
  light('#ffffff', g, 0, 2.2, 16)
  return g
}

export function buildTiangong(): THREE.Group {
  const g = new THREE.Group()
  cyl(2.1, 16.6, white, g, 0, 0, 0, 'z')
  cyl(1.9, 14, white, g, 8, 0, 0, 'x')
  cyl(1.9, 14, white, g, -8, 0, 0, 'x')
  box(3.2, 0.08, 18, solarMat, g, 16, 0, 0)
  box(3.2, 0.08, 18, solarMat, g, -16, 0, 0)
  box(2.4, 0.08, 14, solarMat, g, 0, 0, 12)
  light('#ff5533', g, 0, 2, 9)
  return g
}

export function buildHubble(): THREE.Group {
  const g = new THREE.Group()
  cyl(2.1, 13.2, alum, g, 0, 0, 0, 'z')
  const door = box(0.2, 3.6, 3.2, silver, g, 0, 1.6, 6.8)
  door.rotation.x = -0.5
  box(2.6, 0.12, 7.4, solarMat, g, 3.4, 0, -1)
  box(2.6, 0.12, 7.4, solarMat, g, -3.4, 0, -1)
  cyl(0.15, 3.2, alum, g, 0, 2.4, -2, 'y')
  cyl(0.8, 0.2, white, g, 1.6, 1.4, -4, 'y')
  light('#fff1c9', g, 0, 0, 7.2)
  return g
}

export function buildJWST(): THREE.Group {
  const g = new THREE.Group()
  const s = 1.32
  const spots: [number, number][] = []
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3
    spots.push([Math.cos(a) * s, Math.sin(a) * s])
    spots.push([Math.cos(a) * s * 2, Math.sin(a) * s * 2])
    const b = a + Math.PI / 6
    spots.push([Math.cos(b) * s * Math.sqrt(3), Math.sin(b) * s * Math.sqrt(3)])
  }
  const hex = new THREE.CylinderGeometry(0.76, 0.76, 0.08, 6)
  for (const [x, z] of spots) {
    const m = new THREE.Mesh(hex, gold)
    m.position.set(x, 0, z)
    g.add(m)
  }
  const sec = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 6), gold)
  sec.position.set(0, 0, 7.2)
  g.add(sec)
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3
    const strut = cyl(0.04, 7.4, dark, g, Math.cos(a) * 1.6, 0, 3.6, 'z')
    strut.lookAt(Math.cos(a) * 2.4, 0, 0)
  }
  const shape = new THREE.Shape()
  shape.moveTo(0, 3.2)
  shape.lineTo(6.6, -0.4)
  shape.lineTo(0, -8.2)
  shape.lineTo(-6.6, -0.4)
  shape.closePath()
  const geo = new THREE.ShapeGeometry(shape)
  const cols = [silver, purple, silver, purple, silver]
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(geo, cols[i])
    m.position.set(0, -1.6 - i * 0.18, -1)
    m.rotation.x = -Math.PI / 2
    g.add(m)
  }
  box(1.6, 1.4, 2.2, alum, g, 0, -2.5, -2)
  return g
}

export function buildVoyager(): THREE.Group {
  const g = new THREE.Group()
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.85, 36, 18, 0, Math.PI * 2, 0, 0.48), white)
  dish.rotation.x = Math.PI
  dish.position.z = 0.4
  g.add(dish)
  box(1.6, 1.6, 1.4, alum, g, 0, 0, -0.8)
  cyl(0.18, 2.4, dark, g, 1.5, 0, -0.6, 'x')
  for (const z of [-0.2, 0.35, 0.9]) cyl(0.28, 0.7, kapton, g, 2.5, 0, z - 0.8, 'x')
  cyl(0.04, 12, alum, g, -0.4, 0, -7, 'z')
  const record = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.06, 32),
    new THREE.MeshStandardMaterial({ color: '#e8c56a', metalness: 1, roughness: 0.18, emissive: '#5a4010', emissiveIntensity: 0.3 }),
  )
  record.rotation.z = Math.PI / 2
  record.position.set(0, -0.82, -0.8)
  g.add(record)
  cyl(0.08, 1.4, alum, g, -1.1, 0.4, -0.2, 'y')
  return g
}

export function buildParker(): THREE.Group {
  const g = new THREE.Group()
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.18, 6), new THREE.MeshStandardMaterial({ color: '#2a2e33', metalness: 0.4, roughness: 0.55 }))
  shield.rotation.x = Math.PI / 2
  shield.position.z = 0.8
  g.add(shield)
  box(0.7, 0.7, 0.9, alum, g, 0, 0, -0.1)
  cyl(0.12, 0.45, kapton, g, 0, 0.2, 0.95, 'z')
  box(0.5, 0.05, 1.1, solarMat, g, 0.9, 0, -0.2)
  box(0.5, 0.05, 1.1, solarMat, g, -0.9, 0, -0.2)
  return g
}

export function buildJuno(): THREE.Group {
  const g = new THREE.Group()
  cyl(1.3, 1.1, alum, g, 0, 0, 0, 'y')
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3
    const wing = box(9.5, 0.08, 2.4, solarMat, g, Math.cos(a) * 6.2, 0, Math.sin(a) * 6.2)
    wing.rotation.y = -a
  }
  cyl(0.35, 0.4, gold, g, 0, 0.8, 0, 'y')
  return g
}

export function buildNewHorizons(): THREE.Group {
  const g = new THREE.Group()
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.12, 24), white)
  dish.rotation.x = Math.PI / 2
  dish.position.z = 0.7
  g.add(dish)
  box(0.9, 0.7, 1.1, alum, g, 0, 0, -0.2)
  cyl(0.16, 0.8, kapton, g, 0.7, -0.2, -0.4, 'x')
  box(0.35, 0.5, 0.35, dark, g, 1.15, -0.2, -0.4)
  return g
}

export function buildStarlinkSat(): THREE.Group {
  const g = new THREE.Group()
  box(1.2, 0.15, 2.4, alum, g)
  box(2.2, 0.05, 6.5, solarMat, g, 0, 0, 4.2)
  return g
}

export const CRAFT_BUILDERS: Record<string, () => THREE.Group> = {
  iss: buildISS,
  tiangong: buildTiangong,
  hubble: buildHubble,
  jwst: buildJWST,
  parker: buildParker,
  juno: buildJuno,
  voyager1: buildVoyager,
  voyager2: buildVoyager,
  newhorizons: buildNewHorizons,
}
