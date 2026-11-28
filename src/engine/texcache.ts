import * as THREE from 'three'

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

/** Swap one map for its full-resolution file. No-op if that URL is already bound. */
export function upgradeTexture(key: string, url: string): void {
  const prev = slots.find((s) => s.key === key)
  if (upgrading.has(key) || (prev && prev.url === url)) return
  upgrading.add(key)
  const loader = new THREE.TextureLoader()
  loader.load(url, (nt) => {
    const slot = slots.find((s) => s.key === key)
    nt.colorSpace = slot?.tex.colorSpace ?? THREE.SRGBColorSpace
    nt.anisotropy = Math.max(slot?.tex.anisotropy ?? 8, 8)
    nt.wrapS = THREE.ClampToEdgeWrapping
    nt.wrapT = THREE.ClampToEdgeWrapping
    nt.generateMipmaps = true
    nt.minFilter = THREE.LinearMipmapLinearFilter
    const old = slot?.tex
    if (slot) {
      slot.tex = nt
      slot.url = url
      slot.bytes = 3840 * 1920 * 3
      slot.resident = true
      slot.last = ++clock
    } else {
      registerTexture(key, url, nt, 3840 * 1920 * 3)
    }
    emit(key, nt)
    if (old && old !== nt) old.dispose()
    upgrading.delete(key)
  })
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
    const loader = new THREE.TextureLoader()
    let left = pending.length
    for (const s of pending) {
      loader.load(
        s.url,
        (nt) => {
          nt.colorSpace = s.tex.colorSpace
          nt.anisotropy = s.tex.anisotropy || 8
          nt.wrapS = s.tex.wrapS
          nt.wrapT = s.tex.wrapT
          s.tex = nt
          s.resident = true
          s.last = ++clock
          emit(s.key, nt)
          left -= 1
          if (left === 0) {
            shed = false
            loading = false
          }
        },
        undefined,
        () => {
          s.resident = true
          emit(s.key, paint(s.key))
          left -= 1
          if (left === 0) {
            shed = false
            loading = false
          }
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
