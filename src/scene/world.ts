import * as THREE from 'three'
import { BODY_BY_ID, BODY_IDS, ORBIT_BY_ID, type BodyDef } from '../astro/catalog'
import { CONSTELLATIONS, STARS } from '../astro/stars'
import { BELT_STRIDE, displayRadius, readPos, sampleOrbit } from '../astro/ephemeris'
import { AU, J2000, LY, TAU, raDecDir, raDecPos, spectralColor, v3, type V3 } from '../astro/math'
import { CRAFT_BUILDERS, buildStarlinkSat } from './craft'
import {
  atmoFragment,
  atmoVertex,
  coronaFragment,
  coronaVertex,
  bhFragment,
  bhVertex,
  galaxyFragment,
  galaxyVertex,
  gasFragment,
  ringFragment,
  ringVertex,
  rockFragment,
  rockVertex,
  skyFragment,
  skyVertex,
  starFragment,
  starVertex,
  sunFragment,
  sunVertex,
} from './shaders'
import { beltAsteroids, beltKuiper, bodyQuaternion, probePaths, screenStreak } from '../engine/runtime'
import { cam64, labelFrame, sim } from '../engine/state'

const tmp = v3()
const tmp2 = v3()
const q = new THREE.Quaternion()
const v = new THREE.Vector3()
const c3 = new THREE.Color()
const up = new THREE.Vector3(0, 1, 0)

function softTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function procTex(paint: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  paint(g, 512, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function hash2(i: number, j: number): number {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return n - Math.floor(n)
}

function paintNoise(g: CanvasRenderingContext2D, w: number, h: number, c0: string, c1: string, cracks = false): void {
  g.fillStyle = c0
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const r = 2 + Math.random() * 18
    g.fillStyle = c1
    g.globalAlpha = 0.15 + Math.random() * 0.45
    g.beginPath()
    g.arc(x, y, r, 0, TAU)
    g.fill()
  }
  g.globalAlpha = 1
  if (cracks) {
    g.strokeStyle = 'rgba(40,50,60,0.65)'
    g.lineWidth = 1.2
    for (let k = 0; k < 28; k++) {
      g.beginPath()
      let x = Math.random() * w
      let y = Math.random() * h
      g.moveTo(x, y)
      for (let s = 0; s < 8; s++) {
        x += (Math.random() - 0.5) * 40
        y += (Math.random() - 0.5) * 16
        g.lineTo(x, y)
      }
      g.stroke()
    }
  }
  void hash2
}

interface Node {
  id: string
  group: THREE.Group
  mesh?: THREE.Object3D
  mat?: THREE.ShaderMaterial
  atmo?: THREE.Mesh
  atmoMat?: THREE.ShaderMaterial
  rings?: THREE.Mesh
  ringMat?: THREE.ShaderMaterial
  glow?: THREE.Sprite
  clouds?: THREE.Mesh
  spinExtra?: number
}

export interface UniverseHandle {
  update: (dt: number, camera: THREE.PerspectiveCamera, w: number, h: number) => void
  pick: (camera: THREE.PerspectiveCamera, x: number, y: number) => string | null
  dispose: () => void
}

const whiteTex = (): THREE.DataTexture => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  t.needsUpdate = true
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function createUniverse(tex: Record<string, THREE.Texture>): { object: THREE.Group; handle: UniverseHandle } {
  const root = new THREE.Group()
  const blank = whiteTex()
  const soft = softTexture()
  const moonTex = tex.moon ?? procTex((g, w, h) => paintNoise(g, w, h, '#c8c4bc', '#6e6a64'))
  const proc = {
    io: procTex((g, w, h) => paintNoise(g, w, h, '#e2c24a', '#c45a22')),
    europe: procTex((g, w, h) => paintNoise(g, w, h, '#efe8dc', '#8aa0b0', true)),
    ganymede: procTex((g, w, h) => paintNoise(g, w, h, '#b7aa96', '#6d6258')),
    callisto: procTex((g, w, h) => paintNoise(g, w, h, '#6e675f', '#3a342e')),
    encelade: procTex((g, w, h) => paintNoise(g, w, h, '#f7fbff', '#d5e2ea', true)),
    titan: procTex((g, w, h) => paintNoise(g, w, h, '#e0a84a', '#c47a28')),
    triton: procTex((g, w, h) => paintNoise(g, w, h, '#e7eef2', '#c9b1b8')),
    charon: procTex((g, w, h) => paintNoise(g, w, h, '#b7b3ae', '#6a6662')),
    venus: tex.venus,
    default: procTex((g, w, h) => paintNoise(g, w, h, '#b9b4aa', '#6a655e')),
  }

  const mapFor = (id: string): THREE.Texture => {
    if (id === 'soleil') return tex.sun ?? blank
    if (id === 'mercure') return tex.mercury ?? blank
    if (id === 'venus') return tex.venus ?? blank
    if (id === 'terre') return tex.earth ?? blank
    if (id === 'mars') return tex.mars ?? blank
    if (id === 'jupiter') return tex.jupiter ?? blank
    if (id === 'saturne') return tex.saturn ?? blank
    if (id === 'uranus') return tex.uranus ?? blank
    if (id === 'neptune') return tex.neptune ?? blank
    if (id === 'lune') return moonTex
    if (id === 'ceres') return tex.ceres ?? blank
    if (id === 'pluton') return tex.pluto ?? blank
    return (proc as Record<string, THREE.Texture>)[id] ?? proc.default
  }

  const nodes = new Map<string, Node>()
  const seg = sim.quality === 'ultra' ? 80 : sim.quality === 'high' ? 64 : sim.quality === 'medium' ? 40 : 28
  const sphere = new THREE.SphereGeometry(1, seg, Math.max(16, seg / 2))

  const sunLight = new THREE.DirectionalLight('#fff3df', 3.4)
  sunLight.position.set(1, 0.2, 0)
  root.add(sunLight)
  root.add(new THREE.HemisphereLight('#c5d7ff', '#2a2118', 0.42))
  root.add(new THREE.AmbientLight('#243044', 0.22))

  const galN = v3()
  const galC = v3()
  const galE = v3()
  raDecDir(192.8595, 27.1283, galN)
  raDecDir(266.405, -28.936, galC)
  galE.x = galN.y * galC.z - galN.z * galC.y
  galE.y = galN.z * galC.x - galN.x * galC.z
  galE.z = galN.x * galC.y - galN.y * galC.x

  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uNorth: { value: new THREE.Vector3(galN.x, galN.y, galN.z) },
      uCenter: { value: new THREE.Vector3(galC.x, galC.y, galC.z) },
      uEast: { value: new THREE.Vector3(galE.x, galE.y, galE.z) },
      uFade: { value: 1 },
    },
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    depthTest: false,
    depthWrite: false,
    side: THREE.BackSide,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 32), skyMat)
  sky.frustumCulled = false
  sky.renderOrder = -1000
  root.add(sky)

  const presetStars = sim.quality === 'ultra' ? 14000 : sim.quality === 'high' ? 9000 : sim.quality === 'medium' ? 4800 : 2200
  const starCount = Math.floor(presetStars * sim.starDensity)
  const pos = new Float32Array(starCount * 3)
  const col = new Float32Array(starCount * 3)
  const siz = new Float32Array(starCount)
  let seed = 1337
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return (seed & 2147483647) / 2147483647
  }
  for (let i = 0; i < starCount; i++) {
    const z = rnd() * 2 - 1
    const a = rnd() * TAU
    const r = Math.sqrt(Math.max(0, 1 - z * z))
    const rad = 4000 + rnd() * 20000
    pos[i * 3] = Math.cos(a) * r * rad
    pos[i * 3 + 1] = z * rad
    pos[i * 3 + 2] = Math.sin(a) * r * rad
    const spec = 'OBAFGKM'[Math.floor(rnd() * 7)]
    c3.set(spectralColor(spec))
    col[i * 3] = c3.r
    col[i * 3 + 1] = c3.g
    col[i * 3 + 2] = c3.b
    siz[i] = 0.8 + rnd() * 2.2
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1))
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uWarp: { value: 0 }, uStreak: { value: new THREE.Vector2(0, 1) }, uDensity: { value: 1 } },
    vertexShader: starVertex,
    fragmentShader: starFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const starField = new THREE.Points(starGeo, starMat)
  starField.frustumCulled = false
  root.add(starField)

  const catPos = new Float32Array(STARS.length * 3)
  const catCol = new Float32Array(STARS.length * 3)
  const catSize = new Float32Array(STARS.length)
  const catWorld: V3[] = STARS.map((s) => {
    const p = v3()
    raDecPos(s.ra, s.dec, s.ly, p)
    return p
  })
  const catGeo = new THREE.BufferGeometry()
  catGeo.setAttribute('position', new THREE.BufferAttribute(catPos, 3))
  catGeo.setAttribute('aColor', new THREE.BufferAttribute(catCol, 3))
  catGeo.setAttribute('aSize', new THREE.BufferAttribute(catSize, 1))
  STARS.forEach((s, i) => {
    c3.set(spectralColor(s.spec))
    catCol[i * 3] = c3.r
    catCol[i * 3 + 1] = c3.g
    catCol[i * 3 + 2] = c3.b
    catSize[i] = Math.max(1.4, 8.5 * Math.pow(10, -0.18 * s.mag))
  })
  const catalog = new THREE.Points(catGeo, starMat.clone())
  catalog.frustumCulled = false
  root.add(catalog)

  const constGeo = new THREE.BufferGeometry()
  const constPairs: [number, number][] = []
  for (const c of CONSTELLATIONS) {
    for (let i = 0; i < c.stars.length - 1; i++) {
      const a = STARS.findIndex((s) => s.id === c.stars[i])
      const b = STARS.findIndex((s) => s.id === c.stars[i + 1])
      if (a >= 0 && b >= 0) constPairs.push([a, b])
    }
  }
  const constPos = new Float32Array(constPairs.length * 2 * 3)
  constGeo.setAttribute('position', new THREE.BufferAttribute(constPos, 3))
  const constLines = new THREE.LineSegments(
    constGeo,
    new THREE.LineBasicMaterial({ color: '#9eb6d8', transparent: true, opacity: 0.45 }),
  )
  constLines.frustumCulled = false
  root.add(constLines)

  const glowMat = new THREE.SpriteMaterial({
    map: soft,
    color: '#fff4d2',
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
  })

  function addBody(b: BodyDef): void {
    const group = new THREE.Group()
    group.name = b.id
    root.add(group)
    const node: Node = { id: b.id, group }
    if (b.kind === 'star') {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uMap: { value: b.id === 'soleil' ? mapFor('soleil') : blank },
          uTint: { value: new THREE.Color(b.color) },
        },
        vertexShader: sunVertex,
        fragmentShader: sunFragment,
      })
      if (b.id !== 'soleil') {
        c3.set(b.color)
        mat.uniforms.uMap.value = blank
      }
      const mesh = new THREE.Mesh(sphere, mat)
      group.add(mesh)
      node.mesh = mesh
      node.mat = mat
      const g = new THREE.Sprite(glowMat.clone())
      ;(g.material as THREE.SpriteMaterial).color.set(b.color)
      group.add(g)
      node.glow = g
      if (b.id === 'soleil') {
        const corona = new THREE.Mesh(
          sphere,
          new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            vertexShader: coronaVertex,
            fragmentShader: coronaFragment,
            transparent: true,
            depthWrite: false,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
          }),
        )
        corona.scale.setScalar(2.6)
        group.add(corona)
        node.atmo = corona
        node.atmoMat = corona.material as THREE.ShaderMaterial
      }
    } else if (b.kind === 'planet' || b.kind === 'moon' || b.kind === 'dwarf') {
      const gas = b.flags?.includes('bands')
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uSun: { value: new THREE.Vector3() },
          uTint: { value: new THREE.Color(b.map ? '#ffffff' : b.color) },
          uDay: { value: mapFor(b.id) },
          uNight: { value: tex.earthNight ?? blank },
          uSpec: { value: tex.earthSpec ?? blank },
          uCloud: { value: tex.earthCloud ?? blank },
          uHasNight: { value: b.id === 'terre' ? 1 : 0 },
          uHasSpec: { value: b.id === 'terre' ? 1 : 0 },
          uHasCloud: { value: b.id === 'terre' ? 1 : 0 },
          uCloudOff: { value: 0 },
          uTime: { value: 0 },
          uAurora: { value: b.flags?.includes('aurora') ? 1 : 0 },
          uCenter: { value: new THREE.Vector3() },
          uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
          uRingInner: { value: 1.2 },
          uRingOuter: { value: 2.3 },
          uHasRing: { value: b.flags?.includes('rings') ? 1 : 0 },
          uGRS: { value: b.id === 'jupiter' ? 1 : 0 },
        },
        vertexShader: rockVertex,
        fragmentShader: gas ? gasFragment : rockFragment,
      })
      const mesh = new THREE.Mesh(sphere, mat)
      group.add(mesh)
      node.mesh = mesh
      node.mat = mat
      if (b.id === 'terre') {
        const cm = new THREE.Mesh(
          sphere,
          new THREE.MeshStandardMaterial({
            map: tex.earthCloud,
            transparent: true,
            depthWrite: false,
            opacity: 0.92,
            roughness: 1,
            metalness: 0,
          }),
        )
        cm.scale.setScalar(1.012)
        group.add(cm)
        node.clouds = cm
      }
      if (b.flags?.includes('atmos') || b.flags?.includes('haze')) {
        const am = new THREE.ShaderMaterial({
          uniforms: {
            uCenter: { value: new THREE.Vector3() },
            uRadius: { value: 1 },
            uSun: { value: new THREE.Vector3() },
            uColor: { value: new THREE.Color(b.id === 'venus' || b.id === 'titan' ? '#e6c27a' : b.id === 'mars' ? '#e7b39a' : '#8cbcff') },
            uStrength: { value: b.id === 'venus' ? 2.4 : b.id === 'mars' ? 0.7 : b.id === 'titan' ? 2.8 : 1.5 },
            uOuter: { value: b.id === 'venus' || b.id === 'titan' ? 1.09 : b.id === 'mars' ? 1.02 : 1.035 },
          },
          vertexShader: atmoVertex,
          fragmentShader: atmoFragment,
          transparent: true,
          depthWrite: false,
          side: THREE.BackSide,
        })
        const a = new THREE.Mesh(sphere, am)
        group.add(a)
        node.atmo = a
        node.atmoMat = am
      }
      if (b.flags?.includes('rings') || b.flags?.includes('rings-thin')) {
        const inner = b.id === 'uranus' ? 1.5 : 1.15
        const outer = b.id === 'uranus' ? 2.0 : 2.32
        const geo = new THREE.RingGeometry(inner, outer, 160, 4)
        const rm = new THREE.ShaderMaterial({
          uniforms: {
            uSun: { value: new THREE.Vector3() },
            uPlanet: { value: new THREE.Vector3() },
            uPlanetR: { value: 1 },
            uInner: { value: inner },
            uOuter: { value: outer },
            uRing: { value: tex.saturnRing ?? blank },
            uTint: { value: new THREE.Color(b.id === 'uranus' ? '#9fd0d4' : '#efe2c9') },
          },
          vertexShader: ringVertex,
          fragmentShader: ringFragment,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
        const ring = new THREE.Mesh(geo, rm)
        ring.rotation.x = Math.PI / 2
        group.add(ring)
        node.rings = ring
        node.ringMat = rm
        if (b.id === 'uranus') rm.uniforms.uTint.value = new THREE.Color('#8fd')
      }
      if (b.flags?.includes('volcano') || b.flags?.includes('geysers')) {
        const plume = new THREE.Mesh(
          new THREE.ConeGeometry(0.08, 0.55, 10),
          new THREE.MeshBasicMaterial({
            color: b.flags.includes('volcano') ? '#ffb15a' : '#e7fbff',
            transparent: true,
            opacity: 0.45,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        )
        plume.position.y = b.flags.includes('geysers') ? -1.2 : 1.2
        plume.scale.set(1.6, 2.4, 1.6)
        if (b.flags.includes('geysers')) plume.rotation.x = Math.PI
        group.add(plume)
      }
    } else if (b.kind === 'craft' && CRAFT_BUILDERS[b.id]) {
      group.add(CRAFT_BUILDERS[b.id]())
    } else if (b.kind === 'constellation') {
      group.add(buildStarlinkSat())
    } else if (b.kind === 'galaxy') {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uArms: { value: b.id === 'm51' ? 2 : b.id === 'm33' ? 2 : 4 },
          uBar: { value: b.flags?.includes('barred') ? 1 : 0.15 },
          uEdge: { value: b.flags?.includes('edgeon') ? 1 : 0 },
          uColor: { value: new THREE.Color(b.color) },
          uTime: { value: 0 },
          uElliptical: { value: b.flags?.includes('elliptical') ? 1 : 0 },
        },
        vertexShader: galaxyVertex,
        fragmentShader: galaxyFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 96), mat)
      group.add(mesh)
      node.mesh = mesh
      node.mat = mat
      if (b.flags?.includes('jet')) {
        const jet = new THREE.Mesh(
          new THREE.ConeGeometry(0.04, 0.85, 12),
          new THREE.MeshBasicMaterial({ color: '#d7ecff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
        )
        jet.position.y = 0.55
        group.add(jet)
        const jet2 = jet.clone()
        jet2.position.y = -0.55
        jet2.rotation.x = Math.PI
        group.add(jet2)
      }
      if (b.flags?.includes('irregular')) mesh.scale.set(1, 0.62, 1)
      const axis = new THREE.Vector3()
      if (b.id === 'mw') axis.set(galN.x, galN.y, galN.z)
      else axis.set(0.34, 0.78, 0.42).normalize()
      const bx = new THREE.Vector3(0, 1, 0).cross(axis)
      if (bx.lengthSq() < 1e-6) bx.set(1, 0, 0)
      bx.normalize()
      const by = new THREE.Vector3().crossVectors(axis, bx)
      group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, axis))
    } else if (b.kind === 'nebula') {
      const color = new THREE.Color(b.color)
      for (let i = 0; i < 26; i++) {
        const s = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: soft,
            color,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            opacity: 0.35,
          }),
        )
        const a = (i / 14) * TAU
        s.position.set(Math.cos(a) * (0.2 + (i % 4) * 0.12), ((i % 5) - 2) * 0.08, Math.sin(a * 1.3) * 0.25)
        s.scale.setScalar(0.35 + (i % 3) * 0.18)
        group.add(s)
      }
    } else if (b.kind === 'blackhole') {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uCenter: { value: new THREE.Vector3() },
          uRs: { value: b.radius },
          uTime: { value: 0 },
        },
        vertexShader: bhVertex,
        fragmentShader: bhFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
      group.add(mesh)
      node.mesh = mesh
      node.mat = mat
    } else if (b.kind === 'pulsar') {
      const core = new THREE.Mesh(
        sphere,
        new THREE.MeshBasicMaterial({ color: '#e9f4ff' }),
      )
      group.add(core)
      const beamMat = new THREE.MeshBasicMaterial({
        color: '#d7ecff',
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.4, 12, 1, true), beamMat)
      beam.position.y = 0.7
      group.add(beam)
      const beam2 = beam.clone()
      beam2.position.y = -0.7
      beam2.rotation.z = Math.PI
      group.add(beam2)
      node.mesh = core
    } else if (b.kind === 'comet') {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#2c3138', roughness: 0.9 }))
      group.add(rock)
      const coma = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: soft, color: '#d5e8ff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }),
      )
      group.add(coma)
      node.glow = coma
      const tail = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 6, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: '#f0e2c4', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      )
      group.add(tail)
      const ion = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 9, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: '#8ec6ff', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      )
      group.add(ion)
      tail.name = 'dust'
      ion.name = 'ion'
    }
    nodes.set(b.id, node)
  }

  for (const b of Object.values(BODY_BY_ID)) addBody(b)

  const beltMat = new THREE.MeshStandardMaterial({ color: '#9a8b78', roughness: 0.9, metalness: 0.05 })
  const beltGeo = new THREE.IcosahedronGeometry(1, 0)
  const astCount = sim.quality === 'low' ? 500 : sim.quality === 'medium' ? 1600 : sim.quality === 'high' ? 4200 : 8000
  const kuiperCount = Math.floor(astCount * 0.45)
  const asteroids = new THREE.InstancedMesh(beltGeo, beltMat, astCount)
  const kuiper = new THREE.InstancedMesh(beltGeo, beltMat.clone(), kuiperCount)
  ;(kuiper.material as THREE.MeshStandardMaterial).color.set('#c5d0dc')
  asteroids.frustumCulled = false
  kuiper.frustumCulled = false
  asteroids.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  kuiper.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  root.add(asteroids, kuiper)

  const beltRing = new THREE.Mesh(
    new THREE.RingGeometry(2.15 * AU, 3.25 * AU, 180, 1),
    new THREE.MeshBasicMaterial({ color: '#a09078', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  )
  beltRing.rotation.x = Math.PI / 2
  const kuiperRing = new THREE.Mesh(
    new THREE.RingGeometry(34 * AU, 48 * AU, 160, 1),
    new THREE.MeshBasicMaterial({ color: '#b7c6d6', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  )
  kuiperRing.rotation.x = Math.PI / 2
  root.add(beltRing, kuiperRing)

  const slCount = sim.quality === 'low' ? 70 : sim.quality === 'medium' ? 180 : sim.quality === 'high' ? 380 : 640
  const slMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.2, 8), solarish(), slCount)
  slMesh.frustumCulled = false
  root.add(slMesh)
  const gpsMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 2.2, 3), new THREE.MeshStandardMaterial({ color: '#d5dde8', metalness: 0.7, roughness: 0.35 }), 24)
  const geoMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 3, 4), new THREE.MeshStandardMaterial({ color: '#e6e0d2', metalness: 0.6, roughness: 0.4 }), 36)
  gpsMesh.frustumCulled = false
  geoMesh.frustumCulled = false
  root.add(gpsMesh, geoMesh)

  const orbitMat = new THREE.LineBasicMaterial({ color: '#9eb6ff', transparent: true, opacity: 0.35 })
  const orbitIds = ['mercure', 'venus', 'terre', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune', 'pluton', 'ceres']
  const orbits = new Map<string, THREE.Line>()
  for (const id of orbitIds) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(193 * 3), 3))
    const line = new THREE.Line(geo, orbitMat.clone())
    line.frustumCulled = false
    root.add(line)
    orbits.set(id, line)
  }
  const pathMat = new THREE.LineBasicMaterial({ color: '#f0c27a', transparent: true, opacity: 0.8 })
  const pathLines: Record<string, THREE.Line> = {}
  for (const id of ['voyager1', 'voyager2', 'newhorizons']) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    const line = new THREE.Line(geo, pathMat.clone())
    line.frustumCulled = false
    root.add(line)
    pathLines[id] = line
  }

  const hz = new THREE.Mesh(
    new THREE.RingGeometry(0.95 * AU, 1.37 * AU, 96, 1),
    new THREE.MeshBasicMaterial({ color: '#3dff9a', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
  )
  hz.rotation.x = Math.PI / 2
  root.add(hz)
  const helio = new THREE.Mesh(
    new THREE.SphereGeometry(120 * AU, 48, 24),
    new THREE.MeshBasicMaterial({ color: '#7eb6ff', transparent: true, opacity: 0.05, wireframe: true }),
  )
  root.add(helio)
  const grid = new THREE.PolarGridHelper(40 * AU, 8, 24, 64, '#3a4a66', '#243044')
  grid.rotation.x = Math.PI / 2
  root.add(grid)

  const dummy = new THREE.Object3D()
  const shellDummy = new THREE.Object3D()
  const streak = new THREE.Vector2()
  const sunRender = new THREE.Vector3()
  let labelAcc = 0

  function placeGroup(id: string, group: THREE.Group, radiusScale: number): number {
    readPos(id, tmp, true)
    const x = tmp.x - cam64[0]
    const y = tmp.y - cam64[1]
    const z = tmp.z - cam64[2]
    group.position.set(x, y, z)
    const dist = Math.hypot(x, y, z)
    if (radiusScale > 0) group.scale.setScalar(radiusScale)
    return dist
  }

  function updateBelts(mesh: THREE.InstancedMesh, data: Float32Array | null, fallback: number): void {
    const count = mesh.count
    const years = (sim.jd - J2000) / 365.25
    const maxR = 0.55 * AU
    for (let i = 0; i < count; i++) {
      let radius: number
      let ang: number
      let inc: number
      let node: number
      let size: number
      if (data && i * BELT_STRIDE + 8 < data.length) {
        const o = i * BELT_STRIDE
        radius = data[o]
        ang = data[o + 1] + data[o + 4] * years
        inc = data[o + 2]
        node = data[o + 3]
        size = data[o + 5]
      } else {
        const t = i / count
        radius = fallback * (0.85 + (t % 0.3))
        ang = t * 40 + years * 0.4
        inc = ((i % 17) - 8) * 0.02
        node = t * 6
        size = 2e4
      }
      const cosA = Math.cos(ang)
      const sinA = Math.sin(ang)
      const x1 = radius * cosA
      const z1 = radius * sinA
      const y = z1 * Math.sin(inc)
      const z0 = z1 * Math.cos(inc)
      const x = x1 * Math.cos(node) + z0 * Math.sin(node)
      const z = -x1 * Math.sin(node) + z0 * Math.cos(node)
      const dx = x - cam64[0]
      const dy = y - cam64[1]
      const dz = z - cam64[2]
      const near = dx * dx + dy * dy + dz * dz < maxR * maxR
      dummy.position.set(dx, dy, dz)
      dummy.scale.setScalar(near ? size : 0)
      dummy.rotation.set(ang, node, inc)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.visible = sim.band === 'systeme' || sim.band === 'planetaire' || sim.scaleMode === 'orrery'
  }

  const update = (dt: number, camera: THREE.PerspectiveCamera, w: number, h: number) => {
    const time = ((sim.jd - J2000) % 10) * 20
    starMat.uniforms.uDensity.value = sim.starDensity
    starMat.uniforms.uWarp.value = sim.warp
    screenStreak(streak)
    starMat.uniforms.uStreak.value.copy(streak)
    ;(catalog.material as THREE.ShaderMaterial).uniforms.uDensity.value = sim.starDensity
    ;(catalog.material as THREE.ShaderMaterial).uniforms.uWarp.value = sim.warp
    ;(catalog.material as THREE.ShaderMaterial).uniforms.uStreak.value.copy(streak)
    camera.userData.w = w
    camera.userData.h = h
    readPos('soleil', tmp, true)
    sunRender.set(tmp.x - cam64[0], tmp.y - cam64[1], tmp.z - cam64[2])
    sunLight.position.copy(sunRender)
    if (sunLight.position.lengthSq() > 1) sunLight.position.normalize()

    skyMat.uniforms.uFade.value = sim.band === 'galactique' || sim.band === 'intergalactique' || sim.band === 'interstellaire' ? 0.35 : 1
    readPos('mw', tmp2, false)
    const gcx = tmp2.x - cam64[0]
    const gcy = tmp2.y - cam64[1]
    const gcz = tmp2.z - cam64[2]
    const gdist = Math.hypot(gcx, gcy, gcz)
    const inside = gdist < 45000 * LY
    sky.visible = inside

    for (const id of BODY_IDS) {
      const b = BODY_BY_ID[id]
      const node = nodes.get(id)
      if (!node) continue
      const r = displayRadius(id)
      const shellKind = b.kind === 'galaxy' || b.kind === 'nebula' || b.kind === 'blackhole'
      let dist = 0
      if (shellKind) {
        readPos(id, tmp, true)
        const dx = tmp.x - cam64[0]
        const dy = tmp.y - cam64[1]
        const dz = tmp.z - cam64[2]
        dist = Math.hypot(dx, dy, dz) || 1
        const shell = Math.min(dist, 5e5)
        const k = shell / dist
        node.group.position.set(dx * k, dy * k, dz * k)
        node.group.scale.setScalar(b.kind === 'blackhole' ? 1 : Math.max(shell * Math.tan(Math.atan(r / dist)), 8))
      } else {
        const spherical = b.kind === 'planet' || b.kind === 'moon' || b.kind === 'dwarf' || b.kind === 'star' || b.kind === 'pulsar'
        dist = placeGroup(id, node.group, spherical ? r : b.kind === 'comet' ? Math.max(r, 800) : 1)
      }
      bodyQuaternion(id, q)
      if (b.kind !== 'blackhole' && b.kind !== 'galaxy' && b.kind !== 'nebula') node.group.quaternion.copy(q)
      if (b.kind === 'pulsar') node.group.rotateY(time * 4.5)
      if (node.mat) {
        if (node.mat.uniforms.uTime) node.mat.uniforms.uTime.value = time
        if (node.mat.uniforms.uSun) node.mat.uniforms.uSun.value.copy(sunRender)
        if (node.mat.uniforms.uCenter) node.mat.uniforms.uCenter.value.copy(node.group.position)
        if (node.mat.uniforms.uCloudOff) node.mat.uniforms.uCloudOff.value = time * 0.002
        if (b.flags?.includes('rings')) {
          up.set(0, 1, 0).applyQuaternion(node.group.quaternion)
          node.mat.uniforms.uRingNormal.value.copy(up)
          node.mat.uniforms.uRingInner.value = r * 1.15
          node.mat.uniforms.uRingOuter.value = r * 2.32
        }
      }
      if (node.atmo && node.atmoMat?.uniforms.uRadius) {
        node.atmo.scale.setScalar(node.atmoMat.uniforms.uOuter.value as number)
        node.atmoMat.uniforms.uCenter.value.copy(node.group.position)
        node.atmoMat.uniforms.uRadius.value = r
        node.atmoMat.uniforms.uSun.value.copy(sunRender)
      } else if (node.atmoMat?.uniforms.uTime && !node.atmoMat.uniforms.uRadius) {
        node.atmoMat.uniforms.uTime.value = time
      }
      if (node.ringMat) {
        node.ringMat.uniforms.uSun.value.copy(sunRender)
        node.ringMat.uniforms.uPlanet.value.copy(node.group.position)
        node.ringMat.uniforms.uPlanetR.value = r
      }
      if (node.glow && b.kind === 'star') {
        const minS = Math.max(r * 5, dist * 0.02)
        node.glow.scale.setScalar(minS / Math.max(node.group.scale.x, 1))
      }
      if (node.mesh && (b.kind === 'planet' || b.kind === 'moon' || b.kind === 'dwarf' || b.kind === 'star')) {
        const ang = 2 * Math.atan(r / Math.max(dist, 1))
        const px = (ang / ((sim.fov * Math.PI) / 180)) * Math.max(h, 1)
        const showMesh = px > 1.6
        node.mesh.visible = showMesh
        if (node.rings) node.rings.visible = px > 5
        if (node.atmo && node.atmoMat?.uniforms.uRadius) node.atmo.visible = px > 7
        if (node.clouds) node.clouds.visible = px > 6
      }
      if (b.kind === 'galaxy') {
        node.group.visible = id === 'mw' ? !inside : true
        if (id !== 'mw') {
          node.group.lookAt(0, 0, 0)
          node.group.rotateX(0.62)
        }
      }
      if (b.kind === 'blackhole' && node.mesh) {
        readPos(id, tmp, true)
        const realD = Math.hypot(tmp.x - cam64[0], tmp.y - cam64[1], tmp.z - cam64[2]) || 1
        const k = Math.min(realD, 5e5) / realD
        node.mesh.scale.setScalar(Math.max(b.radius * 22 * k, 12))
        node.mesh.lookAt(0, 0, 0)
        if (node.mat) {
          node.mat.uniforms.uCenter.value.copy(node.group.position)
          node.mat.uniforms.uRs.value = Math.max(b.radius * k, 1)
        }
      }
      if (b.kind === 'comet') {
        const dust = node.group.getObjectByName('dust')
        const ion = node.group.getObjectByName('ion')
        const away = sunRender.clone().sub(node.group.position)
        if (away.lengthSq() < 1) away.set(0, 0, 1)
        away.normalize()
        const sunDist = Math.max(0.2, distToSun(id))
        const stretch = clampComet(sunDist)
        for (const tail of [dust, ion]) {
          if (!tail) continue
          tail.position.copy(away).multiplyScalar(stretch * (tail.name === 'ion' ? 4.2 : 2.6))
          tail.lookAt(node.group.position.clone().add(away))
          tail.scale.set(tail.name === 'ion' ? 0.7 : 1.15, tail.name === 'ion' ? stretch * 1.4 : stretch, tail.name === 'ion' ? 0.7 : 1.15)
        }
        if (node.glow) node.glow.scale.setScalar(2.4 + stretch)
      }
      if (b.kind === 'nebula') node.group.visible = dist < r * 8 || dist > r * 0.2
    }

    // catalog stars relative to camera
    for (let i = 0; i < STARS.length; i++) {
      const p = catWorld[i]
      catPos[i * 3] = p.x - cam64[0]
      catPos[i * 3 + 1] = p.y - cam64[1]
      catPos[i * 3 + 2] = p.z - cam64[2]
    }
    ;(catGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    if (sim.layers.constellations) {
      for (let i = 0; i < constPairs.length; i++) {
        const [a, b] = constPairs[i]
        const A = catWorld[a]
        const B = catWorld[b]
        const o = i * 6
        constPos[o] = A.x - cam64[0]
        constPos[o + 1] = A.y - cam64[1]
        constPos[o + 2] = A.z - cam64[2]
        constPos[o + 3] = B.x - cam64[0]
        constPos[o + 4] = B.y - cam64[1]
        constPos[o + 5] = B.z - cam64[2]
      }
      ;(constGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    }
    constLines.visible = sim.layers.constellations

    const nearSystem = sim.band === 'systeme' || sim.band === 'planetaire' || sim.band === 'sonde' || sim.scaleMode === 'orrery'
    asteroids.visible = nearSystem
    kuiper.visible = nearSystem
    if (nearSystem) {
      updateBelts(asteroids, beltAsteroids, 2.7 * AU)
      updateBelts(kuiper, beltKuiper, 40 * AU)
    }
    beltRing.position.set(-cam64[0], -cam64[1], -cam64[2])
    kuiperRing.position.copy(beltRing.position)
    beltRing.visible = sim.band !== 'sonde' && sim.band !== 'intergalactique'
    kuiperRing.visible = sim.band === 'systeme' || sim.band === 'interstellaire'

    readPos('terre', tmp, true)
    const ex = tmp.x - cam64[0]
    const ey = tmp.y - cam64[1]
    const ez = tmp.z - cam64[2]
    const years = (sim.jd - J2000) / 365.25
    const showShells = Math.hypot(ex, ey, ez) < 80000e3 || sim.selected === 'starlink' || sim.selected === 'gps' || sim.selected === 'geo'
    slMesh.visible = showShells
    gpsMesh.visible = showShells || sim.layers.orbits
    geoMesh.visible = showShells || sim.layers.orbits
    if (showShells) {
      scatterShell(shellDummy, slMesh, ex, ey, ez, 6.371e6 + 550e3, 0.92, years * 5200, slCount)
      scatterShell(shellDummy, gpsMesh, ex, ey, ez, 6.371e6 + 20180e3, 0.96, years * 700, 24)
      scatterShell(shellDummy, geoMesh, ex, ey, ez, 6.371e6 + 35786e3, 0.02, years * 360, 36)
    }

    const showOrbits =
      sim.layers.orbits &&
      (sim.band === 'systeme' || sim.band === 'planetaire' || sim.scaleMode === 'orrery') &&
      !(sim.nearestId === 'soleil' && sim.nearestGap < displayRadius('soleil') * 12)
    for (const [id, line] of orbits) {
      line.visible = showOrbits
      if (!showOrbits) continue
      const attr = line.geometry.attributes.position as THREE.BufferAttribute
      const arr = attr.array as Float32Array
      sampleOrbit(id, sim.jd, 192, arr, sim.scaleMode === 'orrery')
      const parent = ORBIT_BY_ID[id]?.parent
      if (parent && parent !== 'soleil') {
        readPos(parent, tmp, true)
        for (let i = 0; i < arr.length; i += 3) {
          arr[i] += tmp.x
          arr[i + 1] += tmp.y
          arr[i + 2] += tmp.z
        }
      }
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] -= cam64[0]
        arr[i + 1] -= cam64[1]
        arr[i + 2] -= cam64[2]
      }
      attr.needsUpdate = true
    }
    for (const id of ['voyager1', 'voyager2', 'newhorizons']) {
      const line = pathLines[id]
      const data = probePaths[id]
      line.visible = sim.layers.trajectories && !!data
      if (!data) continue
      let attr = line.geometry.attributes.position as THREE.BufferAttribute | undefined
      if (!attr || attr.array.length !== data.length) {
        line.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.length), 3))
        attr = line.geometry.attributes.position as THREE.BufferAttribute
      }
      const arr = attr.array as Float32Array
      for (let i = 0; i < data.length; i += 3) {
        let x = data[i]
        let y = data[i + 1]
        let z = data[i + 2]
        if (sim.scaleMode === 'orrery') {
          const r = Math.hypot(x, y, z) || 1
          const cr = (0.28 + Math.log10(1 + r / AU) * 0.7) * 4e9
          const f = cr / r
          x *= f
          y *= f
          z *= f
        }
        arr[i] = x - cam64[0]
        arr[i + 1] = y - cam64[1]
        arr[i + 2] = z - cam64[2]
      }
      attr.needsUpdate = true
    }

    hz.position.set(-cam64[0], -cam64[1], -cam64[2])
    helio.position.copy(hz.position)
    grid.position.copy(hz.position)
    hz.visible = sim.layers.habitable
    helio.visible = sim.layers.heliosphere
    grid.visible = sim.layers.ecliptic && (sim.band === 'systeme' || sim.scaleMode === 'orrery')

    labelAcc += dt
    if (labelAcc > 0.12) {
      labelAcc = 0
      const items = []
      const want = new Set<string>([sim.selected, sim.nearestId, 'soleil', 'terre'])
      if (sim.layers.labels) {
        for (const id of ['lune', 'mars', 'jupiter', 'saturne', 'iss', 'jwst', 'm31', 'sgr-a']) want.add(id)
      }
      for (const id of want) {
        if (!BODY_BY_ID[id]) continue
        readPos(id, tmp, true)
        v.set(tmp.x - cam64[0], tmp.y - cam64[1], tmp.z - cam64[2])
        if (!sim.layers.labels && id !== sim.selected) continue
        v.project(camera)
        if (v.z > 1) continue
        items.push({
          id,
          name: BODY_BY_ID[id].name,
          x: (v.x * 0.5 + 0.5) * w,
          y: (-v.y * 0.5 + 0.5) * h,
          sub: id === sim.selected ? 'sélection' : '',
        })
      }
      labelFrame.items = items
      readPos('soleil', tmp, true)
      v.set(tmp.x - cam64[0], tmp.y - cam64[1], tmp.z - cam64[2])
      const sd = v.length()
      v.project(camera)
      const inFront = v.z < 1 && sd > 0
      labelFrame.flare = {
        x: (v.x * 0.5 + 0.5) * w,
        y: (-v.y * 0.5 + 0.5) * h,
        a: inFront ? Math.max(0, 1.2 - Math.hypot(v.x, v.y)) * (sim.band === 'sonde' || sim.band === 'planetaire' || sim.band === 'systeme' ? 0.85 : 0.2) : 0,
      }
    }
    void dt
  }

  const pick = (camera: THREE.PerspectiveCamera, px: number, py: number): string | null => {
    const ndcX = (px / camera.userData.w) * 2 - 1
    const ndcY = -(py / camera.userData.h) * 2 + 1
    let best = 28
    let id: string | null = null
    for (const b of Object.values(BODY_BY_ID)) {
      readPos(b.id, tmp, true)
      v.set(tmp.x - cam64[0], tmp.y - cam64[1], tmp.z - cam64[2])
      const dist = v.length()
      v.project(camera)
      if (v.z > 1) continue
      const sx = (v.x * 0.5 + 0.5) * (camera.userData.w as number)
      const sy = (-v.y * 0.5 + 0.5) * (camera.userData.h as number)
      const pix = Math.hypot(sx - px, sy - py)
      const ang = Math.atan2(displayRadius(b.id), Math.max(dist, 1))
      const radPx = (ang / ((camera.fov * Math.PI) / 180)) * (camera.userData.h as number)
      const hit = pix < Math.max(18, radPx)
      if (hit && pix < best) {
        best = pix
        id = b.id
      }
    }
    void ndcX
    void ndcY
    return id
  }

  return {
    object: root,
    handle: {
      update,
      pick,
      dispose: () => root.clear(),
    },
  }
}

function solarish(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#d7dee8', metalness: 0.7, roughness: 0.35 })
}

function scatterShell(o: THREE.Object3D, mesh: THREE.InstancedMesh, ex: number, ey: number, ez: number, radius: number, incAmp: number, spin: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const inc = ((i % 5) / 4 - 0.5) * incAmp
    const node = (i * 47) % 360
    const ang = spin + i * 0.7
    const ci = Math.cos(inc)
    const x = radius * Math.cos(ang) * ci
    const z = radius * Math.sin(ang) * ci
    const y = radius * Math.sin(inc) * Math.sin(ang)
    const c = Math.cos(node)
    const s = Math.sin(node)
    const xr = x * c - z * s
    const zr = x * s + z * c
    o.position.set(ex + xr, ey + y, ez + zr)
    o.scale.setScalar(1)
    o.lookAt(ex, ey, ez)
    o.updateMatrix()
    mesh.setMatrixAt(i, o.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
}

function distToSun(id: string): number {
  readPos(id, tmp, true)
  readPos('soleil', tmp2, true)
  return Math.hypot(tmp.x - tmp2.x, tmp.y - tmp2.y, tmp.z - tmp2.z) / AU
}

function clampComet(au: number): number {
  return Math.min(8, 1.2 / Math.max(0.15, au))
}
