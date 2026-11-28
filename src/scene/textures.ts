import * as THREE from 'three'
import { proceduralFallback, queueHd, registerTexture } from '../engine/texcache'

const FILES: Record<string, string> = {
  sun: 'textures/sun.jpg',
  mercury: 'textures/mercury.jpg',
  venus: 'textures/venus.jpg',
  earth: 'textures/earth_day.jpg',
  earthNight: 'textures/earth_night.jpg',
  earthCloud: 'textures/earth_clouds.jpg',
  earthNormal: 'textures/earth_normal.jpg',
  earthSpec: 'textures/earth_spec.jpg',
  mars: 'textures/mars.jpg',
  jupiter: 'textures/jupiter.jpg',
  saturn: 'textures/saturn.jpg',
  saturnRing: 'textures/saturn_ring.png',
  uranus: 'textures/uranus.jpg',
  neptune: 'textures/neptune.jpg',
  moon: 'textures/moon.jpg',
  ceres: 'textures/ceres.jpg',
  pluto: 'textures/pluto.jpg',
  io: 'textures/io.jpg',
  europa: 'textures/europa.jpg',
  ganymede: 'textures/ganymede.jpg',
  callisto: 'textures/callisto.jpg',
  enceladus: 'textures/enceladus.jpg',
  titan: 'textures/titan.jpg',
  cmb: 'textures/cmb.jpg',
  haumea: 'textures/haumea.jpg',
}

/** Fast stand-in shown on frame 1. The full map replaces it once decoded. */
function previewUrl(file: string): string {
  const name = file.slice(file.lastIndexOf('/') + 1)
  return `textures/preview/${name}`
}

function fallback(key: string): THREE.Texture {
  return proceduralFallback(key)
}

export function loadTextures(onProgress: (ratio: number) => void): Promise<Record<string, THREE.Texture>> {
  const loader = new THREE.TextureLoader()
  const base = import.meta.env.BASE_URL
  const entries = Object.entries(FILES)
  let done = 0
  return Promise.all(
    entries.map(
      ([key, file]) =>
        new Promise<[string, THREE.Texture]>((resolve) => {
          const full = base + file
          const previewName = previewUrl(file)
          const hasPreview = [
            'earth_day.jpg',
            'earth_night.jpg',
            'earth_clouds.jpg',
            'earth_normal.jpg',
            'moon.jpg',
            'mars.jpg',
            'mercury.jpg',
            'io.jpg',
            'europa.jpg',
            'ganymede.jpg',
            'callisto.jpg',
            'enceladus.jpg',
            'titan.jpg',
            'cmb.jpg',
            'haumea.jpg',
          ].some((n) => file.endsWith(n))
          const preview = base + previewName
          const finish = (t: THREE.Texture, url: string, bytes: number) => {
            const linear = key === 'earthSpec' || key === 'saturnRing' || key === 'earthNormal'
            t.colorSpace = linear ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace
            t.anisotropy = 8
            t.wrapS = THREE.ClampToEdgeWrapping
            t.wrapT = THREE.ClampToEdgeWrapping
            t.generateMipmaps = true
            t.minFilter = THREE.LinearMipmapLinearFilter
            registerTexture(key, url, t, bytes)
            if (url !== full && key !== 'sun' && key !== 'jupiter' && key !== 'saturn' && key !== 'uranus' && key !== 'neptune' && key !== 'ceres' && key !== 'pluto' && key !== 'venus' && key !== 'saturnRing' && key !== 'earthSpec') {
              queueHd(key, full)
            }
            done += 1
            onProgress(done / entries.length)
            resolve([key, t])
          }
          const giveUp = () => {
            const fb = fallback(key)
            finish(fb, full, 64 * 64 * 4)
          }
          if (!hasPreview) {
            loader.load(full, (t) => finish(t, full, 2048 * 1024 * 3), undefined, giveUp)
            return
          }
          loader.load(
            preview,
            (t) => finish(t, preview, 512 * 256 * 3),
            undefined,
            () => {
              loader.load(full, (t) => finish(t, full, 2048 * 1024 * 3), undefined, giveUp)
            },
          )
        }),
    ),
  ).then((pairs) => Object.fromEntries(pairs))
}
