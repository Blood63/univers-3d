/** Ceinture d'astéroïdes et de Kuiper : éléments orbitaux seulement (pas le catalogue). */

const AU = 1.495978707e11
const YEAR = 365.25 * 86400
const STRIDE = 9

export interface BeltMsg {
  type: 'belts'
  asteroids: number
  kuiper: number
}

function buildBelt(kind: 'asteroids' | 'kuiper', count: number, seed: number): Float32Array {
  let s = seed >>> 0
  const rand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
  const data = new Float32Array(count * STRIDE)
  const inner = kind === 'asteroids' ? 2.1 : 32
  const outer = kind === 'asteroids' ? 3.3 : 50
  const thick = kind === 'asteroids' ? 0.18 : 0.35
  const gm = 1.32712440018e20
  for (let i = 0; i < count; i++) {
    const au = inner + (outer - inner) * Math.pow(rand(), 0.85)
    const a = au * AU
    const rate = Math.sqrt(gm / (a * a * a)) * YEAR
    const o = i * STRIDE
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

self.onmessage = (ev: MessageEvent<BeltMsg>) => {
  const msg = ev.data
  if (msg.type !== 'belts') return
  const asteroids = buildBelt('asteroids', msg.asteroids, 0x51a7)
  const kuiper = buildBelt('kuiper', msg.kuiper, 0xc0de)
  self.postMessage({ type: 'belts', asteroids, kuiper, stride: STRIDE }, [asteroids.buffer, kuiper.buffer])
}
