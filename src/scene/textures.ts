import * as THREE from 'three'

const FILES: Record<string, string> = {
  sun: 'textures/sun.jpg',
  mercury: 'textures/mercury.jpg',
  venus: 'textures/venus.jpg',
  earth: 'textures/earth_day.jpg',
  earthNight: 'textures/earth_night.jpg',
  earthCloud: 'textures/earth_clouds.png',
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
}

function fallback(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([170, 170, 170, 255]), 1, 1)
  t.needsUpdate = true
  t.colorSpace = THREE.SRGBColorSpace
  return t
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
          loader.load(
            base + file,
            (t) => {
              const linear = key === 'earthSpec' || key === 'saturnRing'
              t.colorSpace = linear ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace
              t.anisotropy = 8
              t.wrapS = THREE.ClampToEdgeWrapping
              t.wrapT = THREE.ClampToEdgeWrapping
              done += 1
              onProgress(done / entries.length)
              resolve([key, t])
            },
            undefined,
            () => {
              done += 1
              onProgress(done / entries.length)
              resolve([key, fallback()])
            },
          )
        }),
    ),
  ).then((pairs) => Object.fromEntries(pairs))
}
