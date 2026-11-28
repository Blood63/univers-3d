import * as THREE from 'three'

/**
 * Progressive quadtree of real remote mosaics.
 * Earth: NASA GIBS Blue Marble (EPSG:4326).
 * Moon: OpenPlanetaryMap LRO WAC basemap.
 * Mars: OpenPlanetaryMap Viking color mosaic.
 * Tiles are fetched only for the face under the camera and evicted by LRU.
 */

const EARTH = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_NextGeneration/default/500m'
const MOON = 'https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-moon-basemap-v0-1/all'
const MARS = 'https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-1/all'

export type QuadBody = 'earth' | 'moon' | 'mars'

type Slot = { key: string; tex: THREE.Texture; last: number }
const slots: Slot[] = []
const pending = new Set<string>()
const failed = new Set<string>()
let clock = 0
const MAX = 14
const loader = new THREE.TextureLoader()
loader.setCrossOrigin('anonymous')

export function tileCacheCount(): number {
  return slots.length
}

function zoomFor(ratio: number, cap: number): number {
  let z = 1
  if (ratio < 1.6) z = 2
  if (ratio < 0.8) z = 3
  if (ratio < 0.4) z = 4
  if (ratio < 0.2) z = 5
  return Math.max(1, Math.min(cap, z))
}

function urlFor(body: QuadBody, z: number, x: number, y: number): string {
  if (body === 'earth') return `${EARTH}/${z}/${y}/${x}.jpg`
  const root = body === 'moon' ? MOON : MARS
  return `${root}/${z}/${x}/${y}.png`
}

function evict(keep: string): void {
  while (slots.length > MAX) {
    let oldest = 0
    for (let i = 1; i < slots.length; i++) if (slots[i].last < slots[oldest].last) oldest = i
    if (slots[oldest].key === keep) {
      if (slots.length < 2) break
      oldest = oldest === 0 ? 1 : 0
    }
    const [gone] = slots.splice(oldest, 1)
    gone.tex.dispose()
  }
}

export interface Cover {
  tex: THREE.Texture
  merc: number
  z: number
  x: number
  y: number
  offU: number
  offV: number
  scaleU: number
  scaleV: number
}

export function requestCover(body: QuadBody, uu: number, vv: number, ratio: number, mobile: boolean): Cover | null {
  const cap = mobile ? 2 : body === 'earth' ? 5 : 4
  const z = zoomFor(ratio, cap)
  const merc = body === 'earth' ? 0 : 1
  let x = 0
  let y = 0
  let offU = 0
  let offV = 0
  let scaleU = 1
  let scaleV = 1
  if (merc === 0) {
    // Measured GIBS 500m matrix (not a pure power of two).
    const grid = [
      [2, 1],
      [3, 2],
      [5, 3],
      [10, 5],
      [20, 10],
      [40, 20],
    ]
    const [nCols, nRows] = grid[Math.min(z, grid.length - 1)]
    x = Math.min(nCols - 1, Math.max(0, Math.floor(uu * nCols)))
    y = Math.min(nRows - 1, Math.max(0, Math.floor((1 - vv) * nRows)))
    offU = x / nCols
    offV = 1 - (y + 1) / nRows
    scaleU = nCols
    scaleV = nRows
  } else {
    const n = 2 ** z
    const lat = (vv - 0.5) * Math.PI
    const clamped = Math.max(-1.4, Math.min(1.4, lat))
    const mercY = (1 - Math.log(Math.tan(clamped) + 1 / Math.cos(clamped)) / Math.PI) / 2
    x = Math.min(n - 1, Math.max(0, Math.floor(uu * n)))
    y = Math.min(n - 1, Math.max(0, Math.floor(mercY * n)))
  }
  const key = `${body}/${z}/${x}/${y}`
  const hit = slots.find((s) => s.key === key)
  if (hit) {
    hit.last = ++clock
    return { tex: hit.tex, merc, z, x, y, offU, offV, scaleU, scaleV }
  }
  if (!pending.has(key) && !failed.has(key)) {
    pending.add(key)
    loader.load(
      urlFor(body, z, x, y),
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 8
        tex.wrapS = THREE.ClampToEdgeWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.generateMipmaps = true
        slots.push({ key, tex, last: ++clock })
        pending.delete(key)
        evict(key)
      },
      undefined,
      () => {
        pending.delete(key)
        failed.add(key)
      },
    )
  }
  return null
}
