import { dateToJD, type ScaleBand } from '../astro/math'

export type Quality = 'low' | 'medium' | 'high' | 'ultra'
export type CamMode = 'freefly' | 'orbit' | 'surface' | 'chase'
export type ScaleMode = 'real' | 'orrery'
export type Layout = 'azerty' | 'qwerty'

export interface Layers {
  orbits: boolean
  trajectories: boolean
  labels: boolean
  constellations: boolean
  ecliptic: boolean
  galactic: boolean
  habitable: boolean
  heliosphere: boolean
  debris: boolean
  groundTrack: boolean
}

export const QUALITY_PRESET: Record<
  Quality,
  { stars: number; asteroids: number; kuiper: number; starlink: number; seg: number; bloom: number; dpr: number; aa: 'none' | 'fxaa' | 'smaa' }
> = {
  low: { stars: 2200, asteroids: 500, kuiper: 250, starlink: 70, seg: 28, bloom: 0.28, dpr: 1, aa: 'none' },
  medium: { stars: 4800, asteroids: 1600, kuiper: 800, starlink: 180, seg: 40, bloom: 0.5, dpr: 1, aa: 'fxaa' },
  high: { stars: 9000, asteroids: 4200, kuiper: 2200, starlink: 380, seg: 64, bloom: 0.78, dpr: 1.5, aa: 'fxaa' },
  ultra: { stars: 14000, asteroids: 8000, kuiper: 3600, starlink: 640, seg: 80, bloom: 1.05, dpr: 1.75, aa: 'smaa' },
}

export const cam64 = new Float64Array(3)

export const sim = {
  jd: dateToJD(new Date()),
  timeScale: 1,
  paused: false,
  scaleMode: 'real' as ScaleMode,
  quality: 'high' as Quality,
  mobile: false,
  layout: 'azerty' as Layout,
  mode: 'freefly' as CamMode,
  target: 'iss',
  selected: 'iss',
  fov: 58,
  baseFov: 58,
  userMul: 1,
  inertia: 0.85,
  warp: 0,
  warpActive: false,
  bloom: 0.78,
  starDensity: 1,
  exposure: 1,
  dof: 0,
  photo: false,
  hud: true,
  muted: false,
  help: false,
  search: false,
  fps: 60,
  draws: 0,
  nearestId: 'iss',
  nearestGap: 20,
  band: 'sonde' as ScaleBand,
  speed: 0,
  tourId: null as string | null,
  tourStep: 0,
  tourHold: 0,
  tourWarping: false,
  comparator: false,
  compIds: ['terre', 'jupiter', 'soleil'] as string[],
  rulerA: 'terre',
  rulerB: 'lune',
  layers: {
    orbits: true,
    trajectories: true,
    labels: true,
    constellations: false,
    ecliptic: false,
    galactic: false,
    habitable: false,
    heliosphere: false,
    debris: false,
    groundTrack: true,
  } as Layers,
  hover: null as string | null,
  ready: false,
  keys: new Set<string>(),
  stick: { x: 0, y: 0 },
  lookX: 0,
  lookY: 0,
  dragging: false,
  dragX: 0,
  dragY: 0,
  orbitYaw: 0.5,
  orbitPitch: 0.35,
  orbitDist: 40,
  surfaceAlt: 0,
  surfaceRight: 0,
  surfaceUp: 0,
  surfaceLook: 0,
}

export interface LabelSprite {
  id: string
  name: string
  x: number
  y: number
  sub: string
}

export const labelFrame: { items: LabelSprite[]; flare: { x: number; y: number; a: number } } = {
  items: [],
  flare: { x: 0, y: 0, a: 0 },
}

export function detectMobile(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia('(pointer: coarse)').matches
  return coarse || window.innerWidth < 860
}
