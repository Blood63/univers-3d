import * as THREE from 'three'
import { readPos } from '../astro/ephemeris'
import { AU, LY } from '../astro/math'
import { cam64, sim } from '../engine/state'
import { followTexture } from '../engine/texcache'
import { v3 } from '../astro/math'

const GLY = 1e9 * LY
const pa = v3()
const pb = v3()

export interface Cosmos {
  update: (echelle: number, sunDistM: number) => void
  object: THREE.Group
}

function hash3(ix: number, iy: number, iz: number): number {
  let h = (ix * 374761393 + iy * 668265263 + iz * 2147483647) | 0
  h = (h ^ (h >>> 13)) | 0
  h = Math.imul(h, 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function createCosmos(cmbMap?: THREE.Texture): Cosmos {
  const root = new THREE.Group()
  root.name = 'cosmos'
  const q = sim.quality
  const oortN = q === 'low' ? 700 : q === 'ultra' ? 4200 : 2200
  const sectorN = q === 'low' ? 500 : q === 'ultra' ? 2400 : 1400
  const webN = q === 'low' ? 500 : q === 'ultra' ? 6500 : 2800

  const oortWorld = new Float64Array(oortN * 3)
  const oortPos = new Float32Array(oortN * 3)
  const oortCol = new Float32Array(oortN * 3)
  for (let i = 0; i < oortN; i++) {
    const u = hash3(i, 3, 1)
    const v = hash3(i, 9, 2)
    const w = hash3(i, 5, 4)
    const ra = u * Math.PI * 2
    const dec = Math.asin(2 * v - 1)
    const au = 2000 + Math.pow(w, 0.55) * 48000
    const r = au * AU
    const cp = Math.cos(dec)
    oortWorld[i * 3] = r * cp * Math.cos(ra)
    oortWorld[i * 3 + 1] = r * Math.sin(dec) * 0.92
    oortWorld[i * 3 + 2] = r * cp * Math.sin(ra)
    const ice = 0.75 + hash3(i, 2, 8) * 0.25
    oortCol[i * 3] = ice * 0.85
    oortCol[i * 3 + 1] = ice * 0.9
    oortCol[i * 3 + 2] = ice
  }
  const oortGeo = new THREE.BufferGeometry()
  oortGeo.setAttribute('position', new THREE.BufferAttribute(oortPos, 3))
  oortGeo.setAttribute('color', new THREE.BufferAttribute(oortCol, 3))
  const oort = new THREE.Points(
    oortGeo,
    new THREE.PointsMaterial({ size: 1.6, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: false }),
  )
  oort.frustumCulled = false
  root.add(oort)

  const sectorWorld = new Float64Array(sectorN * 3)
  const sectorPos = new Float32Array(sectorN * 3)
  const sectorCol = new Float32Array(sectorN * 3)
  const sectorGeo = new THREE.BufferGeometry()
  sectorGeo.setAttribute('position', new THREE.BufferAttribute(sectorPos, 3))
  sectorGeo.setAttribute('color', new THREE.BufferAttribute(sectorCol, 3))
  const sector = new THREE.Points(
    sectorGeo,
    new THREE.PointsMaterial({ size: 2.1, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: false }),
  )
  sector.frustumCulled = false
  root.add(sector)
  let sectorAnchorX = Number.NaN
  let sectorAnchorY = 0
  let sectorAnchorZ = 0

  const webWorld = new Float64Array(webN * 3)
  const webPos = new Float32Array(webN * 3)
  const webCol = new Float32Array(webN * 3)
  const strands = 18
  for (let i = 0; i < webN; i++) {
    const strand = i % strands
    const along = (Math.floor(i / strands) / Math.ceil(webN / strands)) * 2 - 1
    const ang = (strand / strands) * Math.PI * 2 + along * 0.6
    const rad = (0.35 + (strand % 5) * 0.22) * (1 - Math.abs(along) * 0.25)
    const wob = hash3(i, strand, 1) - 0.5
    const x = Math.cos(ang) * rad * 7 + wob * 0.35
    const z = Math.sin(ang) * rad * 7 + (hash3(strand, i, 2) - 0.5) * 0.35
    const y = along * 5.5 + Math.sin(ang * 2 + along * 8) * 0.55
    webWorld[i * 3] = x * GLY
    webWorld[i * 3 + 1] = y * GLY * 0.7
    webWorld[i * 3 + 2] = z * GLY
    const core = Math.abs(wob) < 0.08
    webCol[i * 3] = core ? 0.95 : 0.4 + (strand % 3) * 0.15
    webCol[i * 3 + 1] = core ? 0.78 : 0.55
    webCol[i * 3 + 2] = core ? 0.42 : 0.9
  }
  const webGeo = new THREE.BufferGeometry()
  webGeo.setAttribute('position', new THREE.BufferAttribute(webPos, 3))
  webGeo.setAttribute('color', new THREE.BufferAttribute(webCol, 3))
  const web = new THREE.Points(
    webGeo,
    new THREE.PointsMaterial({ size: 2.4, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: false }),
  )
  web.frustumCulled = false
  root.add(web)

  const cmb = new THREE.Mesh(
    new THREE.SphereGeometry(520, 48, 32),
    new THREE.ShaderMaterial({
      uniforms: {
        uAlpha: { value: 0 },
        uMap: { value: cmbMap ?? new THREE.Texture() },
        uHasMap: { value: cmbMap ? 1 : 0 },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        varying vec3 vDir;
        uniform float uAlpha;
        uniform sampler2D uMap;
        uniform float uHasMap;
        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }
        float n3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n000 = hash(i);
          float n100 = hash(i + vec3(1.0, 0.0, 0.0));
          float n010 = hash(i + vec3(0.0, 1.0, 0.0));
          float n110 = hash(i + vec3(1.0, 1.0, 0.0));
          float n001 = hash(i + vec3(0.0, 0.0, 1.0));
          float n101 = hash(i + vec3(1.0, 0.0, 1.0));
          float n011 = hash(i + vec3(0.0, 1.0, 1.0));
          float n111 = hash(i + vec3(1.0, 1.0, 1.0));
          float nx00 = mix(n000, n100, f.x);
          float nx10 = mix(n010, n110, f.x);
          float nx01 = mix(n001, n101, f.x);
          float nx11 = mix(n011, n111, f.x);
          return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
        }
        void main() {
          vec3 d = normalize(vDir);
          float a = n3(d * 9.0);
          float b = n3(d * 22.0 + 4.0);
          vec3 cold = vec3(0.05, 0.18, 0.55);
          vec3 mid = vec3(0.08, 0.55, 0.32);
          vec3 hot = vec3(0.85, 0.22, 0.12);
          vec3 col = mix(cold, mid, smoothstep(0.35, 0.62, a));
          col = mix(col, hot, smoothstep(0.58, 0.86, b));
          col += vec3(0.55, 0.85, 0.25) * smoothstep(0.72, 0.9, a) * 0.35;
          float lon = atan(d.z, d.x);
          float lat = asin(clamp(d.y, -1.0, 1.0));
          vec2 muv = vec2(lon / 6.2831853 + 0.5, 0.5 - lat / 3.1415926);
          vec3 mapped = texture2D(uMap, muv).rgb;
          col = mix(col, mapped, uHasMap);
          gl_FragColor = vec4(col, uAlpha);
          #include <logdepthbuf_fragment>
        }
      `,
    }),
  )
  cmb.frustumCulled = false
  root.add(cmb)
  const cmbMat = cmb.material as THREE.ShaderMaterial
  followTexture('cmb', (t) => {
    cmbMat.uniforms.uMap.value = t
    cmbMat.uniforms.uHasMap.value = 1
  })

  const streamArr = new Float32Array(6)
  const streamGeo = new THREE.BufferGeometry()
  streamGeo.setAttribute('position', new THREE.BufferAttribute(streamArr, 3))
  const stream = new THREE.Line(
    streamGeo,
    new THREE.LineBasicMaterial({ color: '#f0c27a', transparent: true, opacity: 0.4 }),
  )
  stream.frustumCulled = false
  root.add(stream)

  const shellPoint = (world: Float64Array, arr: Float32Array, count: number) => {
    for (let i = 0; i < count; i++) {
      const dx = world[i * 3] - cam64[0]
      const dy = world[i * 3 + 1] - cam64[1]
      const dz = world[i * 3 + 2] - cam64[2]
      const dist = Math.hypot(dx, dy, dz) || 1
      const shell = Math.min(dist, 4.5e5)
      const k = shell / dist
      arr[i * 3] = dx * k
      arr[i * 3 + 1] = dy * k
      arr[i * 3 + 2] = dz * k
    }
  }

  const update = (echelle: number, sunDistM: number) => {
    const ly = sunDistM / LY
    const au = sunDistM / AU
    const showOort = sim.layers.oort && echelle >= 3 && echelle <= 6 && au > 80
    oort.visible = showOort
    if (showOort) {
      shellPoint(oortWorld, oortPos, oortN)
      ;(oortGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true
      const edge = echelle >= 5 ? 0.28 : 0.9
      ;(oort.material as THREE.PointsMaterial).opacity = edge
    }

    const showSector = echelle >= 5 && echelle <= 7
    sector.visible = showSector
    if (showSector) {
      const moved = Math.hypot(cam64[0] - sectorAnchorX, cam64[1] - sectorAnchorY, cam64[2] - sectorAnchorZ)
      if (!(moved < 0.35 * LY)) {
        sectorAnchorX = cam64[0]
        sectorAnchorY = cam64[1]
        sectorAnchorZ = cam64[2]
        const cellLy = 4
        const cx = Math.floor(cam64[0] / (cellLy * LY))
        const cy = Math.floor(cam64[1] / (cellLy * LY))
        const cz = Math.floor(cam64[2] / (cellLy * LY))
        for (let i = 0; i < sectorN; i++) {
          const gx = cx + ((i * 13) % 7) - 3
          const gy = cy + ((i * 7) % 5) - 2
          const gz = cz + ((i * 17) % 7) - 3
          const h = hash3(gx, gy, gz + i)
          sectorWorld[i * 3] = (gx + h) * cellLy * LY
          sectorWorld[i * 3 + 1] = (gy + hash3(gz, gx, gy)) * cellLy * LY * 0.18
          sectorWorld[i * 3 + 2] = (gz + hash3(gy, gz, gx)) * cellLy * LY
          const hot = h > 0.72
          sectorCol[i * 3] = hot ? 0.62 : 1
          sectorCol[i * 3 + 1] = hot ? 0.75 : 0.86
          sectorCol[i * 3 + 2] = hot ? 1 : 0.72
        }
        ;(sectorGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true
      }
      const attr = sectorGeo.attributes.position as THREE.BufferAttribute
      const arr = attr.array as Float32Array
      for (let i = 0; i < sectorN; i++) {
        const dx = sectorWorld[i * 3] - cam64[0]
        const dy = sectorWorld[i * 3 + 1] - cam64[1]
        const dz = sectorWorld[i * 3 + 2] - cam64[2]
        const dist = Math.hypot(dx, dy, dz) || 1
        const shell = Math.min(dist, 4.5e5)
        const k = shell / dist
        arr[i * 3] = dx * k
        arr[i * 3 + 1] = dy * k
        arr[i * 3 + 2] = dz * k
      }
      attr.needsUpdate = true
    }

    const showWeb = sim.layers.cosmicWeb && echelle >= 8
    web.visible = showWeb
    if (showWeb) {
      shellPoint(webWorld, webPos, webN)
      ;(webGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true
      ;(web.material as THREE.PointsMaterial).opacity = echelle === 8 ? 0.4 : echelle === 9 ? 0.72 : 0.95
    }

    const cmbMat = cmb.material as THREE.ShaderMaterial
    const cmbIn = ly / 1e9
    const alpha = cmbIn < 8 ? 0 : Math.min(0.92, (cmbIn - 8) / 18)
    cmbMat.uniforms.uAlpha.value = alpha
    cmb.visible = alpha > 0.02

    const showStream = echelle >= 6 && echelle <= 7
    stream.visible = showStream
    if (showStream) {
      readPos('lmc', pa, true)
      readPos('smc', pb, true)
      const place = (x: number, y: number, z: number, o: number) => {
        const dx = x - cam64[0]
        const dy = y - cam64[1]
        const dz = z - cam64[2]
        const dist = Math.hypot(dx, dy, dz) || 1
        const k = Math.min(dist, 4.5e5) / dist
        streamArr[o] = dx * k
        streamArr[o + 1] = dy * k
        streamArr[o + 2] = dz * k
      }
      place(pa.x, pa.y, pa.z, 0)
      place(pb.x, pb.y, pb.z, 3)
      ;(streamGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    }
  }

  return { update, object: root }
}
