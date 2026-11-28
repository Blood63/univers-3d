import * as THREE from 'three'
import { BODY_BY_ID, BODY_IDS, ORBIT_BY_ID, type BodyDef } from '../astro/catalog'
import { CONSTELLATIONS, STARS } from '../astro/stars'
import { BELT_STRIDE, displayRadius, helio as helioPos, readPos, sampleOrbit } from '../astro/ephemeris'
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
import { createCosmos } from './cosmos'
import { deferBitmap, followTexture, pumpGpuUploads, streamTextures } from '../engine/texcache'
import { requestMaps } from './textures'
import { requestCover, tileCacheCount, type QuadBody } from './quadtree'

const tmp = v3()
const tmp2 = v3()
const q = new THREE.Quaternion()
const qInv = new THREE.Quaternion()
const v = new THREE.Vector3()
const c3 = new THREE.Color()
const up = new THREE.Vector3(0, 1, 0)
const awayV = new THREE.Vector3()
const lookTarget = new THREE.Vector3()
const labelPool: { id: string; name: string; x: number; y: number; sub: string }[] = []
const labelView: { id: string; name: string; x: number; y: number; sub: string }[] = []

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
  const tileCache = new Map<string, THREE.Texture>()
  const tileWait = new Set<string>()
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
    if (id === 'io') return tex.io ?? proc.io
    if (id === 'europe') return tex.europa ?? proc.europe
    if (id === 'ganymede') return tex.ganymede ?? proc.ganymede
    if (id === 'callisto') return tex.callisto ?? proc.callisto
    if (id === 'encelade') return tex.enceladus ?? proc.encelade
    if (id === 'titan') return tex.titan ?? proc.titan
    if (id === 'haumea') return tex.haumea ?? blank
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
      uBH0: { value: new THREE.Vector3() },
      uBH1: { value: new THREE.Vector3() },
      uRs0: { value: 0 },
      uRs1: { value: 0 },
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
    uniforms: {
      uWarp: { value: 0 },
      uStreak: { value: new THREE.Vector2(0, 1) },
      uDensity: { value: 1 },
      uBH0: { value: new THREE.Vector3() },
      uBH1: { value: new THREE.Vector3() },
      uRs0: { value: 0 },
      uRs1: { value: 0 },
    },
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
  const catalogMat = starMat.clone()
  for (const key of ['uBH0', 'uBH1', 'uRs0', 'uRs1', 'uWarp', 'uStreak', 'uDensity'] as const) {
    catalogMat.uniforms[key] = starMat.uniforms[key]
  }
  const catalog = new THREE.Points(catGeo, catalogMat)
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
    const watchDay = (texKey: string) => {
      followTexture(texKey, (t) => {
        if (node.mat?.uniforms.uDay) node.mat.uniforms.uDay.value = t
      })
    }
    if (b.id === 'jupiter') watchDay('jupiter')
    else if (b.id === 'saturne') watchDay('saturn')
    else if (b.id === 'mars') watchDay('mars')
    else if (b.id === 'venus') watchDay('venus')
    else if (b.id === 'mercure') watchDay('mercury')
    else if (b.id === 'uranus') watchDay('uranus')
    else if (b.id === 'neptune') watchDay('neptune')
    else if (b.id === 'lune') watchDay('moon')
    else if (b.id === 'io') watchDay('io')
    else if (b.id === 'europe') watchDay('europa')
    else if (b.id === 'ganymede') watchDay('ganymede')
    else if (b.id === 'callisto') watchDay('callisto')
    else if (b.id === 'encelade') watchDay('enceladus')
    else if (b.id === 'titan') watchDay('titan')
    else if (b.id === 'haumea') watchDay('haumea')
    else if (b.id === 'terre') {
      followTexture('earth', (t) => {
        if (node.mat?.uniforms.uDay) node.mat.uniforms.uDay.value = t
      })
      followTexture('earthNight', (t) => {
        if (node.mat?.uniforms.uNight) node.mat.uniforms.uNight.value = t
      })
      followTexture('earthCloud', (t) => {
        if (node.mat?.uniforms.uCloud) node.mat.uniforms.uCloud.value = t
      })
      followTexture('earthNormal', (t) => {
        if (node.mat?.uniforms.uNormal) node.mat.uniforms.uNormal.value = t
      })
    }
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
          uNormal: { value: tex.earthNormal ?? blank },
          uHasNight: { value: b.id === 'terre' ? 1 : 0 },
          uHasSpec: { value: b.id === 'terre' ? 1 : 0 },
          uHasCloud: { value: b.id === 'terre' ? 1 : 0 },
          uHasNormal: { value: b.id === 'terre' ? 1 : 0 },
          uCloudLum: { value: b.id === 'terre' ? 1 : 0 },
          uOcc: { value: new THREE.Vector3() },
          uOccR: { value: 1 },
          uHasOcc: { value: 0 },
          uTile: { value: blank },
          uTileOff: { value: new THREE.Vector2() },
          uTileScale: { value: new THREE.Vector2(4, 2) },
          uTileBlend: { value: 0 },
          uMerc: { value: 0 },
          uTileZ: { value: 1 },
          uTileXY: { value: new THREE.Vector2() },
          uCloudOff: { value: 0 },
          uTime: { value: 0 },
          uAurora: { value: b.flags?.includes('aurora') ? 1 : 0 },
          uCenter: { value: new THREE.Vector3() },
          uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
          uRingInner: { value: 1.2 },
          uRingOuter: { value: 2.3 },
          uHasRing: { value: b.flags?.includes('rings') || b.flags?.includes('rings-thin') ? 1 : 0 },
          uGRS: { value: b.id === 'jupiter' ? 1 : 0 },
          uClose: { value: 0 },
          uRegolith: { value: b.flags?.includes('regolith') ? 1 : 0 },
          uFlow: { value: b.flags?.includes('flow') ? 0.04 : 0 },
          uTwoTone: { value: b.flags?.includes('twotone') ? 1 : 0 },
          uHex: { value: b.flags?.includes('hexagon') ? 1 : 0 },
          uMoon0: { value: new THREE.Vector3() },
          uMoon1: { value: new THREE.Vector3() },
          uMoon2: { value: new THREE.Vector3() },
          uMoonR0: { value: 1 },
          uMoonR1: { value: 1 },
          uMoonR2: { value: 1 },
          uMoonN: { value: 0 },
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
        const inner = b.flags?.includes('rings-thin') ? 1.42 : b.id === 'uranus' ? 1.5 : 1.15
        const outer = b.flags?.includes('rings-thin') ? 1.72 : b.id === 'uranus' ? 2.0 : 2.32
        const geo = new THREE.RingGeometry(inner, outer, 160, 4)
        const rm = new THREE.ShaderMaterial({
          uniforms: {
            uSun: { value: new THREE.Vector3() },
            uPlanet: { value: new THREE.Vector3() },
            uPlanetR: { value: 1 },
            uInner: { value: inner },
            uOuter: { value: outer },
            uRing: { value: tex.saturnRing ?? blank },
            uTint: { value: new THREE.Color(b.flags?.includes('rings-thin') ? '#d5dde8' : b.id === 'uranus' ? '#9fd0d4' : '#efe2c9') },
            uSparkle: { value: 0 },
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
      if (b.flags?.includes('void') || b.flags?.includes('horizon')) mesh.scale.setScalar(0.15)
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
    if (b.flags?.includes('ellipsoid') && node.mesh instanceof THREE.Mesh) {
      const ay = 513 / 1161
      const az = 852 / 1161
      const geo = new THREE.SphereGeometry(1, seg, Math.max(12, Math.floor(seg / 2)))
      const pos = geo.getAttribute('position')
      const nrm = geo.getAttribute('normal')
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const y = pos.getY(i) * ay
        const z = pos.getZ(i) * az
        pos.setXYZ(i, x, y, z)
        const nx = x
        const ny = y / (ay * ay)
        const nz = z / (az * az)
        const len = Math.hypot(nx, ny, nz) || 1
        nrm.setXYZ(i, nx / len, ny / len, nz / len)
      }
      pos.needsUpdate = true
      nrm.needsUpdate = true
      geo.computeBoundingSphere()
      node.mesh.geometry = geo
    }
    if (b.flags?.includes('bilobe')) {
      const lobe = new THREE.Mesh(sphere, node.mat ?? new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.92 }))
      lobe.position.x = 0.7
      lobe.scale.setScalar(0.68)
      group.add(lobe)
    }
    if (b.flags?.includes('irregular') && node.mesh && b.kind !== 'galaxy') node.mesh.scale.set(1.4, 0.82, 1.08)
    if (b.flags?.includes('globular')) {
      const count = sim.quality === 'low' ? 1800 : 7000
      const pos = new Float32Array(count * 3)
      const col = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        const u = Math.random()
        const v = Math.random()
        const th = u * Math.PI * 2
        const ph = Math.acos(2 * v - 1)
        const rad = Math.pow(Math.random(), 0.45) * 0.95
        pos[i * 3] = rad * Math.sin(ph) * Math.cos(th)
        pos[i * 3 + 1] = rad * Math.sin(ph) * Math.sin(th)
        pos[i * 3 + 2] = rad * Math.cos(ph)
        const warm = Math.random()
        col[i * 3] = 0.85 + warm * 0.15
        col[i * 3 + 1] = 0.75 + warm * 0.1
        col[i * 3 + 2] = 0.55
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.4, vertexColors: true, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false }))
      group.add(pts)
    }
    if (b.flags?.includes('collision') && node.mesh) {
      const twin = node.mesh.clone()
      twin.position.x = 0.85
      twin.scale.setScalar(0.72)
      group.add(twin)
      const tail = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 1.4, 8),
        new THREE.MeshBasicMaterial({ color: '#f2d2ff', transparent: true, opacity: 0.45, depthWrite: false }),
      )
      tail.rotation.z = Math.PI / 2
      tail.position.x = 1.5
      group.add(tail)
    }
    if (b.flags?.includes('dustlane')) {
      const lane = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.04, 0.35),
        new THREE.MeshBasicMaterial({ color: '#1a120c' }),
      )
      lane.rotation.z = 0.4
      group.add(lane)
    }
    if (b.flags?.includes('ringgal') && node.mesh) node.mesh.scale.set(1, 1, 1)
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
  const orbitIds = ['mercure', 'venus', 'terre', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune', 'pluton', 'ceres', 'eris', 'haumea', 'makemake']
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
  for (const id of ['voyager1', 'voyager2', 'newhorizons', 'pioneer10', 'pioneer11']) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(181 * 3), 3))
    geo.setDrawRange(0, 0)
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
  helio.scale.set(1.08, 0.84, 1.55)
  root.add(helio)
  const shock = new THREE.Mesh(
    new THREE.SphereGeometry(90 * AU, 32, 16),
    new THREE.MeshBasicMaterial({ color: '#b7d4ff', transparent: true, opacity: 0.045, wireframe: true, depthWrite: false }),
  )
  shock.scale.set(1.02, 0.9, 1.25)
  root.add(shock)
  const cosmos = createCosmos(tex.cmb)
  root.add(cosmos.object)
  const navMats: THREE.MeshStandardMaterial[] = []
  root.traverse((obj) => {
    if (obj.name === 'navlight') {
      const mesh = obj as THREE.Mesh
      if (!Array.isArray(mesh.material)) navMats.push(mesh.material as THREE.MeshStandardMaterial)
    }
  })
  const grid = new THREE.PolarGridHelper(40 * AU, 8, 24, 64, '#3a4a66', '#243044')
  grid.rotation.x = Math.PI / 2
  root.add(grid)
  const galGrid = new THREE.PolarGridHelper(700, 5, 12, 36, '#8a7344', '#4a3b28')
  galGrid.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(galN.x, galN.y, galN.z))
  galGrid.frustumCulled = false
  root.add(galGrid)

  const earthGroup = nodes.get('terre')?.group
  const trackN = 181
  const trackGeo = new THREE.BufferGeometry()
  trackGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trackN * 3), 3))
  const groundTrack = new THREE.Line(
    trackGeo,
    new THREE.LineBasicMaterial({ color: '#f0c27a', transparent: true, opacity: 0.92 }),
  )
  groundTrack.frustumCulled = false
  groundTrack.renderOrder = 2
  earthGroup?.add(groundTrack)
  const trackQ = new THREE.Quaternion()
  const qTilt = new THREE.Quaternion()
  const qSpin = new THREE.Quaternion()
  const axisY = new THREE.Vector3(0, 1, 0)
  const axisZ = new THREE.Vector3(0, 0, 1)
  const relV = new THREE.Vector3()

  const debrisN = 420
  const debrisPos = new Float32Array(debrisN * 3)
  const debrisGeo = new THREE.BufferGeometry()
  debrisGeo.setAttribute('position', new THREE.BufferAttribute(debrisPos, 3))
  const debrisPts = new THREE.Points(
    debrisGeo,
    new THREE.PointsMaterial({ color: '#ff6a4a', size: 18, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false }),
  )
  debrisPts.frustumCulled = false
  root.add(debrisPts)
  const debrisEl = Array.from({ length: debrisN }, (_, i) => ({
    alt: 350e3 + ((i * 97) % 900) * 1e3,
    inc: ((i % 9) / 8) * 1.4 + 0.15,
    node: (i * 0.37) % (Math.PI * 2),
    phase: (i * 1.7) % (Math.PI * 2),
    rate: 0.0011 + (i % 5) * 0.00015,
  }))

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
    pumpGpuUploads()
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

    skyMat.uniforms.uFade.value = sim.echelle <= 3 ? 0.04 : sim.echelle <= 5 ? 0.45 : 0.9
    readPos('mw', tmp2, false)
    const gcx = tmp2.x - cam64[0]
    const gcy = tmp2.y - cam64[1]
    const gcz = tmp2.z - cam64[2]
    const gdist = Math.hypot(gcx, gcy, gcz)
    const inside = gdist < 45000 * LY
    sky.visible = inside && sim.echelle > 3

    let shownBodies = 0
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
        if (sim.altitude < 80 * AU && id !== sim.selected && id !== sim.target) node.group.visible = false
        else if (b.kind !== 'blackhole') node.group.visible = id === 'mw' ? !inside : true
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
        if (b.flags?.includes('rings') || b.flags?.includes('rings-thin')) {
          up.set(0, 1, 0).applyQuaternion(node.group.quaternion)
          node.mat.uniforms.uRingNormal.value.copy(up)
          const thin = b.flags?.includes('rings-thin')
          node.mat.uniforms.uRingInner.value = r * (thin ? 1.42 : b.id === 'uranus' ? 1.5 : 1.15)
          node.mat.uniforms.uRingOuter.value = r * (thin ? 1.72 : b.id === 'uranus' ? 2.0 : 2.32)
        }
        if (node.mat.uniforms.uClose) {
          const ratio = dist / Math.max(r, 1)
          const edge = ratio < 1.2 ? 1 : ratio > 3 ? 0 : (3 - ratio) / 1.8
          node.mat.uniforms.uClose.value = edge
        }
        if (node.mat.uniforms.uTileBlend && (id === 'terre' || id === 'lune' || id === 'mars')) {
          const ratio = dist / Math.max(r, 1)
          if (ratio > 2.6 || sim.hidden) node.mat.uniforms.uTileBlend.value = 0
          else {
            qInv.copy(node.group.quaternion).invert()
            v.set(-node.group.position.x, -node.group.position.y, -node.group.position.z).applyQuaternion(qInv)
            const vl = v.length() || 1
            const theta = Math.acos(Math.max(-1, Math.min(1, v.y / vl)))
            let phi = Math.atan2(v.z, -v.x)
            if (phi < 0) phi += Math.PI * 2
            const uu = phi / (Math.PI * 2)
            const vv = 1 - theta / Math.PI
            const quadName: QuadBody = id === 'terre' ? 'earth' : id === 'lune' ? 'moon' : 'mars'
            const remote = requestCover(quadName, uu, vv, ratio, sim.quality === 'low')
            const blend = ratio < 1.1 ? 1 : (2.6 - ratio) / 1.5
            if (remote) {
              node.mat.uniforms.uTile.value = remote.tex
              node.mat.uniforms.uMerc.value = remote.merc
              node.mat.uniforms.uTileZ.value = remote.z
              ;(node.mat.uniforms.uTileXY.value as THREE.Vector2).set(remote.x, remote.y)
              ;(node.mat.uniforms.uTileOff.value as THREE.Vector2).set(remote.offU, remote.offV)
              ;(node.mat.uniforms.uTileScale.value as THREE.Vector2).set(remote.scaleU, remote.scaleV)
              node.mat.uniforms.uTileBlend.value = blend
            } else {
              const col = Math.min(3, Math.max(0, Math.floor(uu * 4)))
              const row = vv >= 0.5 ? 0 : 1
              const key = `${quadName}/${col}_${row}`
              let tile = tileCache.get(key)
              if (!tile && !tileWait.has(key)) {
                tileWait.add(key)
                deferBitmap(
                  `${import.meta.env.BASE_URL}textures/tiles/${quadName}/${col}_${row}.jpg`,
                  (bitmap) => {
                    const t = new THREE.Texture(bitmap)
                    t.flipY = false
                    t.colorSpace = THREE.SRGBColorSpace
                    t.anisotropy = 8
                    t.wrapS = THREE.ClampToEdgeWrapping
                    t.wrapT = THREE.ClampToEdgeWrapping
                    t.generateMipmaps = true
                    t.minFilter = THREE.LinearMipmapLinearFilter
                    t.needsUpdate = true
                    tileCache.set(key, t)
                    tileWait.delete(key)
                  },
                  () => tileWait.delete(key),
                )
              }
              if (tile) {
                node.mat.uniforms.uTile.value = tile
                node.mat.uniforms.uMerc.value = 0
                ;(node.mat.uniforms.uTileOff.value as THREE.Vector2).set(col / 4, row === 0 ? 0.5 : 0)
                ;(node.mat.uniforms.uTileScale.value as THREE.Vector2).set(4, 2)
                node.mat.uniforms.uTileBlend.value = blend * 0.85
              } else node.mat.uniforms.uTileBlend.value = 0
            }
            sim.tileCount = tileCacheCount() + tileCache.size
          }
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
        const angR = 2 * Math.atan(r / Math.max(dist, 1))
        const pxR = (angR / ((sim.fov * Math.PI) / 180)) * Math.max(h, 1)
        if (node.ringMat.uniforms.uSparkle) node.ringMat.uniforms.uSparkle.value = pxR > 80 ? 1 : 0
      }
      if (node.mesh && (b.kind === 'planet' || b.kind === 'moon' || b.kind === 'dwarf' || b.kind === 'star')) {
        const ang = 2 * Math.atan(r / Math.max(dist, 1))
        const px = (ang / ((sim.fov * Math.PI) / 180)) * Math.max(h, 1)
        const showMesh = px > 1.6
        node.mesh.visible = showMesh
        if (node.rings) node.rings.visible = px > 5
        if (node.atmo && node.atmoMat?.uniforms.uRadius) node.atmo.visible = px > 7
        if (node.atmo && !node.atmoMat?.uniforms.uRadius) node.atmo.visible = px > 40
        if (node.clouds) node.clouds.visible = px > 6
        if (node.glow) {
          const mat = node.glow.material as THREE.SpriteMaterial
          const wide = sim.echelle <= 3
          node.glow.visible = !wide && !showMesh && (px > 0.4 || id === sim.selected)
          mat.opacity = wide ? 0 : 0.9
          if (!wide) {
            const angPx = (10 / Math.max(h, 1)) * ((sim.fov * Math.PI) / 180)
            const minS = Math.max(r * 2.2, dist * Math.tan(angPx))
            node.glow.scale.setScalar(Math.min(minS, r * 6) / Math.max(node.group.scale.x, 1e-6))
          }
        }
        if (id === 'soleil' && sim.echelle <= 3) node.group.visible = false
        if (showMesh && px > 12 && (id === sim.selected || id === sim.nearestId)) requestMaps(id)
      }
      if (sim.echelle >= 8 && sim.selected === 'cmb') requestMaps('cmb')
      if (b.kind === 'galaxy') {
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
        awayV.copy(sunRender).sub(node.group.position)
        if (awayV.lengthSq() < 1) awayV.set(0, 0, 1)
        awayV.normalize()
        const sunDist = Math.max(0.2, distToSun(id))
        const stretch = clampComet(sunDist)
        for (const tail of [dust, ion]) {
          if (!tail) continue
          tail.position.copy(awayV).multiplyScalar(stretch * (tail.name === 'ion' ? 4.2 : 2.6))
          lookTarget.copy(node.group.position).add(awayV)
          tail.lookAt(lookTarget)
          tail.scale.set(tail.name === 'ion' ? 0.7 : 1.15, tail.name === 'ion' ? stretch * 1.4 : stretch, tail.name === 'ion' ? 0.7 : 1.15)
        }
        if (node.glow) node.glow.scale.setScalar(2.4 + stretch)
      }
      if (b.kind === 'craft' || b.kind === 'constellation' || b.kind === 'comet') {
        const angC = 2 * Math.atan(Math.max(r, 12) / Math.max(dist, 1))
        const pxC = (angC / ((sim.fov * Math.PI) / 180)) * Math.max(h, 1)
        node.group.visible = pxC > 1.3 || id === sim.selected || id === sim.nearestId
        if (id === 'iss' && (id === sim.selected || id === sim.target)) requestMaps('terre')
      }
      if (b.kind === 'nebula') {
        const angN = 2 * Math.atan(r / Math.max(dist, 1))
        const pxN = (angN / ((sim.fov * Math.PI) / 180)) * Math.max(h, 1)
        node.group.visible = (sim.echelle >= 5 && pxN > 2.5) || id === sim.selected
      }
      if (id === 'parker') {
        const shield = node.group.getObjectByName('heatshield') as THREE.Mesh | undefined
        const mat = shield && !Array.isArray(shield.material) ? (shield.material as THREE.MeshStandardMaterial) : undefined
        if (mat) mat.emissiveIntensity = distToSun(id) < 0.28 ? 2.4 : 0.12
      }
      if (node.mat?.uniforms.uHasOcc && b.kind === 'moon' && b.parent) {
        const parent = nodes.get(b.parent)
        if (parent) {
          ;(node.mat.uniforms.uOcc.value as THREE.Vector3).copy(parent.group.position)
          node.mat.uniforms.uOccR.value = parent.group.scale.x
          node.mat.uniforms.uHasOcc.value = 1
        }
      }
      if (node.group.visible) shownBodies += 1
    }
    const jupMat = nodes.get('jupiter')?.mat
    const satMat = nodes.get('saturne')?.mat
    if (jupMat?.uniforms.uMoonN) {
      jupMat.uniforms.uMoonN.value = 3
      const io = nodes.get('io')
      const eu = nodes.get('europe')
      const ga = nodes.get('ganymede')
      if (io) {
        ;(jupMat.uniforms.uMoon0.value as THREE.Vector3).copy(io.group.position)
        jupMat.uniforms.uMoonR0.value = io.group.scale.x
      }
      if (eu) {
        ;(jupMat.uniforms.uMoon1.value as THREE.Vector3).copy(eu.group.position)
        jupMat.uniforms.uMoonR1.value = eu.group.scale.x
      }
      if (ga) {
        ;(jupMat.uniforms.uMoon2.value as THREE.Vector3).copy(ga.group.position)
        jupMat.uniforms.uMoonR2.value = ga.group.scale.x
      }
    }
    if (satMat?.uniforms.uMoonN) {
      satMat.uniforms.uMoonN.value = 3
      const ti = nodes.get('titan')
      const rh = nodes.get('rhea')
      const en = nodes.get('encelade')
      if (ti) {
        ;(satMat.uniforms.uMoon0.value as THREE.Vector3).copy(ti.group.position)
        satMat.uniforms.uMoonR0.value = ti.group.scale.x
      }
      if (rh) {
        ;(satMat.uniforms.uMoon1.value as THREE.Vector3).copy(rh.group.position)
        satMat.uniforms.uMoonR1.value = rh.group.scale.x
      }
      if (en) {
        ;(satMat.uniforms.uMoon2.value as THREE.Vector3).copy(en.group.position)
        satMat.uniforms.uMoonR2.value = en.group.scale.x
      }
    }
    sim.activeBodies = shownBodies
    const blink = Math.sin(time * 5.2) > 0 ? 7 : 0.15
    for (let i = 0; i < navMats.length; i++) navMats[i].emissiveIntensity = blink

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
      sim.echelle >= 3 &&
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
    for (const id of ['voyager1', 'voyager2', 'newhorizons', 'pioneer10', 'pioneer11']) {
      const line = pathLines[id]
      const data = probePaths[id]
      line.visible = sim.layers.trajectories && !!data && (sim.echelle >= 3 || id === sim.selected)
      if (!data) continue
      let attr = line.geometry.attributes.position as THREE.BufferAttribute | undefined
      if (!attr || attr.array.length < data.length) {
        line.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.length), 3))
        attr = line.geometry.attributes.position as THREE.BufferAttribute
      }
      const arr = attr.array as Float32Array
      line.geometry.setDrawRange(0, data.length / 3)
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

    const sgr = nodes.get('sgr-a')
    const cyg = nodes.get('cyg-x1')
    if (sgr && cyg) {
      const p0 = starMat.uniforms.uBH0.value as THREE.Vector3
      const p1 = starMat.uniforms.uBH1.value as THREE.Vector3
      p0.copy(sgr.group.position)
      p1.copy(cyg.group.position)
      const rs0 = (sgr.mat?.uniforms.uRs?.value as number) || 0
      const rs1 = (cyg.mat?.uniforms.uRs?.value as number) || 0
      starMat.uniforms.uRs0.value = rs0
      starMat.uniforms.uRs1.value = rs1
      ;(skyMat.uniforms.uBH0.value as THREE.Vector3).copy(p0)
      ;(skyMat.uniforms.uBH1.value as THREE.Vector3).copy(p1)
      skyMat.uniforms.uRs0.value = rs0
      skyMat.uniforms.uRs1.value = rs1
    }
    groundTrack.visible = sim.layers.groundTrack
    if (sim.layers.groundTrack) {
      const attr = trackGeo.attributes.position as THREE.BufferAttribute
      const arr = attr.array as Float32Array
      const periodDays = (92.68 * 60) / 86400
      const tilt = (23.439 * Math.PI) / 180
      const sid = 86164.0905
      for (let i = 0; i < trackN; i++) {
        const t = sim.jd + (periodDays * i) / (trackN - 1)
        helioPos('iss', t, tmp)
        const ix = tmp.x
        const iy = tmp.y
        const iz = tmp.z
        helioPos('terre', t, tmp)
        const spin = ((t - J2000) * 86400 / sid) * TAU
        qTilt.setFromAxisAngle(axisZ, tilt)
        qSpin.setFromAxisAngle(axisY, spin)
        trackQ.copy(qTilt).multiply(qSpin).invert()
        relV.set(ix - tmp.x, iy - tmp.y, iz - tmp.z).applyQuaternion(trackQ).normalize().multiplyScalar(1.012)
        arr[i * 3] = relV.x
        arr[i * 3 + 1] = relV.y
        arr[i * 3 + 2] = relV.z
      }
      attr.needsUpdate = true
    }
    galGrid.visible = sim.layers.galactic
    debrisPts.visible = sim.layers.debris && Math.hypot(ex, ey, ez) < 6e7
    if (debrisPts.visible) {
      const er = displayRadius('terre')
      const lift = er / 6.371e6
      const attr = debrisGeo.attributes.position as THREE.BufferAttribute
      const arr = attr.array as Float32Array
      for (let i = 0; i < debrisN; i++) {
        const el = debrisEl[i]
        const ang = el.phase + years * el.rate * 800
        const rad = er + el.alt * lift
        const ci = Math.cos(el.inc)
        const x = rad * Math.cos(ang) * ci
        const z = rad * Math.sin(ang) * ci
        const y = rad * Math.sin(el.inc) * Math.sin(ang)
        const c = Math.cos(el.node)
        const s = Math.sin(el.node)
        arr[i * 3] = ex + x * c - z * s
        arr[i * 3 + 1] = ey + y
        arr[i * 3 + 2] = ez + x * s + z * c
      }
      attr.needsUpdate = true
    }

    hz.position.set(-cam64[0], -cam64[1], -cam64[2])
    helio.position.copy(hz.position)
    shock.position.copy(hz.position)
    grid.position.copy(hz.position)
    hz.visible = sim.layers.habitable
    helio.visible = sim.layers.heliosphere
    shock.visible = sim.layers.heliosphere
    const sunDistM = Math.hypot(cam64[0], cam64[1], cam64[2])
    cosmos.update(sim.echelle, sunDistM)
    streamTextures(sunDistM / LY)
    grid.visible = sim.layers.ecliptic && (sim.band === 'systeme' || sim.scaleMode === 'orrery')

    labelAcc += dt
    if (labelAcc > 0.12) {
      labelAcc = 0
      labelView.length = 0
      const consider = (id: string) => {
        if (!id || !BODY_BY_ID[id]) return
        if (!sim.layers.labels && id !== sim.selected) return
        for (let i = 0; i < labelView.length; i++) if (labelView[i].id === id) return
        readPos(id, tmp, true)
        v.set(tmp.x - cam64[0], tmp.y - cam64[1], tmp.z - cam64[2])
        v.project(camera)
        if (v.z > 1) return
        const x = (v.x * 0.5 + 0.5) * w
        const y = (-v.y * 0.5 + 0.5) * h
        if (id !== sim.selected) {
          for (let i = 0; i < labelView.length; i++) {
            const dx = labelView[i].x - x
            const dy = labelView[i].y - y
            if (dx * dx + dy * dy < 28 * 28) return
          }
        }
        const slot = labelPool[labelView.length] ?? { id: '', name: '', x: 0, y: 0, sub: '' }
        if (!labelPool[labelView.length]) labelPool.push(slot)
        slot.id = id
        slot.name = BODY_BY_ID[id].name
        slot.x = x
        slot.y = y
        slot.sub = id === sim.selected ? 'sélection' : ''
        labelView.push(slot)
      }
      consider(sim.selected)
      consider(sim.nearestId)
      consider('soleil')
      if (sim.layers.labels) {
        const e = sim.echelle
        if (e <= 4) {
          consider('terre')
          consider('lune')
          consider('mars')
          consider('jupiter')
          consider('saturne')
          consider('iss')
          consider('voyager1')
        } else if (e <= 7) {
          consider('proxima')
          consider('m45')
          consider('omega-cen')
          consider('sgr-a')
        } else if (e <= 9) {
          consider('m31')
          consider('m87')
          consider('laniakea')
          consider('cena')
        } else {
          consider('cmb')
          consider('mur-hercule')
          consider('vide-bouvier')
        }
      }
      labelFrame.items = labelView
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
