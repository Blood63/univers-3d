import { BODY_BY_ID } from './catalog'
import { AU, LY } from './math'

/** Ten continuous scales, 1 m → 46.5 billion light-years. */
export const ECHELLE_MAX = 10

export const ECHELLE_LABEL = [
  '',
  'E1 · Proximité',
  'E2 · Orbite',
  'E3 · Système solaire',
  'E4 · Nuage d’Oort',
  'E5 · Voisinage stellaire',
  'E6 · Voie lactée',
  'E7 · Groupe local',
  'E8 · Amas de la Vierge',
  'E9 · Laniakea',
  'E10 · Toile & CMB',
] as const

const GLY = 1e9 * LY

export function echelleOf(distM: number): number {
  const au = distM / AU
  const ly = distM / LY
  if (distM < 5e4) return 1
  if (distM < 2e9) return 2
  if (au < 150) return 3
  if (ly < 1.5) return 4
  if (ly < 1000) return 5
  if (ly < 1.5e5) return 6
  if (ly < 1e7) return 7
  if (ly < 1.2e8) return 8
  if (ly < 1e9) return 9
  return 10
}

/** 0 at the low edge of a scale, 1 at the high edge. Used for cross-fades. */
export function echelleBlend(distM: number): { index: number; t: number } {
  const index = echelleOf(distM)
  const edges = [0, 5e4, 2e9, 150 * AU, 1.5 * LY, 1000 * LY, 1.5e5 * LY, 1e7 * LY, 1.2e8 * LY, 1e9 * LY, 46.5 * GLY]
  const a = edges[index - 1] ?? 1
  const b = edges[index] ?? edges[edges.length - 1]
  const t = Math.log(Math.max(distM, 1) / Math.max(a, 1)) / Math.log(Math.max(b, a * 1.01) / Math.max(a, 1))
  return { index, t: Math.max(0, Math.min(1, t)) }
}

export interface Crumb {
  id: string
  label: string
  target: string
}

export function breadcrumbs(nearestId: string, echelle: number): Crumb[] {
  const chain: Crumb[] = [{ id: 'univers', label: 'Univers observable', target: 'cmb' }]
  if (echelle <= 9) chain.push({ id: 'laniakea', label: 'Laniakea', target: 'laniakea' })
  if (echelle <= 8) chain.push({ id: 'vierge', label: 'Amas de la Vierge', target: 'm87' })
  if (echelle <= 7) chain.push({ id: 'local', label: 'Groupe local', target: 'm31' })
  if (echelle <= 6) chain.push({ id: 'mw', label: 'Voie lactée', target: 'mw' })
  if (echelle <= 5) chain.push({ id: 'orion', label: 'Bras d’Orion', target: 'soleil' })
  if (echelle <= 4) chain.push({ id: 'sys', label: 'Système solaire', target: 'soleil' })
  const body = BODY_BY_ID[nearestId]
  if (body && echelle <= 3) {
    const parent = body.parent ? BODY_BY_ID[body.parent] : undefined
    if (parent && parent.id !== 'soleil') chain.push({ id: parent.id, label: parent.name, target: parent.id })
    if (body.id !== 'soleil') chain.push({ id: body.id, label: body.name, target: body.id })
  }
  return chain
}

export const ALT_MIN = 5
export const ALT_MAX = 46.5 * GLY

export function altitudeToSlider(meters: number): number {
  const d = Math.max(meters, ALT_MIN)
  return (Math.log(d) - Math.log(ALT_MIN)) / (Math.log(ALT_MAX) - Math.log(ALT_MIN))
}

export function sliderToAltitude(t: number): number {
  const u = Math.max(0, Math.min(1, t))
  return Math.exp(Math.log(ALT_MIN) + u * (Math.log(ALT_MAX) - Math.log(ALT_MIN)))
}
