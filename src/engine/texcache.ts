import * as THREE from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'

interface Slot {
  key: string
  url: string
  tex: THREE.Texture
  bytes: number
  last: number
  resident: boolean
}

const slots: Slot[] = []
let clock = 0
const fallbacks = new Map<string, THREE.Texture>()

function paint(key: string): THREE.Texture {
  const cached = fallbacks.get(key)
  if (cached) return cached
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  if (!g) {
    const t = new THREE.DataTexture(new Uint8Array([140, 140, 140, 255]), 1, 1)
    t.needsUpdate = true
    fallbacks.set(key, t)
    return t
  }
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  const hue = (h >>> 0) % 360
  g.fillStyle = `hsl(${hue} 18% 42%)`
  g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 80; i++) {
    const x = ((h >>> (i % 12)) ^ (i * 97)) % 64
    const y = ((h >>> ((i + 3) % 16)) ^ (i * 53)) % 64
    const r = 1 + (i % 4)
    g.fillStyle = `hsla(${(hue + i * 3) % 360} 30% ${30 + (i % 40)}% / 0.85)`
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  fallbacks.set(key, t)
  return t
}

export function proceduralFallback(key: string): THREE.Texture {
  return paint(key)
}

export function registerTexture(key: string, url: string, tex: THREE.Texture, bytes: number): void {
  tex.userData.url = url
  const prev = slots.find((s) => s.key === key)
  if (prev) {
    prev.tex = tex
    prev.url = url
    prev.bytes = bytes
    prev.resident = true
    prev.last = ++clock
    return
  }
  slots.push({ key, url, tex, bytes, last: ++clock, resident: true })
}

export function touchTexture(key: string): void {
  const s = slots.find((x) => x.key === key)
  if (s) s.last = ++clock
}

export function residentBytes(): number {
  let n = 0
  for (const s of slots) if (s.resident) n += s.bytes
  return n
}

/**
 * Drop high-resolution planet maps when the camera leaves the solar system,
 * and reload them on return. Listeners receive the texture to bind.
 */
const listeners = new Map<string, Set<(t: THREE.Texture) => void>>()

export function followTexture(key: string, fn: (t: THREE.Texture) => void): void {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(fn)
}

function emit(key: string, tex: THREE.Texture): void {
  const set = listeners.get(key)
  if (!set) return
  for (const fn of set) fn(tex)
}

let shed = false
let loading = false

const hdQueue: { key: string; url: string }[] = []

export function queueHd(key: string, url: string): void {
  hdQueue.push({ key, url })
}

/** Decode the full-resolution maps after the first frame and swap them in. */
const upgrading = new Set<string>()
const bitmapLoader = new THREE.ImageBitmapLoader()
bitmapLoader.setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })

type Upload =
  | { kind: 'bitmap'; key: string; url: string; bitmap: ImageBitmap; colorSpace: THREE.ColorSpace }
  | { kind: 'replace'; key: string; url: string; tex: THREE.Texture; bytes: number }
  | { kind: 'custom'; run: () => void }

const uploadQueue: Upload[] = []
let ktx2: KTX2Loader | null = null

export function bindRenderer(gl: THREE.WebGLRenderer): void {
  if (ktx2) return
  const loader = new KTX2Loader()
  loader.setTranscoderPath(`${import.meta.env.BASE_URL}basis/`)
  loader.setWorkerLimit(2)
  loader.detectSupport(gl)
  ktx2 = loader
}

function ktxUrl(fileUrl: string): string | null {
  const match = fileUrl.match(/^(.*\/)textures\/([^/]+)\.(?:jpg|png)$/)
  if (!match) return null
  return `${match[1]}textures/ktx2/${match[2]}.ktx2`
}

function compressedBytes(tex: THREE.Texture): number {
  const image = tex.image as { data?: ArrayBufferView } | Array<{ data?: ArrayBufferView }> | null
  if (Array.isArray(image)) {
    let n = 0
    for (const mip of image) n += mip.data?.byteLength ?? 0
    return n
  }
  return image?.data?.byteLength ?? 0
}

/** createImageBitmap has already run off the main thread. The GPU upload waits for pumpGpuUploads. */
export function queueBitmap(key: string, url: string, bitmap: ImageBitmap, colorSpace: THREE.ColorSpace): void {
  uploadQueue.push({ kind: 'bitmap', key, url, bitmap, colorSpace })
}

export function decodeBitmap(url: string): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    bitmapLoader.load(url, (bitmap) => resolve(bitmap), undefined, () => reject(new Error(url)))
  })
}

function applyUpload(job: Upload): void {
  if (job.kind === 'custom') {
    job.run()
    return
  }
  const slot = slots.find((s) => s.key === job.key)
  if (job.kind === 'bitmap') {
    if (!slot) {
      job.bitmap.close()
      return
    }
    slot.tex.image = job.bitmap
    slot.tex.flipY = false
    slot.tex.colorSpace = job.colorSpace
    slot.tex.wrapS = THREE.ClampToEdgeWrapping
    slot.tex.wrapT = THREE.ClampToEdgeWrapping
    slot.tex.generateMipmaps = true
    slot.tex.minFilter = THREE.LinearMipmapLinearFilter
    slot.tex.magFilter = THREE.LinearFilter
    slot.tex.anisotropy = Math.max(slot.tex.anisotropy, 8)
    slot.tex.needsUpdate = true
    slot.url = job.url
    slot.bytes = job.bitmap.width * job.bitmap.height * 4
    slot.resident = true
    slot.last = ++clock
    emit(job.key, slot.tex)
    upgrading.delete(job.key)
    return
  }
  job.tex.anisotropy = Math.max(job.tex.anisotropy, 8)
  job.tex.wrapS = THREE.ClampToEdgeWrapping
  job.tex.wrapT = THREE.ClampToEdgeWrapping
  job.tex.needsUpdate = true
  const old = slot?.tex
  if (slot) {
    slot.tex = job.tex
    slot.url = job.url
    slot.bytes = job.bytes
    slot.resident = true
    slot.last = ++clock
  } else {
    registerTexture(job.key, job.url, job.tex, job.bytes)
  }
  emit(job.key, job.tex)
  if (old && old !== job.tex) old.dispose()
  upgrading.delete(job.key)
}

/** True while a KTX2 transcode or a GPU upload is still in flight. */
export function gpuBusy(): boolean {
  return uploadQueue.length > 0 || upgrading.size > 0
}

/** Spread GPU uploads. One HD map fills the frame; a few small previews can share it. */
export function pumpGpuUploads(): void {
  let cost = 0
  const budget = 480_000
  while (uploadQueue.length && cost < budget) {
    const next = uploadQueue[0]
    const pixels = next.kind === 'bitmap' ? next.bitmap.width * next.bitmap.height : next.kind === 'replace' ? 8_000_000 : 512 * 512
    if (cost > 0 && cost + pixels > budget) break
    cost += pixels
    applyUpload(uploadQueue.shift()!)
  }
}

export function deferBitmap(url: string, apply: (bitmap: ImageBitmap) => void, onError: () => void): void {
  bitmapLoader.load(
    url,
    (bitmap) => uploadQueue.push({ kind: 'custom', run: () => apply(bitmap) }),
    undefined,
    onError,
  )
}

function applyUpgrade(key: string, jpegUrl: string): void {
  const slot = slots.find((s) => s.key === key)
  const colorSpace = (slot?.tex.colorSpace ?? THREE.SRGBColorSpace) as THREE.ColorSpace
  const ktx = ktxUrl(jpegUrl)
  const useJpeg = () => {
    bitmapLoader.load(
      jpegUrl,
      (bitmap) => queueBitmap(key, jpegUrl, bitmap, colorSpace),
      undefined,
      () => upgrading.delete(key),
    )
  }
  if (!ktx || !ktx2) {
    useJpeg()
    return
  }
  ktx2.load(
    ktx,
    (tex) => {
      uploadQueue.push({ kind: 'replace', key, url: ktx, tex, bytes: compressedBytes(tex) || tex.image?.width * tex.image?.height || 0 })
    },
    undefined,
    () => useJpeg(),
  )
}

/** Swap one map for its full-resolution file. KTX2/Basis first, JPEG if the transcoder fails. */
export function upgradeTexture(key: string, url: string): void {
  const prev = slots.find((s) => s.key === key)
  if (upgrading.has(key) || (prev && (prev.url === url || prev.url.endsWith('.ktx2')))) return
  upgrading.add(key)
  applyUpgrade(key, url)
}

/** Kept so callers stay valid. HD maps are requested per visible body. */
export function startHdUpgrade(_quality: string): void {}

export function streamTextures(distanceLy: number): void {
  if (!shed && distanceLy > 1800) {
    for (const s of slots) {
      if (!s.resident) continue
      if (s.key === 'sun' || s.key === 'earth') continue
      s.tex.dispose()
      s.resident = false
      emit(s.key, paint(s.key))
    }
    shed = true
  }
  if (shed && distanceLy < 40 && !loading) {
    loading = true
    const pending = slots.filter((s) => !s.resident)
    if (pending.length === 0) {
      shed = false
      loading = false
      return
    }
    let left = pending.length
    for (const s of pending) {
      const finish = () => {
        left -= 1
        if (left === 0) {
          shed = false
          loading = false
        }
      }
      bitmapLoader.load(
        s.url,
        (bitmap) => {
          queueBitmap(s.key, s.url, bitmap, s.tex.colorSpace as THREE.ColorSpace)
          finish()
        },
        undefined,
        () => {
          s.resident = true
          emit(s.key, paint(s.key))
          finish()
        },
      )
    }
  }
}

export function applyAnisotropy(textures: Record<string, THREE.Texture>, max: number): void {
  const a = Math.max(1, max)
  for (const t of Object.values(textures)) t.anisotropy = a
  for (const s of slots) if (s.resident) s.tex.anisotropy = a
}
