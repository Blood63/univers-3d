export const AU = 1.495978707e11
export const LY = 9.4607304725808e15
export const C = 299792458
export const GM_SUN = 1.32712440018e20
export const M_SUN = 1.98847e30
export const R_SUN = 6.957e8
export const R_EARTH = 6.371e6
export const M_EARTH = 5.9722e24
export const J2000 = 2451545.0
export const DAY = 86400
export const YEAR = 365.25 * DAY
export const DEG = Math.PI / 180
export const TAU = Math.PI * 2
export const OBLIQUITY = 23.4392911 * DEG

export interface V3 {
  x: number
  y: number
  z: number
}

export function v3(x = 0, y = 0, z = 0): V3 {
  return { x, y, z }
}

export function setV(o: V3, x: number, y: number, z: number): V3 {
  o.x = x
  o.y = y
  o.z = z
  return o
}

export function copyV(o: V3, a: V3): V3 {
  o.x = a.x
  o.y = a.y
  o.z = a.z
  return o
}

export function addV(o: V3, a: V3, b: V3): V3 {
  o.x = a.x + b.x
  o.y = a.y + b.y
  o.z = a.z + b.z
  return o
}

export function subV(o: V3, a: V3, b: V3): V3 {
  o.x = a.x - b.x
  o.y = a.y - b.y
  o.z = a.z - b.z
  return o
}

export function scaleV(o: V3, a: V3, s: number): V3 {
  o.x = a.x * s
  o.y = a.y * s
  o.z = a.z * s
  return o
}

export function mulAdd(o: V3, a: V3, b: V3, s: number): V3 {
  o.x = a.x + b.x * s
  o.y = a.y + b.y * s
  o.z = a.z + b.z * s
  return o
}

export function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function cross(o: V3, a: V3, b: V3): V3 {
  const x = a.y * b.z - a.z * b.y
  const y = a.z * b.x - a.x * b.z
  const z = a.x * b.y - a.y * b.x
  o.x = x
  o.y = y
  o.z = z
  return o
}

export function len(a: V3): number {
  return Math.hypot(a.x, a.y, a.z)
}

export function norm(o: V3, a: V3): V3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1
  o.x = a.x / l
  o.y = a.y / l
  o.z = a.z / l
  return o
}

export function lerpV(o: V3, a: V3, b: V3, t: number): V3 {
  o.x = a.x + (b.x - a.x) * t
  o.y = a.y + (b.y - a.y) * t
  o.z = a.z + (b.z - a.z) * t
  return o
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function smoother(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

export function dateToJD(d: Date): number {
  return d.getTime() / 86400000 + 2440587.5
}

export function jdToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000)
}

export function ymdToJD(y: number, m: number, day: number): number {
  return Date.UTC(y, m - 1, day) / 86400000 + 2440587.5
}

/** Equatorial RA/Dec (degrees) → unit vector, ecliptic, Three.js Y-up. */
export function raDecDir(raDeg: number, decDeg: number, out: V3): V3 {
  const ra = raDeg * DEG
  const dec = decDeg * DEG
  const ex = Math.cos(dec) * Math.cos(ra)
  const ey = Math.cos(dec) * Math.sin(ra)
  const ez = Math.sin(dec)
  const ce = Math.cos(OBLIQUITY)
  const se = Math.sin(OBLIQUITY)
  const x = ex
  const y = ey * ce + ez * se
  const z = -ey * se + ez * ce
  out.x = x
  out.y = z
  out.z = -y
  return out
}

export function raDecPos(raDeg: number, decDeg: number, ly: number, out: V3): V3 {
  raDecDir(raDeg, decDeg, out)
  const m = ly * LY
  out.x *= m
  out.y *= m
  out.z *= m
  return out
}

export function schwarzschild(massKg: number): number {
  const G = 6.6743e-11
  const c2 = C * C
  return (2 * G * massKg) / c2
}

export function formatNumber(n: number, digits = 1): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

export function formatDist(m: number): string {
  const a = Math.abs(m)
  if (a < 1000) return `${formatNumber(a, a < 10 ? 2 : 1)} m`
  if (a < 1e7) return `${formatNumber(a / 1000, a < 1e5 ? 2 : 0)} km`
  const au = a / AU
  const ly = a / LY
  if (ly < 0.05) return `${formatNumber(au, au < 10 ? 3 : 1)} UA`
  if (ly < 1e5) return `${formatNumber(ly, ly < 10 ? 2 : 0)} al`
  if (ly < 1e8) return `${formatNumber(ly / 1e6, 2)} Mal`
  return `${formatNumber(ly / 1e9, 2)} Gal`
}

export function formatSpeed(mps: number): string {
  const a = Math.abs(mps)
  if (a < 1500) return `${formatNumber(a, a < 10 ? 2 : 1)} m/s`
  if (a < 2e6) return `${formatNumber(a / 1000, 2)} km/s`
  const c = a / C
  if (c < 0.01) return `${formatNumber(a / AU, 4)} UA/s`
  if (c < 80) return `${formatNumber(c, 2)} c`
  return `${formatNumber(a / LY, 2)} al/s`
}

export function formatDuration(seconds: number): string {
  const a = Math.abs(seconds)
  if (!Number.isFinite(a)) return '—'
  if (a < 90) return `${formatNumber(a, 0)} s`
  if (a < 5400) return `${formatNumber(a / 60, 1)} min`
  if (a < DAY * 3) return `${formatNumber(a / 3600, 1)} h`
  if (a < YEAR * 2) return `${formatNumber(a / DAY, 1)} j`
  if (a < YEAR * 1e6) return `${formatNumber(a / YEAR, 1)} ans`
  if (a < YEAR * 1e9) return `${formatNumber(a / YEAR / 1e6, 2)} Ma`
  return `${formatNumber(a / YEAR / 1e9, 2)} Ga`
}

export function formatDateUTC(jd: number): string {
  const d = jdToDate(jd)
  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
  const dd = d.getUTCDate().toString().padStart(2, '0')
  const hh = d.getUTCHours().toString().padStart(2, '0')
  const mi = d.getUTCMinutes().toString().padStart(2, '0')
  const ss = d.getUTCSeconds().toString().padStart(2, '0')
  return `${dd} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}  ${hh}:${mi}:${ss} UTC`
}

export function spectralColor(spec: string): string {
  const c = spec.trim().charAt(0).toUpperCase()
  switch (c) {
    case 'O':
      return '#9bb0ff'
    case 'B':
      return '#aabfff'
    case 'A':
      return '#cad8ff'
    case 'F':
      return '#f7f5ff'
    case 'G':
      return '#fff1d8'
    case 'K':
      return '#ffd0a1'
    case 'M':
      return '#ff9d62'
    case 'W':
      return '#d5e6ff'
    default:
      return '#fff6ea'
  }
}

export function magPointSize(mag: number): number {
  return clamp(8.2 * Math.pow(10, -0.17 * mag), 1.15, 14)
}

export type ScaleBand = 'sonde' | 'planetaire' | 'systeme' | 'interstellaire' | 'galactique' | 'intergalactique'

export function bandOf(distM: number): ScaleBand {
  if (distM < 3e4) return 'sonde'
  if (distM < 5e8) return 'planetaire'
  if (distM < 8e13) return 'systeme'
  if (distM < 8e18) return 'interstellaire'
  if (distM < 8e21) return 'galactique'
  return 'intergalactique'
}

export const BAND_LABEL: Record<ScaleBand, string> = {
  sonde: 'Échelle sonde',
  planetaire: 'Échelle planétaire',
  systeme: 'Échelle système',
  interstellaire: 'Échelle interstellaire',
  galactique: 'Échelle galactique',
  intergalactique: 'Échelle intergalactique',
}

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
