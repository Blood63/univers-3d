import * as THREE from 'three'
import { decodeBitmap, proceduralFallback, queueBitmap, registerTexture, upgradeTexture } from '../engine/texcache'

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
  const base = import.meta.env.BASE_URL
  const entries = Object.entries(FILES)
  let done = 0
  return Promise.all(
    entries.map(
      ([key, file]) =>
        new Promise<[string, THREE.Texture]>((resolve) => {
          const full = base + file
          const preview = base + previewUrl(file)
          const linear = key === 'earthSpec' || key === 'saturnRing' || key === 'earthNormal'
          const colorSpace = linear ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace
          const placeholder = new THREE.Texture()
          placeholder.colorSpace = colorSpace
          placeholder.flipY = false
          placeholder.wrapS = THREE.ClampToEdgeWrapping
          placeholder.wrapT = THREE.ClampToEdgeWrapping
          placeholder.anisotropy = 8
          registerTexture(key, preview, placeholder, 64)
          const accept = (bitmap: ImageBitmap, url: string) => {
            queueBitmap(key, url, bitmap, colorSpace)
            done += 1
            onProgress(done / entries.length)
            resolve([key, placeholder])
          }
          const giveUp = () => {
            const fb = fallback(key)
            placeholder.image = fb.image
            placeholder.needsUpdate = true
            done += 1
            onProgress(done / entries.length)
            resolve([key, placeholder])
          }
          decodeBitmap(preview).then(
            (bitmap) => accept(bitmap, preview),
            () => {
              decodeBitmap(full).then(
                (bitmap) => accept(bitmap, full),
                () => giveUp(),
              )
            },
          )
        }),
    ),
  ).then((pairs) => Object.fromEntries(pairs))
}

const BODY_MAPS: Record<string, string[]> = {
  soleil: ['sun'],
  mercure: ['mercury'],
  venus: ['venus'],
  terre: ['earth', 'earthNight', 'earthCloud', 'earthNormal', 'earthSpec'],
  mars: ['mars'],
  jupiter: ['jupiter'],
  saturne: ['saturn', 'saturnRing'],
  uranus: ['uranus'],
  neptune: ['neptune'],
  lune: ['moon'],
  ceres: ['ceres'],
  pluton: ['pluto'],
  io: ['io'],
  europe: ['europa'],
  ganymede: ['ganymede'],
  callisto: ['callisto'],
  encelade: ['enceladus'],
  titan: ['titan'],
  haumea: ['haumea'],
  cmb: ['cmb'],
}

/** Full-resolution maps for one body. Previews stay on screen until the decode finishes. */
export function requestMaps(bodyId: string): void {
  const keys = BODY_MAPS[bodyId]
  if (!keys) return
  const base = import.meta.env.BASE_URL
  for (const key of keys) {
    const file = FILES[key]
    if (file) upgradeTexture(key, base + file)
  }
}
