import { BODY_BY_ID, BODY_IDS, BODY_INDEX, ORBIT_BY_ID, parentGM, type BodyDef, type Elements } from './catalog'
import {
  AU,
  YEAR,
  copyV,
  len,
  norm,
  raDecDir,
  raDecPos,
  setV,
  ymdToJD,
  type V3,
  v3,
} from './math'

export const WORLD = new Float64Array(BODY_IDS.length * 3)
export const DISPLAY = new Float64Array(BODY_IDS.length * 3)
export const DISP_R = new Float64Array(BODY_IDS.length)

const fixed = new Float64Array(BODY_IDS.length * 3)
const hasFixed = new Uint8Array(BODY_IDS.length)

const tmpA: V3 = v3()
const tmpB: V3 = v3()
const tmpC: V3 = v3()
const tmpD: V3 = v3()

function wpos(id: string, into: V3, buf: Float64Array = WORLD): V3 {
  const i = BODY_INDEX[id] * 3
  into.x = buf[i]
  into.y = buf[i + 1]
  into.z = buf[i + 2]
  return into
}


export function initEphemeris(): void {
  const dir = v3()
  for (const b of Object.values(BODY_BY_ID)) {
    if (!b.sky) continue
    if (ORBIT_BY_ID[b.id]) continue
    raDecPos(b.sky[0], b.sky[1], b.sky[2], dir)
    const i = BODY_INDEX[b.id] * 3
    fixed[i] = dir.x
    fixed[i + 1] = dir.y
    fixed[i + 2] = dir.z
    hasFixed[BODY_INDEX[b.id]] = 1
  }
}

function solveKepler(M: number, e: number): number {
  const m = Math.atan2(Math.sin(M), Math.cos(M))
  let E = e < 0.8 ? m : Math.PI
  for (let k = 0; k < 14; k++) {
    const f = E - e * Math.sin(E) - m
    const fp = 1 - e * Math.cos(E)
    const d = f / fp
    E -= d
    if (Math.abs(d) < 1e-12) break
  }
  return E
}

export function keplerRelative(elm: Elements, jd: number, into: V3): V3 {
  const gm = parentGM(elm.parent)
  const n = Math.sqrt(gm / (elm.a * elm.a * elm.a))
  const dt = (jd - 2451545.0) * 86400
  const M = elm.M0 + n * dt
  const E = solveKepler(M, elm.e)
  const cosE = Math.cos(E)
  const sinE = Math.sin(E)
  const xOrb = elm.a * (cosE - elm.e)
  const yOrb = elm.a * Math.sqrt(1 - elm.e * elm.e) * sinE
  const cosO = Math.cos(elm.Omega)
  const sinO = Math.sin(elm.Omega)
  const cosw = Math.cos(elm.w)
  const sinw = Math.sin(elm.w)
  const cosi = Math.cos(elm.i)
  const sini = Math.sin(elm.i)
  const x1 = cosw * xOrb - sinw * yOrb
  const y1 = sinw * xOrb + cosw * yOrb
  const x2 = x1
  const y2 = y1 * cosi
  const z2 = y1 * sini
  const x = cosO * x2 - sinO * y2
  const y = sinO * x2 + cosO * y2
  const z = z2
  into.x = x
  into.y = z
  into.z = -y
  return into
}

function placeOrbit(id: string, jd: number, into: V3): V3 {
  const elm = ORBIT_BY_ID[id]
  keplerRelative(elm, jd, into)
  if (elm.parent === 'soleil') return into
  helio(elm.parent, jd, tmpD)
  into.x += tmpD.x
  into.y += tmpD.y
  into.z += tmpD.z
  return into
}

const wpCache = new Map<string, V3>()

function bodyOnDate(id: string, jd: number): V3 {
  const key = `${id}@${jd.toFixed(3)}`
  const hit = wpCache.get(key)
  if (hit) return hit
  const into = v3()
  helio(id, jd, into)
  wpCache.set(key, into)
  return into
}

function polyline(jd: number, wps: { jd: number; id: string }[], asymptote: V3, anchorJd: number, anchorPos: V3, into: V3, speedAuYear = 3.6): V3 {
  if (jd <= wps[0].jd) return copyV(into, bodyOnDate(wps[0].id, wps[0].jd))
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i]
    const b = wps[i + 1]
    if (jd <= b.jd) {
      const t = (jd - a.jd) / (b.jd - a.jd)
      const pa = bodyOnDate(a.id, a.jd)
      const pb = bodyOnDate(b.id, b.jd)
      into.x = pa.x + (pb.x - pa.x) * t
      into.y = pa.y + (pb.y - pa.y) * t
      into.z = pa.z + (pb.z - pa.z) * t
      return into
    }
  }
  const last = wps[wps.length - 1]
  const pLast = bodyOnDate(last.id, last.jd)
  if (jd <= anchorJd) {
    const t = (jd - last.jd) / (anchorJd - last.jd)
    into.x = pLast.x + (anchorPos.x - pLast.x) * t
    into.y = pLast.y + (anchorPos.y - pLast.y) * t
    into.z = pLast.z + (anchorPos.z - pLast.z) * t
    return into
  }
  const years = (jd - anchorJd) / 365.25
  const speed = speedAuYear * AU
  into.x = anchorPos.x + asymptote.x * speed * years
  into.y = anchorPos.y + asymptote.y * speed * years
  into.z = anchorPos.z + asymptote.z * speed * years
  return into
}

let v1Dir: V3 | null = null
let v2Dir: V3 | null = null
let nhDir: V3 | null = null
let p10Dir: V3 | null = null
let p11Dir: V3 | null = null
const l2up: V3 = v3(0, 1, 0)

function dirs(): void {
  if (v1Dir) return
  v1Dir = v3()
  v2Dir = v3()
  nhDir = v3()
  p10Dir = v3()
  p11Dir = v3()
  raDecDir(258.0, 12.0, v1Dir)
  raDecDir(299.5, -57.2, v2Dir)
  raDecDir(287.5, -20.5, nhDir)
  raDecDir(68.0, 16.0, p10Dir)
  raDecDir(290.0, -8.0, p11Dir)
}

const V1_WP = [
  { jd: ymdToJD(1977, 9, 5), id: 'terre' },
  { jd: ymdToJD(1979, 3, 5), id: 'jupiter' },
  { jd: ymdToJD(1980, 11, 12), id: 'saturne' },
]
const V2_WP = [
  { jd: ymdToJD(1977, 8, 20), id: 'terre' },
  { jd: ymdToJD(1979, 7, 9), id: 'jupiter' },
  { jd: ymdToJD(1981, 8, 26), id: 'saturne' },
  { jd: ymdToJD(1986, 1, 24), id: 'uranus' },
  { jd: ymdToJD(1989, 8, 25), id: 'neptune' },
]
const NH_WP = [
  { jd: ymdToJD(2006, 1, 19), id: 'terre' },
  { jd: ymdToJD(2007, 2, 28), id: 'jupiter' },
  { jd: ymdToJD(2015, 7, 14), id: 'pluton' },
]
const P10_WP = [
  { jd: ymdToJD(1972, 3, 2), id: 'terre' },
  { jd: ymdToJD(1973, 12, 4), id: 'jupiter' },
]
const P11_WP = [
  { jd: ymdToJD(1973, 4, 6), id: 'terre' },
  { jd: ymdToJD(1974, 12, 3), id: 'jupiter' },
  { jd: ymdToJD(1979, 9, 1), id: 'saturne' },
]

function anchor(dir: V3, au: number, into: V3): V3 {
  into.x = dir.x * au * AU
  into.y = dir.y * au * AU
  into.z = dir.z * au * AU
  return into
}

function placeL2(jd: number, phase: number, into: V3): V3 {
  helio('terre', jd, tmpD)
  const ex = tmpD.x
  const ey = tmpD.y
  const ez = tmpD.z
  const sl = Math.hypot(ex, ey, ez) || 1
  const ux = ex / sl
  const uy = ey / sl
  const uz = ez / sl
  let px = l2up.y * uz - l2up.z * uy
  let py = l2up.z * ux - l2up.x * uz
  let pz = l2up.x * uy - l2up.y * ux
  const pl = Math.hypot(px, py, pz) || 1
  px /= pl
  py /= pl
  pz /= pl
  const qx = uy * pz - uz * py
  const qy = uz * px - ux * pz
  const qz = ux * py - uy * px
  const ang = ((jd - 2451545.0) / 180) * Math.PI * 2 + phase
  const R = 8.0e8
  const hx = (px * Math.cos(ang) + qx * Math.sin(ang) * 0.72) * R
  const hy = (py * Math.cos(ang) + qy * Math.sin(ang) * 0.72) * R
  const hz = (pz * Math.cos(ang) + qz * Math.sin(ang) * 0.72) * R
  const L2 = 1.5e9
  into.x = ex + ux * L2 + hx
  into.y = ey + uy * L2 + hy
  into.z = ez + uz * L2 + hz
  return into
}

/** Meeus ch. 47, termes principaux. Distance à ~0,1 % près (exemple 1992-04-12). */
function placeMoon(jd: number, into: V3): V3 {
  const T = (jd - 2451545.0) / 36525
  const deg = Math.PI / 180
  const wrap = (x: number) => {
    let y = x % 360
    if (y < 0) y += 360
    return y
  }
  const Lp = wrap(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T)
  const D = wrap(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T)
  const M = wrap(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T)
  const Mp = wrap(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T)
  const F = wrap(93.272095 + 483202.0175233 * T - 0.0036539 * T * T)
  const E = 1 - 0.002516 * T - 0.0000074 * T * T
  const arg = (d: number, m: number, mp: number, f: number) => (d * D + m * M + mp * Mp + f * F) * deg
  let lon = Lp
  const lonTerms: [number, number, number, number, number, number][] = [
    [0, 0, 1, 0, 6.288774, 0],
    [2, 0, -1, 0, 1.274027, 0],
    [2, 0, 0, 0, 0.658314, 0],
    [0, 0, 2, 0, 0.213616, 0],
    [0, 1, 0, 0, -0.185596, 1],
    [0, 0, 0, 2, -0.114336, 0],
    [2, 0, -2, 0, 0.058793, 0],
    [2, -1, -1, 0, 0.057212, 1],
    [2, 0, 1, 0, 0.05332, 0],
    [2, -1, 0, 0, 0.045874, 1],
    [0, 1, -1, 0, 0.041024, 1],
    [1, 0, 0, 0, -0.034718, 0],
    [0, 1, 1, 0, -0.030465, 1],
    [2, 0, 0, -2, 0.015326, 0],
    [0, 0, 1, 2, -0.012528, 0],
    [0, 0, 1, -2, 0.01098, 0],
    [4, 0, -1, 0, 0.010034, 0],
    [0, 0, 3, 0, 0.008548, 0],
  ]
  for (const [d, m, mp, f, c, e] of lonTerms) {
    const ee = e === 0 ? 1 : E
    lon += c * ee * Math.sin(arg(d, m, mp, f))
  }
  let lat = 0
  const latTerms: [number, number, number, number, number][] = [
    [0, 0, 0, 1, 5.128189],
    [0, 0, 1, 1, 0.280606],
    [0, 0, 1, -1, 0.277693],
    [2, 0, 0, -1, 0.173238],
    [2, 0, -1, 1, 0.055413],
    [2, 0, -1, -1, 0.046272],
    [2, 0, 0, 1, 0.032573],
    [0, 0, 2, 1, 0.017198],
    [2, 0, 1, -1, 0.009267],
    [0, 0, 2, -1, 0.008823],
  ]
  for (const [d, m, mp, f, c] of latTerms) lat += c * Math.sin(arg(d, m, mp, f))
  let dist = 385000.56
  for (const [d, m, mp, f, c, e] of [
    [0, 0, 1, 0, -20905.355, 0],
    [2, 0, -1, 0, -3699.111, 0],
    [2, 0, 0, 0, -2955.968, 0],
    [0, 0, 2, 0, -569.925, 0],
    [0, 1, 0, 0, -3.149, 1],
    [2, 0, -2, 0, 246.158, 0],
    [2, -1, -1, 0, -152.138, 1],
    [2, 0, 1, 0, -170.733, 0],
    [2, -1, 0, 0, -204.586, 1],
    [0, 1, -1, 0, -129.62, 1],
    [1, 0, 0, 0, 108.743, 0],
    [0, 1, 1, 0, 104.755, 1],
    [2, 0, 0, -2, 10.321, 0],
    [0, 0, 3, 0, -23.21, 0],
    [4, 0, -1, 0, -45.099, 0],
    [0, 0, 1, -2, -55.173, 0],
  ] as [number, number, number, number, number, number][]) {
    const ee = e === 0 ? 1 : E
    dist += c * ee * Math.cos(arg(d, m, mp, f))
  }
  const rad = dist * 1000
  const lonRad = lon * deg
  const beta = lat * deg
  const cosB = Math.cos(beta)
  const x = rad * cosB * Math.cos(lonRad)
  const ye = rad * cosB * Math.sin(lonRad)
  const ze = rad * Math.sin(beta)
  helio('terre', jd, tmpD)
  into.x = tmpD.x + x
  into.y = tmpD.y + ze
  into.z = tmpD.z - ye
  return into
}

export function helio(id: string, jd: number, into: V3): V3 {
  if (id === 'soleil') return setV(into, 0, 0, 0)
  const idx = BODY_INDEX[id]
  if (hasFixed[idx]) {
    into.x = fixed[idx * 3]
    into.y = fixed[idx * 3 + 1]
    into.z = fixed[idx * 3 + 2]
    return into
  }
  if (id === 'voyager1' || id === 'voyager2' || id === 'newhorizons' || id === 'pioneer10' || id === 'pioneer11') {
    dirs()
    if (id === 'voyager1') {
      anchor(v1Dir!, 169.2, tmpB)
      return polyline(jd, V1_WP, v1Dir!, ymdToJD(2026, 1, 1), tmpB, into)
    }
    if (id === 'voyager2') {
      anchor(v2Dir!, 141.5, tmpB)
      return polyline(jd, V2_WP, v2Dir!, ymdToJD(2026, 1, 1), tmpB, into)
    }
    if (id === 'pioneer10') {
      anchor(p10Dir!, 139, tmpB)
      return polyline(jd, P10_WP, p10Dir!, ymdToJD(2026, 1, 1), tmpB, into, 2.5)
    }
    if (id === 'pioneer11') {
      anchor(p11Dir!, 116, tmpB)
      return polyline(jd, P11_WP, p11Dir!, ymdToJD(2026, 1, 1), tmpB, into, 2.4)
    }
    anchor(nhDir!, 63.2, tmpB)
    return polyline(jd, NH_WP, nhDir!, ymdToJD(2026, 1, 1), tmpB, into)
  }
  if (id === 'jwst' || id === 'gaia' || id === 'euclid') {
    const phase = id === 'gaia' ? 2.1 : id === 'euclid' ? 4.2 : 0
    return placeL2(jd, phase, into)
  }
  if (id === 'lune') return placeMoon(jd, into)
  if (id === 'apollo11') {
    helio('lune', jd, into)
    const mx = into.x
    const my = into.y
    const mz = into.z
    const R = 1.7374e6 + 6
    let ox = 0.62
    let oy = 0.18
    let oz = 0.76
    const ol = Math.hypot(ox, oy, oz) || 1
    ox /= ol
    oy /= ol
    oz /= ol
    into.x = mx + ox * R
    into.y = my + oy * R
    into.z = mz + oz * R
    return into
  }
  if (ORBIT_BY_ID[id]) return placeOrbit(id, jd, into)
  return setV(into, 0, 0, 0)
}

export function writeWorld(jd: number): void {
  for (let i = 0; i < BODY_IDS.length; i++) {
    helio(BODY_IDS[i], jd, tmpA)
    const o = i * 3
    WORLD[o] = tmpA.x
    WORLD[o + 1] = tmpA.y
    WORLD[o + 2] = tmpA.z
  }
}

const DISP_SCALE = 4.0e9

export function compressRadius(metersFromSun: number): number {
  const au = Math.max(0, metersFromSun / AU)
  return (0.28 + Math.log10(1 + au) * 0.7) * DISP_SCALE
}

function isSunFamily(id: string): boolean {
  let guard = 0
  let cur: string | undefined = id
  while (cur && guard++ < 8) {
    if (cur === 'soleil') return true
    const orb: Elements | undefined = ORBIT_BY_ID[cur]
    const body: BodyDef | undefined = BODY_BY_ID[cur]
    const next: string | undefined = orb ? orb.parent : body ? body.parent : undefined
    if (!next) return false
    cur = next
  }
  return false
}

export function realRadius(id: string): number {
  return BODY_BY_ID[id]?.radius ?? 1
}

export function displayRadius(id: string): number {
  return DISP_R[BODY_INDEX[id]] || realRadius(id)
}

export function writeDisplay(orrery: boolean): void {
  if (!orrery) {
    DISPLAY.set(WORLD)
    for (let i = 0; i < BODY_IDS.length; i++) DISP_R[i] = BODY_BY_ID[BODY_IDS[i]].radius
    return
  }
  for (let i = 0; i < BODY_IDS.length; i++) {
    const id = BODY_IDS[i]
    const o = i * 3
    if (!isSunFamily(id) || id === 'soleil') {
      DISPLAY[o] = WORLD[o]
      DISPLAY[o + 1] = WORLD[o + 1]
      DISPLAY[o + 2] = WORLD[o + 2]
      DISP_R[i] = BODY_BY_ID[id].radius
    }
  }
  const sunR = 3.4e8
  DISP_R[BODY_INDEX.soleil] = sunR
  // planets and other direct children of the sun, then deeper descendants
  const pending = BODY_IDS.filter((id) => id !== 'soleil' && isSunFamily(id))
  const placed = new Set<string>(['soleil'])
  let guard = 0
  while (pending.length && guard++ < 8) {
    for (let k = pending.length - 1; k >= 0; k--) {
      const id = pending[k]
      const parent = ORBIT_BY_ID[id]?.parent ?? BODY_BY_ID[id].parent
      if (!parent || !placed.has(parent)) continue
      pending.splice(k, 1)
      placed.add(id)
      wpos(id, tmpA, WORLD)
      wpos(parent, tmpB, WORLD)
      tmpC.x = tmpA.x - tmpB.x
      tmpC.y = tmpA.y - tmpB.y
      tmpC.z = tmpA.z - tmpB.z
      const rel = len(tmpC) || 1
      norm(tmpD, tmpC)
      wpos(parent, tmpB, DISPLAY)
      const pR = realRadius(parent)
      const pRd = displayRadius(parent)
      if (parent === 'soleil') {
        const cr = compressRadius(rel)
        const i = BODY_INDEX[id]
        DISPLAY[i * 3] = tmpD.x * cr
        DISPLAY[i * 3 + 1] = tmpD.y * cr
        DISPLAY[i * 3 + 2] = tmpD.z * cr
        const exaggerated = Math.max(realRadius(id) * 6, cr * 0.05)
        DISP_R[i] = Math.min(exaggerated, cr * 0.16)
      } else {
        const alt = Math.max(0, rel - pR)
        const ratio = alt / Math.max(pR, 1)
        let dispAlt: number
        if (ratio < 0.25) dispAlt = pRd * (0.045 + ratio * 0.55)
        else dispAlt = pRd * (0.22 + Math.log10(1 + ratio) * 0.85)
        const dist = pRd + dispAlt
        const i = BODY_INDEX[id]
        DISPLAY[i * 3] = tmpB.x + tmpD.x * dist
        DISPLAY[i * 3 + 1] = tmpB.y + tmpD.y * dist
        DISPLAY[i * 3 + 2] = tmpB.z + tmpD.z * dist
        const craft = BODY_BY_ID[id].kind === 'craft' || BODY_BY_ID[id].kind === 'constellation'
        DISP_R[i] = craft ? realRadius(id) : Math.max(realRadius(id), pRd * 0.18)
      }
    }
  }
}

export function readPos(id: string, into: V3, display = false): V3 {
  return wpos(id, into, display ? DISPLAY : WORLD)
}

export function sampleOrbit(id: string, jd: number, steps: number, out: Float32Array, display: boolean): void {
  const elm = ORBIT_BY_ID[id]
  if (!elm) return
  const gm = parentGM(elm.parent)
  const periodDays = (Math.PI * 2) / Math.sqrt(gm / (elm.a ** 3)) / 86400
  for (let s = 0; s <= steps; s++) {
    const t = jd + (periodDays * s) / steps
    keplerRelative(elm, t, tmpC)
    if (display && elm.parent === 'soleil') {
      const r = len(tmpC)
      const cr = compressRadius(r)
      const f = cr / (r || 1)
      out[s * 3] = tmpC.x * f
      out[s * 3 + 1] = tmpC.y * f
      out[s * 3 + 2] = tmpC.z * f
    } else if (elm.parent !== 'soleil') {
      out[s * 3] = tmpC.x
      out[s * 3 + 1] = tmpC.y
      out[s * 3 + 2] = tmpC.z
    } else {
      out[s * 3] = tmpC.x
      out[s * 3 + 1] = tmpC.y
      out[s * 3 + 2] = tmpC.z
    }
  }
}

export interface BeltBuffers {
  asteroids: Float32Array
  kuiper: Float32Array
}

/** stride 8: radius, angle0, inc, node, rate (rad/year), size, cr, cg  — cb packed in size sign? keep 9 */
export const BELT_STRIDE = 9

export function buildBelt(kind: 'asteroids' | 'kuiper', count: number, seed: number): Float32Array {
  let s = seed >>> 0
  const rand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
  const data = new Float32Array(count * BELT_STRIDE)
  const inner = kind === 'asteroids' ? 2.1 : 32
  const outer = kind === 'asteroids' ? 3.3 : 50
  const thick = kind === 'asteroids' ? 0.18 : 0.35
  for (let i = 0; i < count; i++) {
    const au = inner + (outer - inner) * Math.pow(rand(), 0.85)
    const a = au * AU
    const gm = 1.32712440018e20
    const rate = Math.sqrt(gm / (a * a * a)) * YEAR
    const o = i * BELT_STRIDE
    data[o] = a
    data[o + 1] = rand() * Math.PI * 2
    data[o + 2] = (rand() - 0.5) * thick
    data[o + 3] = rand() * Math.PI * 2
    data[o + 4] = rate
    const size = kind === 'asteroids' ? 8e3 + rand() * 6e4 : 2e4 + rand() * 1.6e5
    data[o + 5] = size
    if (kind === 'asteroids') {
      data[o + 6] = 0.45 + rand() * 0.35
      data[o + 7] = 0.38 + rand() * 0.25
      data[o + 8] = 0.28 + rand() * 0.15
    } else {
      data[o + 6] = 0.55 + rand() * 0.3
      data[o + 7] = 0.62 + rand() * 0.25
      data[o + 8] = 0.7 + rand() * 0.25
    }
  }
  return data
}

export function selfCheck(): string[] {
  initEphemeris()
  const errors: string[] = []
  const p = v3()
  helio('terre', 2451545.0, p)
  const d = len(p) / AU
  if (Math.abs(d - 1) > 0.03) errors.push(`Terre J2000 = ${d.toFixed(4)} UA`)
  helio('jupiter', 2451545.0, p)
  const j = len(p) / AU
  if (j < 4.5 || j > 5.8) errors.push(`Jupiter J2000 = ${j.toFixed(3)} UA`)
  helio('neptune', 2451545.0, p)
  const n = len(p) / AU
  if (n < 28 || n > 32) errors.push(`Neptune J2000 = ${n.toFixed(2)} UA`)
  helio('lune', 2448724.5, p)
  helio('terre', 2448724.5, tmpA)
  const md1992 = Math.hypot(p.x - tmpA.x, p.y - tmpA.y, p.z - tmpA.z) / 1000
  if (Math.abs(md1992 - 368409.7) / 368409.7 > 0.01) errors.push(`Lune 1992-04-12 = ${md1992.toFixed(0)} km`)
  const jdAudit = Date.UTC(2026, 10, 28) / 86400000 + 2440587.5
  helio('lune', jdAudit, p)
  helio('terre', jdAudit, tmpA)
  const mdNow = Math.hypot(p.x - tmpA.x, p.y - tmpA.y, p.z - tmpA.z) / 1000
  if (Math.abs(mdNow - 364219) / 364219 > 0.01) errors.push(`Lune 2026-11-28 = ${mdNow.toFixed(0)} km (réf. 364219)`)
  helio('voyager1', ymdToJD(2026, 1, 1), p)
  const v1 = len(p) / AU
  if (v1 < 140 || v1 > 200) errors.push(`Voyager 1 = ${v1.toFixed(1)} UA`)
  helio('jwst', 2451545.0 + 9000, p)
  helio('terre', 2451545.0 + 9000, tmpA)
  const jl = Math.hypot(p.x - tmpA.x, p.y - tmpA.y, p.z - tmpA.z)
  if (jl < 1.2e9 || jl > 2.6e9) errors.push(`JWST-Terre = ${(jl / 1e6).toFixed(0)} Mm`)
  if (!Number.isFinite(BODY_BY_ID['sgr-a'].radius) || BODY_BY_ID['sgr-a'].radius < 1e9) errors.push('Rs Sgr A*')
  return errors
}

export function trajectorySamples(id: string, jd0: number, jd1: number, steps: number): Float32Array {
  const out = new Float32Array((steps + 1) * 3)
  for (let s = 0; s <= steps; s++) {
    const jd = jd0 + ((jd1 - jd0) * s) / steps
    helio(id, jd, tmpA)
    out[s * 3] = tmpA.x
    out[s * 3 + 1] = tmpA.y
    out[s * 3 + 2] = tmpA.z
  }
  return out
}
