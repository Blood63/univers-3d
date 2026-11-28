import * as THREE from 'three'
import { BODY_BY_ID, BODY_IDS, TOURS } from '../astro/catalog'
import { displayRadius, initEphemeris, readPos, realRadius, trajectorySamples, writeDisplay, writeWorld } from '../astro/ephemeris'
import { AU, J2000, TAU, bandOf, clamp, smoother, v3, ymdToJD, type V3 } from '../astro/math'
import { logHitch, notesAround } from './hitch'
import { preloadLowEarthTiles } from '../scene/quadtree'
import { requestMaps } from '../scene/textures'
import { echelleOf } from '../astro/scales'
import { blip, ensureAudio, resumeAudio, setRadio } from './audio'
import { cam64, detectMobile, sim, type CamMode } from './state'

export const camQuat = new THREE.Quaternion()
const vel = v3()
const euler = new THREE.Euler(0, 0, 0, 'YXZ')
const qTmp = new THREE.Quaternion()
const qTilt = new THREE.Quaternion()
const qSpin = new THREE.Quaternion()
const axisY = new THREE.Vector3(0, 1, 0)
const axisZ = new THREE.Vector3(0, 0, 1)
const basisX = new THREE.Vector3()
const basisY = new THREE.Vector3()
const basisZ = new THREE.Vector3()
const offV = new THREE.Vector3()
const m4 = new THREE.Matrix4()
const xA = new THREE.Vector3()
const yA = new THREE.Vector3()
const zA = new THREE.Vector3()
const upA = new THREE.Vector3(0, 1, 0)

const pA: V3 = v3()
const pB: V3 = v3()
const pC: V3 = v3()
const qA: V3 = v3()
const qB: V3 = v3()

let issComposed = true
let yaw = 0.9
let pitch = -0.25
let roll = 0
let rollVel = 0
let prevCam = v3()

const pivot = { x: 0, y: 0, z: 0 }
const targetPivot = { x: 0, y: 0, z: 0 }
let airDist = 42 * AU
let targetDist = 42 * AU
let airYaw = 0.45
let targetAirYaw = 0.45
let airTilt = 1.08
let targetAirTilt = 1.08
let dragPanX = 0
let dragPanY = 0
let dragOrbitX = 0
let dragOrbitY = 0
let wheelZoom = 0
const MIN_ALT = 0.25

interface Warp {
  t: number
  dur: number
  sx: number
  sy: number
  sz: number
  tx: number
  ty: number
  tz: number
  sq: THREE.Quaternion
  tq: THREE.Quaternion
  id: string
}
let warp: Warp | null = null

export let beltAsteroids: Float32Array | null = null
export let beltKuiper: Float32Array | null = null
export const probePaths: Record<string, Float32Array> = {}
let worker: Worker | null = null
const syncs: Array<(dt: number) => void> = []
export function onSync(fn: (dt: number) => void): () => void {
  syncs.push(fn)
  return () => {
    const i = syncs.indexOf(fn)
    if (i >= 0) syncs.splice(i, 1)
  }
}

function putCam(x: number, y: number, z: number): void {
  cam64[0] = x
  cam64[1] = y
  cam64[2] = z
}

export function bodyQuaternion(id: string, out: THREE.Quaternion): void {
  const b = BODY_BY_ID[id]
  if (!b) {
    out.identity()
    return
  }
  if (b.kind === 'planet' || b.kind === 'moon' || b.kind === 'dwarf' || b.kind === 'star' || b.kind === 'comet') {
    const tilt = (b.axialTilt * Math.PI) / 180
    const spin = b.rotationPeriod ? ((sim.jd - J2000) * 86400 / b.rotationPeriod) * TAU : 0
    qTilt.setFromAxisAngle(axisZ, tilt)
    qSpin.setFromAxisAngle(axisY, spin)
    out.copy(qTilt).multiply(qSpin)
    return
  }
  readPos(id, qA, true)
  if (b.flags?.includes('iss') || b.flags?.includes('tiangong') || b.flags?.includes('hubble') || b.kind === 'constellation') {
    readPos('terre', qB, true)
    yA.set(qA.x - qB.x, qA.y - qB.y, qA.z - qB.z)
    if (yA.lengthSq() < 1) yA.set(0, 1, 0)
    yA.normalize()
    xA.crossVectors(upA, yA)
    if (xA.lengthSq() < 1e-4) xA.set(1, 0, 0)
    xA.normalize()
    zA.crossVectors(xA, yA).normalize()
    m4.makeBasis(xA, yA, zA)
    out.setFromRotationMatrix(m4)
    return
  }
  if (b.flags?.includes('jwst') || b.flags?.includes('parker')) {
    readPos('soleil', qB, true)
    const towardSun = b.flags.includes('parker')
    zA.set(qB.x - qA.x, qB.y - qA.y, qB.z - qA.z)
    if (!towardSun) zA.multiplyScalar(-1)
    if (zA.lengthSq() < 1) zA.set(0, 0, 1)
    zA.normalize()
    xA.crossVectors(upA, zA)
    if (xA.lengthSq() < 1e-4) xA.set(1, 0, 0)
    xA.normalize()
    yA.crossVectors(zA, xA).normalize()
    m4.makeBasis(xA, yA, zA)
    out.setFromRotationMatrix(m4)
    return
  }
  if (b.flags?.includes('voyager') || b.flags?.includes('newhorizons')) {
    readPos('terre', qB, true)
    zA.set(qB.x - qA.x, qB.y - qA.y, qB.z - qA.z)
    if (zA.lengthSq() < 1) zA.set(0, 0, 1)
    zA.normalize()
    xA.crossVectors(upA, zA)
    if (xA.lengthSq() < 1e-4) xA.set(1, 0, 0)
    xA.normalize()
    yA.crossVectors(zA, xA).normalize()
    m4.makeBasis(xA, yA, zA)
    out.setFromRotationMatrix(m4)
    return
  }
  if (b.flags?.includes('juno')) {
    readPos('jupiter', qB, true)
    yA.set(qB.x - qA.x, qB.y - qA.y, qB.z - qA.z)
    if (yA.lengthSq() < 1) yA.set(0, 1, 0)
    yA.normalize()
    xA.crossVectors(upA, yA)
    if (xA.lengthSq() < 1e-4) xA.set(1, 0, 0)
    xA.normalize()
    zA.crossVectors(xA, yA).normalize()
    m4.makeBasis(xA, yA, zA)
    out.setFromRotationMatrix(m4)
    return
  }
  out.identity()
}

function craftOffset(id: string, into: THREE.Vector3): THREE.Vector3 {
  switch (id) {
    case 'iss':
      return into.set(22, 11, 16)
    case 'tiangong':
      return into.set(18, 8, 22)
    case 'hubble':
      return into.set(10, 4, 16)
    case 'jwst':
      return into.set(26, 14, 10)
    case 'parker':
      return into.set(6, 4, 11)
    case 'juno':
      return into.set(30, 12, 22)
    case 'voyager1':
    case 'voyager2':
      return into.set(7, 3.5, 14)
    case 'newhorizons':
      return into.set(6, 3, 11)
    case 'gaia':
    case 'euclid':
      return into.set(8, 4, 12)
    case 'pioneer10':
    case 'pioneer11':
      return into.set(6, 3, 10)
    case 'cassini':
      return into.set(10, 5, 16)
    case 'rosetta':
      return into.set(8, 4, 12)
    case 'gateway':
      return into.set(18, 8, 16)
    case 'apollo11':
      return into.set(9, 5, 12)
    case 'starlink':
      return into.set(30, 12, 20)
    case 'gps':
      return into.set(80, 30, 40)
    case 'geo':
      return into.set(140, 40, 60)
    default:
      return into.set(0, 0, 0)
  }
}

const WORLD_UP: V3 = { x: 0, y: 1, z: 0 }

function lookOnly(from: V3, to: V3, up: V3 = WORLD_UP): void {
  zA.set(from.x - to.x, from.y - to.y, from.z - to.z)
  if (zA.lengthSq() < 1e-12) zA.set(0, 0, 1)
  zA.normalize()
  xA.set(up.x, up.y, up.z).cross(zA)
  if (xA.lengthSq() < 1e-8) xA.set(1, 0, 0).cross(zA)
  xA.normalize()
  yA.crossVectors(zA, xA).normalize()
  m4.makeBasis(xA, yA, zA)
  camQuat.setFromRotationMatrix(m4)
}

function lookToward(from: V3, to: V3, up: V3 = WORLD_UP): void {
  lookOnly(from, to, up)
  euler.setFromQuaternion(camQuat, 'YXZ')
  yaw = euler.y
  pitch = clamp(euler.x, -1.45, 1.45)
  roll = euler.z
}

function placeAerial(): void {
  const c = Math.cos(airTilt)
  const s = Math.sin(airTilt)
  const ox = Math.cos(airYaw) * airDist * c
  const oy = airDist * s
  const oz = Math.sin(airYaw) * airDist * c
  putCam(pivot.x + ox, pivot.y + oy, pivot.z + oz)
  lookOnly({ x: cam64[0], y: cam64[1], z: cam64[2] }, pivot)
}

function damp(current: number, target: number, dt: number, rate: number): number {
  return current + (target - current) * (1 - Math.exp(-dt * rate))
}

function dampAngle(current: number, target: number, dt: number, rate: number): number {
  let d = target - current
  while (d > Math.PI) d -= TAU
  while (d < -Math.PI) d += TAU
  return current + d * (1 - Math.exp(-dt * rate))
}

function syncAerialTargets(): void {
  targetPivot.x = pivot.x
  targetPivot.y = pivot.y
  targetPivot.z = pivot.z
  targetDist = airDist
  targetAirYaw = airYaw
  targetAirTilt = airTilt
}

function adoptAerial(id: string, follow: boolean): void {
  readPos(id, pB, true)
  const dx = cam64[0] - pB.x
  const dy = cam64[1] - pB.y
  const dz = cam64[2] - pB.z
  const d = Math.hypot(dx, dy, dz)
  airDist = Math.max(d, MIN_ALT)
  const horiz = Math.hypot(dx, dz)
  airTilt = clamp(horiz < 1e-6 ? Math.PI / 2 - 0.04 : Math.atan2(dy, horiz), 0.04, Math.PI / 2 - 0.01)
  if (horiz > 1e-4) airYaw = Math.atan2(dz, dx)
  pivot.x = pB.x
  pivot.y = pB.y
  pivot.z = pB.z
  syncAerialTargets()
  sim.mode = 'aerial'
  sim.follow = follow
  sim.target = id
  sim.selected = id
  placeAerial()
}

function desiredCamera(id: string, out: V3): V3 {
  readPos(id, pB, true)
  const off = craftOffset(id, offV)
  if (off.lengthSq() > 0 && (BODY_BY_ID[id].kind === 'craft' || BODY_BY_ID[id].kind === 'constellation')) {
    bodyQuaternion(id, qTmp)
    xA.copy(off).applyQuaternion(qTmp)
    out.x = pB.x + xA.x
    out.y = pB.y + xA.y
    out.z = pB.z + xA.z
    return out
  }
  if (BODY_BY_ID[id].kind === 'galaxy') {
    const d = Math.max(BODY_BY_ID[id].approach, displayRadius(id) * 2.4)
    out.x = pB.x + d * 0.34
    out.y = pB.y + d * 0.62
    out.z = pB.z + d * 0.46
    return out
  }
  if (BODY_BY_ID[id].kind === 'nebula') {
    const d = BODY_BY_ID[id].approach * 0.55
    out.x = pB.x + d * 0.2
    out.y = pB.y + d * 0.25
    out.z = pB.z + d * 0.85
    return out
  }
  if (id === 'iss') {
    readPos('terre', pA, true)
    const dx = pB.x - pA.x
    const dy = pB.y - pA.y
    const dz = pB.z - pA.z
    const sl = Math.hypot(dx, dy, dz) || 1
    const ux = dx / sl
    const uy = dy / sl
    const uz = dz / sl
    readPos('soleil', pC, true)
    let lx = pC.x - pB.x
    let ly = pC.y - pB.y
    let lz = pC.z - pB.z
    const along = lx * ux + ly * uy + lz * uz
    lx -= ux * along
    ly -= uy * along
    lz -= uz * along
    const ll = Math.hypot(lx, ly, lz) || 1
    out.x = pB.x + ux * 780 + (lx / ll) * 60
    out.y = pB.y + uy * 780 + (ly / ll) * 60
    out.z = pB.z + uz * 780 + (lz / ll) * 60
    return out
  }
  const r = displayRadius(id)
  const d = sim.scaleMode === 'orrery' ? Math.max(r * 4.4, 40) : Math.max(Math.min(BODY_BY_ID[id].approach, r * 18), r * 2.8)
  out.x = pB.x + d * 0.46
  out.y = pB.y + d * 0.42
  out.z = pB.z + d * 0.72
  return out
}

export function viewSolarSystem(): void {
  readPos('soleil', pB, true)
  pivot.x = targetPivot.x = pB.x
  pivot.y = targetPivot.y = pB.y
  pivot.z = targetPivot.z = pB.z
  airDist = targetDist = 42 * AU
  airTilt = targetAirTilt = 1.08
  airYaw = targetAirYaw = 0.45
  sim.mode = 'aerial'
  sim.follow = false
  sim.warpActive = false
  sim.warp = 0
  warp = null
  sim.target = 'soleil'
  sim.selected = 'soleil'
  sim.altitude = airDist
  placeAerial()
  blip(440)
}

function surfaceFloor(id: string): number {
  const b = BODY_BY_ID[id]
  if (!b) return MIN_ALT
  if (id === 'iss') return 220
  if (b.kind === 'craft' || b.kind === 'constellation' || b.kind === 'comet') return 18
  return Math.max(b.radius * 1.08, 40)
}

export function setAltitude(meters: number): void {
  const id = sim.target && BODY_BY_ID[sim.target] ? sim.target : 'soleil'
  const d = Math.max(meters, surfaceFloor(id))
  if (sim.mode !== 'aerial') {
    sim.mode = 'aerial'
    sim.follow = false
  }
  targetDist = d
  airDist = d
  sim.follow = false
  sim.altitude = d
  placeAerial()
}

export function toggleFollow(): void {
  if (!sim.selected || !BODY_BY_ID[sim.selected]) return
  sim.follow = !sim.follow
  if (sim.follow) {
    sim.mode = 'aerial'
    readPos(sim.selected, pB, true)
    targetPivot.x = pB.x
    targetPivot.y = pB.y
    targetPivot.z = pB.z
  }
  blip(520)
}

export function setNav(mode: 'aerial' | 'freefly'): void {
  if (mode === 'aerial' && sim.mode !== 'aerial') {
    const ahead = Math.max(sim.nearestGap, 30)
    basisZ.set(0, 0, -1).applyQuaternion(camQuat)
    pivot.x = cam64[0] + basisZ.x * ahead
    pivot.y = cam64[1] + basisZ.y * ahead
    pivot.z = cam64[2] + basisZ.z * ahead
    airDist = ahead
    airTilt = 0.7
    airYaw = Math.atan2(pivot.z - cam64[2], pivot.x - cam64[0])
    syncAerialTargets()
    placeAerial()
  }
  sim.mode = mode
  if (mode === 'freefly') sim.follow = false
  blip(440)
}

function applyEuler(): void {
  pitch = clamp(pitch, -1.48, 1.48)
  euler.set(pitch, yaw, roll, 'YXZ')
  camQuat.setFromEuler(euler)
}

export function focusBody(id: string, instant = false): void {
  if (!BODY_BY_ID[id]) return
  sim.selected = id
  sim.target = id
  if (instant) {
    if (id === 'iss') issComposed = true
    desiredCamera(id, pA)
    putCam(pA.x, pA.y, pA.z)
    adoptAerial(id, false)
    sim.warpActive = false
    warp = null
    sim.warp = 0
    return
  }
  beginWarp(id)
}

export function beginWarp(id: string): void {
  if (!BODY_BY_ID[id]) return
  resumeAudio()
  blip(620)
  sim.selected = id
  sim.target = id
  if (id === 'iss') issComposed = true
  requestMaps(id)
  if (id === 'iss' || BODY_BY_ID[id]?.parent === 'terre') {
    requestMaps('terre')
    preloadLowEarthTiles()
  }
  readPos(id, pB, true)
  const startQuat = camQuat.clone()
  desiredCamera(id, pA)
  const tx = pA.x
  const ty = pA.y
  const tz = pA.z
  const dist = Math.hypot(tx - cam64[0], ty - cam64[1], tz - cam64[2])
  const dur = clamp(2.35 + Math.log10(dist + 10) * 0.28, 2.5, 8)
  lookToward({ x: tx, y: ty, z: tz }, pB)
  warp = {
    t: 0,
    dur,
    sx: cam64[0],
    sy: cam64[1],
    sz: cam64[2],
    tx,
    ty,
    tz,
    sq: startQuat,
    tq: camQuat.clone(),
    id,
  }
  camQuat.copy(startQuat)
  sim.warpActive = true
  sim.follow = false
  if (sim.tourId) sim.tourWarping = true
}

export function setMode(mode: CamMode): void {
  setNav(mode)
}

function stepFly(dt: number): void {
  const az = sim.layout === 'azerty'
  const forward = (sim.keys.has(az ? 'KeyZ' : 'KeyW') ? 1 : 0) - (sim.keys.has('KeyS') ? 1 : 0) + sim.stick.y
  const leftKey = az ? 'KeyQ' : 'KeyA'
  const strafe = (sim.keys.has('KeyD') ? 1 : 0) - (sim.keys.has(leftKey) ? 1 : 0) + sim.stick.x
  const up = (sim.keys.has('Space') ? 1 : 0) - (sim.keys.has('KeyC') || sim.keys.has('ControlLeft') ? 1 : 0)
  const rollKeyL = az ? 'KeyA' : 'KeyQ'
  const rollKeyR = 'KeyE'
  const rollInput = (sim.keys.has(rollKeyR) ? 1 : 0) - (sim.keys.has(rollKeyL) ? 1 : 0)
  rollVel = THREE.MathUtils.damp(rollVel, rollInput * 0.9, 4, dt)
  yaw -= sim.lookX * 0.0024
  pitch -= sim.lookY * 0.002
  sim.lookX = 0
  sim.lookY = 0
  roll += rollVel * dt
  roll *= Math.exp(-0.6 * dt)
  applyEuler()

  const gap = Math.max(sim.nearestGap, 0.4)
  const cruise = gap * 0.42 * sim.userMul * (sim.keys.has('ShiftLeft') || sim.keys.has('ShiftRight') ? 4 : 1)
  basisX.set(1, 0, 0).applyQuaternion(camQuat)
  basisY.set(0, 1, 0).applyQuaternion(camQuat)
  basisZ.set(0, 0, -1).applyQuaternion(camQuat)
  const tx = basisX.x * strafe + basisY.x * up + basisZ.x * forward
  const ty = basisX.y * strafe + basisY.y * up + basisZ.y * forward
  const tz = basisX.z * strafe + basisY.z * up + basisZ.z * forward
  const targetVx = tx * cruise
  const targetVy = ty * cruise
  const targetVz = tz * cruise
  const k = 1 - Math.exp(-sim.inertia * 3.2 * dt)
  vel.x += (targetVx - vel.x) * k
  vel.y += (targetVy - vel.y) * k
  vel.z += (targetVz - vel.z) * k
  cam64[0] += vel.x * dt
  cam64[1] += vel.y * dt
  cam64[2] += vel.z * dt
}

function azertyForward(): string {
  return sim.layout === 'azerty' ? 'KeyZ' : 'KeyW'
}

function stepAerial(dt: number): void {
  const forward =
    (sim.keys.has(azertyForward()) || sim.keys.has('ArrowUp') ? 1 : 0) -
    (sim.keys.has('KeyS') || sim.keys.has('ArrowDown') ? 1 : 0)
  const strafe =
    (sim.keys.has('KeyD') || sim.keys.has('ArrowRight') ? 1 : 0) -
    (sim.keys.has(sim.layout === 'azerty' ? 'KeyQ' : 'KeyA') || sim.keys.has('ArrowLeft') ? 1 : 0)
  const panning = Math.abs(forward) + Math.abs(strafe) > 0 || Math.abs(dragPanX) + Math.abs(dragPanY) > 0.5
  if (panning) sim.follow = false

  const lockId = sim.target && BODY_BY_ID[sim.target] ? sim.target : 'soleil'
  const lockBody = BODY_BY_ID[lockId]
  const close =
    !!lockBody &&
    ((airDist < lockBody.radius * 5 &&
      (lockBody.kind === 'planet' || lockBody.kind === 'moon' || lockBody.kind === 'star' || lockBody.kind === 'dwarf')) ||
      (lockBody.kind === 'craft' && airDist < Math.max(lockBody.radius * 8, 500)))
  if (close) {
    if (panning) {
      targetAirYaw -= strafe * 0.7 * dt + dragPanX * 0.0046
      targetAirTilt = clamp(targetAirTilt + forward * 0.45 * dt + dragPanY * 0.0034, 0.12, Math.PI / 2 - 0.02)
    }
    readPos(lockId, pB, true)
    targetPivot.x = pB.x
    targetPivot.y = pB.y
    targetPivot.z = pB.z
    if (lockId === 'iss' && (Math.abs(dragOrbitX) + Math.abs(dragOrbitY) > 0.5 || wheelZoom !== 0)) issComposed = false
    if (lockId === 'iss' && issComposed) {
      desiredCamera('iss', pA)
      const dx = pA.x - pB.x
      const dy = pA.y - pB.y
      const dz = pA.z - pB.z
      const horiz = Math.hypot(dx, dz)
      targetAirYaw = Math.atan2(dz, dx)
      targetAirTilt = horiz < 1e-3 ? Math.PI / 2 - 0.04 : Math.atan2(dy, horiz)
      targetDist = Math.max(Math.hypot(dx, dy, dz), surfaceFloor('iss'))
    }
    dragPanX = 0
    dragPanY = 0
  } else {
    const reach = Math.max(MIN_ALT, Math.min(airDist, Math.max(sim.nearestGap, MIN_ALT) * 8))
    const keyStep = reach * 0.7 * dt
    const dragStep = reach * 0.0024
    const mx = strafe * keyStep + dragPanX * dragStep
    const mz = forward * keyStep + -dragPanY * dragStep
    dragPanX = 0
    dragPanY = 0
    const cy = Math.cos(airYaw)
    const sy = Math.sin(airYaw)
    targetPivot.x += -sy * mx + -cy * mz
    targetPivot.z += cy * mx + -sy * mz
  }

  targetAirYaw -= dragOrbitX * 0.0048
  targetAirTilt = clamp(targetAirTilt - dragOrbitY * 0.0038, 0.045, Math.PI / 2 - 0.012)
  dragOrbitX = 0
  dragOrbitY = 0
  if (wheelZoom !== 0) {
    targetDist *= Math.exp(wheelZoom * 0.0015)
    wheelZoom = 0
  }
  targetDist = Math.max(targetDist, surfaceFloor(lockId))

  if (sim.follow && sim.selected && BODY_BY_ID[sim.selected]) {
    readPos(sim.selected, pB, true)
    targetPivot.x = pB.x
    targetPivot.y = pB.y
    targetPivot.z = pB.z
  }

  const kp = close ? 1 : 1 - Math.exp(-dt * 9)
  pivot.x += (targetPivot.x - pivot.x) * kp
  pivot.y += (targetPivot.y - pivot.y) * kp
  pivot.z += (targetPivot.z - pivot.z) * kp
  const logD = Math.log(Math.max(airDist, MIN_ALT))
  const logT = Math.log(Math.max(targetDist, MIN_ALT))
  airDist = Math.exp(logD + (logT - logD) * (1 - Math.exp(-dt * 7)))
  airYaw = dampAngle(airYaw, targetAirYaw, dt, 12)
  airTilt = damp(airTilt, targetAirTilt, dt, 12)
  placeAerial()
  sim.altitude = airDist
  vel.x = vel.y = vel.z = 0
}

function stepWarp(dt: number): void {
  if (!warp) return
  warp.t += dt / warp.dur
  const u = smoother(clamp(warp.t, 0, 1))
  putCam(warp.sx + (warp.tx - warp.sx) * u, warp.sy + (warp.ty - warp.sy) * u, warp.sz + (warp.tz - warp.sz) * u)
  // refresh end point so planets that moved are still met
  readPos(warp.id, pB, true)
  if (warp.id === 'iss') {
    desiredCamera('iss', pA)
    warp.tx = pA.x
    warp.ty = pA.y
    warp.tz = pA.z
  }
  const off = craftOffset(warp.id, offV)
  if (warp.id !== 'iss' && off.lengthSq() > 0 && (BODY_BY_ID[warp.id].kind === 'craft' || BODY_BY_ID[warp.id].kind === 'constellation')) {
    bodyQuaternion(warp.id, qTmp)
    xA.copy(off).applyQuaternion(qTmp)
    warp.tx = pB.x + xA.x
    warp.ty = pB.y + xA.y
    warp.tz = pB.z + xA.z
  }
  lookToward({ x: warp.tx, y: warp.ty, z: warp.tz }, pB)
  warp.tq.copy(camQuat)
  camQuat.copy(warp.sq).slerp(warp.tq, u)
  sim.warp = Math.sin(clamp(warp.t, 0, 1) * Math.PI)
  sim.fov = sim.baseFov + Math.sin(clamp(warp.t, 0, 1) * Math.PI) * 18
  if (warp.t >= 1) {
    sim.warp = 0
    sim.fov = sim.baseFov
    sim.warpActive = false
    sim.tourWarping = false
    sim.tourHold = 0
    const id = warp.id
    const touring = !!sim.tourId
    warp = null
    adoptAerial(id, touring)
    vel.x = vel.y = vel.z = 0
    blip(980)
  }
}

function stepTour(dt: number): void {
  if (!sim.tourId || sim.tourWarping || sim.warpActive) return
  const tour = TOURS.find((t) => t.id === sim.tourId)
  if (!tour) return
  const step = tour.steps[sim.tourStep]
  if (!step) {
    sim.tourId = null
    return
  }
  sim.tourHold += dt
  if (sim.tourHold >= step.hold) {
    const next = sim.tourStep + 1
    if (next >= tour.steps.length) {
      sim.tourId = null
      sim.tourHold = 0
      return
    }
    sim.tourStep = next
    sim.tourHold = 0
    beginWarp(tour.steps[next].target)
  }
}

function updateNearest(): void {
  let best = 1e40
  let id = 'soleil'
  const ids = BODY_IDS
  for (let i = 0; i < ids.length; i++) {
    const b = BODY_BY_ID[ids[i]]
    if (!b) continue
    if (b.kind === 'galaxy' || b.kind === 'nebula') continue
    readPos(b.id, pC, true)
    const dx = pC.x - cam64[0]
    const dy = pC.y - cam64[1]
    const dz = pC.z - cam64[2]
    const d = Math.hypot(dx, dy, dz) - displayRadius(b.id)
    if (d < best) {
      best = d
      id = b.id
    }
  }
  sim.nearestId = id
  sim.nearestGap = Math.max(0.2, best)
  const gap = Math.max(0, best)
  sim.band = bandOf(gap)
  sim.echelle = echelleOf(gap)
  const framed = BODY_BY_ID[sim.selected]
  if (framed && (framed.kind === 'galaxy' || framed.kind === 'nebula' || framed.kind === 'blackhole')) {
    readPos(framed.id, pC, false)
    const real = Math.hypot(pC.x, pC.y, pC.z)
    sim.echelle = echelleOf(real)
    sim.band = bandOf(real)
  }
  sim.altitude = sim.mode === 'aerial' ? airDist : gap
  const nearView = sim.echelle <= 2
  const systemView = sim.echelle === 3
  sim.bloom = sim.bloomUser * (nearView ? 0.32 : systemView ? 0 : 1)
  sim.exposure = nearView ? 0.78 : systemView ? 0.85 : 1
  readPos('jupiter', pA, true)
  readPos('saturne', pB, true)
  const dj = Math.hypot(pA.x - cam64[0], pA.y - cam64[1], pA.z - cam64[2])
  const ds = Math.hypot(pB.x - cam64[0], pB.y - cam64[1], pB.z - cam64[2])
  const rj = realRadius('jupiter')
  const rs = realRadius('saturne')
  const radio = Math.max(clamp(1 - dj / (rj * 30), 0, 1), clamp(1 - ds / (rs * 30), 0, 1))
  setRadio(radio * 0.18)
}

export function toggleScale(): void {
  const id = sim.nearestId
  readPos(id, pA, true)
  const cx = cam64[0]
  const cy = cam64[1]
  const cz = cam64[2]
  const ox = cx - pA.x
  const oy = cy - pA.y
  const oz = cz - pA.z
  sim.scaleMode = sim.scaleMode === 'real' ? 'orrery' : 'real'
  writeDisplay(sim.scaleMode === 'orrery')
  readPos(id, pA, true)
  putCam(pA.x + ox, pA.y + oy, pA.z + oz)
  if (sim.mode === 'aerial') {
    const dx = cam64[0] - cx
    const dy = cam64[1] - cy
    const dz = cam64[2] - cz
    pivot.x += dx
    pivot.y += dy
    pivot.z += dz
    targetPivot.x += dx
    targetPivot.y += dy
    targetPivot.z += dz
    placeAerial()
  }
  blip(520)
}

export function startTour(id: string): void {
  const tour = TOURS.find((t) => t.id === id)
  if (!tour) return
  sim.tourId = id
  sim.tourStep = 0
  sim.tourHold = 0
  sim.hud = true
  sim.photo = false
  beginWarp(tour.steps[0].target)
}

export function stopTour(): void {
  sim.tourId = null
  sim.tourWarping = false
}

function bootWorker(): void {
  if (worker) worker.terminate()
  worker = new Worker(new URL('../astro/kepler.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (ev: MessageEvent) => {
    const data = ev.data as {
      type: string
      asteroids?: Float32Array
      kuiper?: Float32Array
      packs?: { id: string; data: Float32Array }[]
    }
    if (data.type === 'belts' && data.asteroids && data.kuiper) {
      beltAsteroids = data.asteroids
      beltKuiper = data.kuiper
    }
    if (data.type === 'paths' && data.packs) {
      for (const p of data.packs) probePaths[p.id] = p.data
    }
  }
  const q = sim.quality
  const preset = {
    low: [500, 250],
    medium: [1600, 800],
    high: [4200, 2200],
    ultra: [8000, 3600],
  }[q]
  worker.postMessage({ type: 'belts', asteroids: preset[0], kuiper: preset[1] })
}

let pathCursor = 0
let pathJobs: [string, number, number, number][] | null = null
function ensureProbePaths(): void {
  if (!sim.layers.trajectories || sim.echelle > 4) return
  if (!pathJobs) {
    const jd1 = sim.jd
    pathJobs = [
      ['voyager1', ymdToJD(1977, 9, 5), jd1 + 365.25 * 30, 160],
      ['voyager2', ymdToJD(1977, 8, 20), jd1 + 365.25 * 30, 180],
      ['newhorizons', ymdToJD(2006, 1, 19), jd1 + 365.25 * 20, 140],
      ['pioneer10', ymdToJD(1972, 3, 2), jd1 + 365.25 * 20, 120],
      ['pioneer11', ymdToJD(1973, 4, 6), jd1 + 365.25 * 20, 120],
    ]
  }
  if (pathCursor >= pathJobs.length) return
  const [id, jd0, jdEnd, steps] = pathJobs[pathCursor]
  pathCursor += 1
  probePaths[id] = trajectorySamples(id, jd0, jdEnd, steps)
}

export function refreshBelts(): void {
  bootWorker()
}

export function boot(view: string): void {
  sim.mobile = detectMobile()
  if (sim.mobile) {
    sim.quality = 'low'
    sim.bloom = 0.28
    sim.bloomUser = 0.28
    sim.layout = 'qwerty'
  } else {
    sim.quality = 'high'
    sim.bloom = 0.78
    sim.bloomUser = 0.78
  }
  sim.layout = navigator.language.toLowerCase().startsWith('fr') && !sim.mobile ? 'azerty' : sim.layout
  initEphemeris()
  writeWorld(sim.jd)
  writeDisplay(false)
  if (!view || view === 'system' || view === 'hud') viewSolarSystem()
  else {
    const viewId: Record<string, string> = {
      sun: 'soleil',
      earth: 'terre',
      saturn: 'saturne',
      jwst: 'jwst',
      m31: 'm31',
      bh: 'sgr-a',
      iss: 'iss',
      voyager: 'voyager1',
      toile: 'cmb',
      cmb: 'cmb',
    }
    focusBody(viewId[view] ?? 'iss', true)
  }
  if (view === 'sun') {
    readPos('soleil', pB, true)
    const r = displayRadius('soleil')
    putCam(pB.x + r * 1.2, pB.y + r * 0.45, pB.z + r * 3.4)
    adoptAerial('soleil', false)
  }
  if (view === 'earth') {
    readPos('terre', pB, true)
    const r = displayRadius('terre')
    putCam(pB.x + r * 2.4, pB.y + r * 0.85, pB.z + r * 2.8)
    adoptAerial('terre', false)
  }
  if (view === 'saturn') {
    readPos('saturne', pB, true)
    const r = displayRadius('saturne')
    putCam(pB.x + r * 0.15, pB.y + r * 1.15, pB.z + r * 3.1)
    adoptAerial('saturne', false)
  }
  if (view === 'bh') {
    readPos('sgr-a', pB, true)
    const r = Math.max(displayRadius('sgr-a') * 80, BODY_BY_ID['sgr-a'].approach)
    putCam(pB.x + r * 0.34, pB.y + r * 0.42, pB.z + r * 0.78)
    adoptAerial('sgr-a', false)
  }
  prevCam.x = cam64[0]
  prevCam.y = cam64[1]
  prevCam.z = cam64[2]
  sim.ready = true
  bootWorker()
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('bench') === '1') startBench()
  window.__UNIVERS__ = {
    ready: true,
    setView: (name: string) => {
      if (name === 'system' || name === 'hud') viewSolarSystem()
      else if (name === 'iss') focusBody('iss', true)
      else boot(name)
    },
    warpTo: (id: string) => beginWarp(id),
    viewSystem: () => viewSolarSystem(),
    toggleFollow: () => toggleFollow(),
    debug: () => ({
      cam: [cam64[0], cam64[1], cam64[2]],
      pivot: [pivot.x, pivot.y, pivot.z],
      dist: airDist,
      tilt: airTilt,
      mode: sim.mode,
      follow: sim.follow,
      warp: sim.warpActive,
      target: sim.target,
      selected: sim.selected,
      gap: sim.nearestGap,
      nearest: sim.nearestId,
      speed: sim.speed,
    }),
  }
}

let frameW = 0
let frameH = 0

export function noteFrameSize(width: number, height: number): void {
  frameW = width
  frameH = height
}

const BENCH_VIEWS = ['system', 'iss', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'ganymede', 'm31'] as const
const BENCH_WARMUP = 60
const BENCH_FRAMES = 300
const benchSamples: number[] = []
const warmupSamples: number[] = []
type BenchRow = {
  view: string
  fps: number
  low: number
  ms: number
  p99ms: number
  maxMs: number
  over16: number
  over33: number
  warmupFrames: number
  warmupMs: number
  warmupMaxMs: number
}
const benchRows: BenchRow[] = []
let benchStep = -1
let benchWarm = 0

export function startBench(): void {
  sim.benchOn = true
  sim.benchNote = ''
  benchStep = 0
  benchRows.length = 0
  benchSamples.length = 0
  warmupSamples.length = 0
  benchWarm = 0
  beginBenchView(BENCH_VIEWS[0])
}

function beginBenchView(name: string): void {
  if (name === 'system') viewSolarSystem()
  else if (name === 'moon') focusBody('lune', true)
  else if (name === 'earth') focusBody('terre', true)
  else if (name === 'mars') focusBody('mars', true)
  else if (name === 'jupiter') focusBody('jupiter', true)
  else if (name === 'saturn') focusBody('saturne', true)
  else if (name === 'ganymede') focusBody('ganymede', true)
  else if (name === 'm31') focusBody('m31', true)
  else focusBody('iss', true)
  const preload: Record<string, string> = {
    iss: 'terre',
    earth: 'terre',
    moon: 'lune',
    mars: 'mars',
    jupiter: 'jupiter',
    saturn: 'saturne',
    ganymede: 'ganymede',
  }
  const body = preload[name]
  if (body) requestMaps(body)
  if (name === 'iss') preloadLowEarthTiles()
  benchSamples.length = 0
  warmupSamples.length = 0
  benchWarm = 0
}

function summarize(samples: number[]): { avg: number; max: number; over16: number; over33: number } {
  let sum = 0
  let max = 0
  let over16 = 0
  let over33 = 0
  for (let i = 0; i < samples.length; i++) {
    const dt = samples[i]
    sum += dt
    if (dt > max) max = dt
    if (dt > 1 / 60) over16 += 1
    if (dt > 1 / 30) over33 += 1
  }
  return { avg: samples.length ? sum / samples.length : 0, max, over16, over33 }
}

function finishBenchStep(name: string): void {
  const measured = summarize(benchSamples)
  const warm = summarize(warmupSamples)
  const sorted = benchSamples.slice().sort((a, b) => a - b)
  const cut = Math.max(0, Math.floor(sorted.length * 0.99))
  const p99 = sorted[Math.min(sorted.length - 1, cut)] ?? measured.avg
  benchRows.push({
    view: name,
    fps: measured.avg > 0 ? 1 / measured.avg : 0,
    low: p99 > 0 ? 1 / p99 : 0,
    ms: measured.avg * 1000,
    p99ms: p99 * 1000,
    maxMs: measured.max * 1000,
    over16: measured.over16,
    over33: measured.over33,
    warmupFrames: warmupSamples.length,
    warmupMs: warm.avg * 1000,
    warmupMaxMs: warm.max * 1000,
  })
  sim.benchNote = benchRows
    .map((r) => `${r.view} ${r.fps.toFixed(1)} fps · 1% ${r.low.toFixed(1)} · ${r.ms.toFixed(2)} ms · p99 ${r.p99ms.toFixed(2)} · max ${r.maxMs.toFixed(1)} · >16.7 ${r.over16} · >33 ${r.over33} · warmup ${r.warmupFrames} max ${r.warmupMaxMs.toFixed(1)} ms · ${frameW}×${frameH}`)
    .join('\n')
  window.__BENCH__ = benchRows.slice()
}

export function frame(dt: number, camera: THREE.PerspectiveCamera): void {
  sim.frameMs = dt * 1000
  if (sim.hidden || sim.contextLost) return
  const h = Math.min(Math.max(dt, 0.0001), 0.1)
  if (!sim.paused) sim.jd += (h * sim.timeScale) / 86400
  writeWorld(sim.jd)
  writeDisplay(sim.scaleMode === 'orrery')
  if (sim.warpActive) stepWarp(h)
  else if (sim.mode === 'freefly') stepFly(h)
  else stepAerial(h)
  stepTour(h)
  updateNearest()
  const dx = cam64[0] - prevCam.x
  const dy = cam64[1] - prevCam.y
  const dz = cam64[2] - prevCam.z
  sim.speed = Math.hypot(dx, dy, dz) / h
  prevCam.x = cam64[0]
  prevCam.y = cam64[1]
  prevCam.z = cam64[2]
  camera.position.set(0, 0, 0)
  camera.quaternion.copy(camQuat)
  camera.near = 0.08
  camera.far = 1e32
  if (Math.abs(camera.fov - sim.fov) > 0.02) {
    camera.fov = sim.fov
    camera.updateProjectionMatrix()
  }
  sim.fps = sim.fps * 0.9 + (1 / h) * 0.1
  ensureProbePaths()
  for (const fn of syncs) fn(h)
  if (sim.benchOn && !sim.warpActive && benchStep >= 0 && benchStep < BENCH_VIEWS.length) {
    const raw = Math.max(dt, 0.0001)
    if (raw > 0.0167) {
      logHitch({
        ms: raw * 1000,
        view: BENCH_VIEWS[benchStep] ?? '?',
        phase: benchWarm < BENCH_WARMUP ? 'warmup' : 'measure',
        notes: notesAround(),
      })
    }
    if (benchWarm < BENCH_WARMUP) {
      warmupSamples.push(raw)
      benchWarm += 1
    } else {
      benchSamples.push(raw)
      if (benchSamples.length >= BENCH_FRAMES) {
        finishBenchStep(BENCH_VIEWS[benchStep])
        benchStep += 1
        if (benchStep < BENCH_VIEWS.length) beginBenchView(BENCH_VIEWS[benchStep])
        else sim.benchOn = false
      }
    }
  }
}

function typingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable
}

export function bindInput(canvas: HTMLCanvasElement): () => void {
  const down = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
      e.preventDefault()
      sim.search = !sim.search
      sim.keys.delete('ControlLeft')
      return
    }
    if (typingTarget(e.target)) return
    const panKey =
      e.code === 'KeyZ' ||
      e.code === 'KeyQ' ||
      e.code === 'KeyS' ||
      e.code === 'KeyD' ||
      e.code === 'KeyW' ||
      e.code === 'KeyA' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    if (sim.mode === 'aerial' && panKey) sim.follow = false
    if (e.code === 'Space') e.preventDefault()
    sim.keys.add(e.code)
    if (e.code === 'KeyH') {
      sim.hud = !sim.hud
      if (sim.hud) sim.photo = false
    } else if (e.code === 'KeyM') {
      sim.muted = !sim.muted
      ensureAudio()
    } else if (e.code === 'KeyP') {
      sim.paused = !sim.paused
    } else if (e.code === 'KeyO') {
      toggleScale()
    } else if (e.code === 'F1') {
      e.preventDefault()
      sim.help = !sim.help
    } else if (e.code === 'KeyR') {
      viewSolarSystem()
    } else if (e.code === 'Escape') {
      sim.search = false
      sim.help = false
      if (sim.tourId) stopTour()
      document.exitPointerLock?.()
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    } else if (e.code === 'Digit1') sim.timeScale = 0
    else if (e.code === 'Digit2') {
      sim.timeScale = 1
      sim.paused = false
    } else if (e.code === 'Digit3') sim.timeScale = 3600
    else if (e.code === 'Digit4') sim.timeScale = 86400
    else if (e.code === 'Digit5') sim.timeScale = 86400 * 365.25
  }
  const up = (e: KeyboardEvent) => {
    sim.keys.delete(e.code)
  }
  const move = (e: MouseEvent) => {
    const dx = e.movementX !== 0 ? e.movementX : e.clientX - lastPX
    const dy = e.movementY !== 0 ? e.movementY : e.clientY - lastPY
    lastPX = e.clientX
    lastPY = e.clientY
    sim.dragX += dx
    sim.dragY += dy
    if (sim.mode === 'aerial' && !sim.warpActive) {
      if (leftDown || e.buttons & 1) {
        dragPanX += dx
        dragPanY += dy
      }
      if (rightDown || e.buttons & 2) {
        dragOrbitX += dx
        dragOrbitY += dy
      }
      return
    }
    if (document.pointerLockElement === canvas) {
      sim.lookX += e.movementX
      sim.lookY += e.movementY
    }
  }
  const wheel = (e: WheelEvent) => {
    e.preventDefault()
    if (sim.mode === 'aerial') wheelZoom += e.deltaY
    else sim.userMul = clamp(sim.userMul * Math.exp(-e.deltaY * 0.0012), 0.02, 200)
  }
  const armButtons = (e: MouseEvent) => {
    lastPX = e.clientX
    lastPY = e.clientY
    if (e.button === 0) leftDown = true
    if (e.button === 2) rightDown = true
  }
  const pointerDown = (e: PointerEvent) => {
    resumeAudio()
    armButtons(e)
    if (e.button !== 0) return
    if (sim.mode === 'freefly' && !sim.mobile) canvas.requestPointerLock()
    sim.dragging = true
  }
  const menu = (e: Event) => e.preventDefault()
  const touches = new Map<number, { x: number; y: number }>()
  let pinchDist = 0
  let pinchAng = 0
  let leftDown = false
  let rightDown = false
  let lastPX = 0
  let lastPY = 0
  const pointerDownTouch = (e: PointerEvent) => {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.size === 2) {
      const pair = pinchPair(touches)
      if (pair) {
        pinchDist = Math.hypot(pair.ax - pair.bx, pair.ay - pair.by)
        pinchAng = Math.atan2(pair.by - pair.ay, pair.bx - pair.ax)
      }
    }
  }
  const pointerMoveTouch = (e: PointerEvent) => {
    if (!touches.has(e.pointerId)) return
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (sim.mode !== 'aerial' || touches.size < 2) return
    const pair = pinchPair(touches)
    if (!pair) return
    const dist = Math.hypot(pair.ax - pair.bx, pair.ay - pair.by)
    const ang = Math.atan2(pair.by - pair.ay, pair.bx - pair.ax)
    if (pinchDist > 0) wheelZoom += (pinchDist - dist) * 1.6
    let dAng = ang - pinchAng
    if (dAng > Math.PI) dAng -= TAU
    if (dAng < -Math.PI) dAng += TAU
    dragOrbitX += dAng * 90
    pinchDist = dist
    pinchAng = ang
  }
  const pointerUp = (e: PointerEvent | MouseEvent) => {
    if ('pointerId' in e) touches.delete(e.pointerId)
    if (touches.size < 2) pinchDist = 0
    if (e.button === 0) leftDown = false
    if (e.button === 2) rightDown = false
    sim.dragging = false
    sim.dragX = 0
    sim.dragY = 0
  }
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('mousemove', move)
  window.addEventListener('mousedown', armButtons)
  window.addEventListener('contextmenu', menu)
  canvas.addEventListener('wheel', wheel, { passive: false })
  canvas.addEventListener('pointerdown', pointerDown)
  canvas.addEventListener('pointerdown', pointerDownTouch)
  canvas.addEventListener('pointermove', pointerMoveTouch)
  canvas.addEventListener('contextmenu', menu)
  window.addEventListener('pointerup', pointerUp)
  window.addEventListener('mouseup', pointerUp)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mousedown', armButtons)
    window.removeEventListener('contextmenu', menu)
    canvas.removeEventListener('wheel', wheel)
    canvas.removeEventListener('pointerdown', pointerDown)
    canvas.removeEventListener('pointerdown', pointerDownTouch)
    canvas.removeEventListener('pointermove', pointerMoveTouch)
    canvas.removeEventListener('contextmenu', menu)
    window.removeEventListener('pointerup', pointerUp)
    window.removeEventListener('mouseup', pointerUp)
  }
}

function pinchPair(touches: Map<number, { x: number; y: number }>): { ax: number; ay: number; bx: number; by: number } | null {
  let ax = 0
  let ay = 0
  let n = 0
  let bx = 0
  let by = 0
  for (const p of touches.values()) {
    if (n === 0) {
      ax = p.x
      ay = p.y
    } else {
      bx = p.x
      by = p.y
      return { ax, ay, bx, by }
    }
    n += 1
  }
  return null
}

const invQuat = new THREE.Quaternion()

export function screenStreak(out: THREE.Vector2): THREE.Vector2 {
  invQuat.copy(camQuat).invert()
  xA.set(vel.x, vel.y, vel.z).applyQuaternion(invQuat)
  const l = Math.hypot(xA.x, xA.y) || 1
  out.set(xA.x / l, xA.y / l)
  return out
}
