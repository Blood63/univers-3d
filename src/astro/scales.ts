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

export function breadcrumbs(selectedId: string): Crumb[] {
  const body = BODY_BY_ID[selectedId] ?? BODY_BY_ID.soleil
  const chain: Crumb[] = [{ id: 'univers', label: 'Univers observable', target: 'cmb' }]
  const ly = body.sky?.[2]
  if (body.kind === 'blackhole' || body.kind === 'pulsar' || body.id === 'sgr-a') {
    chain.push({ id: 'laniakea', label: 'Laniakea', target: 'laniakea' })
    chain.push({ id: 'local', label: 'Groupe local', target: 'm31' })
    chain.push({ id: 'mw', label: 'Voie lactée', target: 'mw' })
    if (body.id === 'sgr-a') chain.push({ id: 'centre', label: 'Centre galactique', target: 'sgr-a' })
    chain.push({ id: body.id, label: body.name, target: body.id })
    return chain
  }
  if (body.kind === 'galaxy' || body.kind === 'nebula' || body.category === 'phenomene') {
    chain.push({ id: 'laniakea', label: 'Laniakea', target: 'laniakea' })
    if (ly === undefined || ly < 8e6) chain.push({ id: 'local', label: 'Groupe local', target: 'm31' })
    chain.push({ id: body.id, label: body.name, target: body.id })
    return chain
  }
  if (body.kind === 'star' && ly !== undefined) {
    chain.push({ id: 'laniakea', label: 'Laniakea', target: 'laniakea' })
    chain.push({ id: 'local', label: 'Groupe local', target: 'm31' })
    chain.push({ id: 'mw', label: 'Voie lactée', target: 'mw' })
    if (ly < 5000) chain.push({ id: 'orion', label: 'Bras d’Orion', target: 'soleil' })
    chain.push({ id: body.id, label: body.name, target: body.id })
    return chain
  }
  chain.push({ id: 'laniakea', label: 'Laniakea', target: 'laniakea' })
  chain.push({ id: 'local', label: 'Groupe local', target: 'm31' })
  chain.push({ id: 'mw', label: 'Voie lactée', target: 'mw' })
  chain.push({ id: 'sys', label: 'Système solaire', target: 'soleil' })
  if (body.id === 'soleil') {
    chain.push({ id: 'soleil', label: 'Soleil', target: 'soleil' })
    return chain
  }
  const parents: Crumb[] = []
  const seen = new Set<string>()
  let cur: typeof body | undefined = body
  while (cur && cur.id !== 'soleil' && !seen.has(cur.id)) {
    seen.add(cur.id)
    parents.unshift({ id: cur.id, label: cur.name, target: cur.id })
    cur = cur.parent ? BODY_BY_ID[cur.parent] : undefined
  }
  chain.push(...parents)
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
