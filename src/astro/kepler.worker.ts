import { BELT_STRIDE, buildBelt, trajectorySamples, writeWorld, WORLD } from './ephemeris'
import { ymdToJD } from './math'

export interface BeltMsg {
  type: 'belts'
  asteroids: number
  kuiper: number
}

export interface PathMsg {
  type: 'paths'
  jd: number
}

export interface EphMsg {
  type: 'ephemeris'
  jd: number
  token: number
}

self.onmessage = (ev: MessageEvent<BeltMsg | PathMsg | EphMsg>) => {
  const msg = ev.data
  if (msg.type === 'belts') {
    const asteroids = buildBelt('asteroids', msg.asteroids, 0x51a7)
    const kuiper = buildBelt('kuiper', msg.kuiper, 0xc0de)
    self.postMessage({ type: 'belts', asteroids, kuiper, stride: BELT_STRIDE }, [asteroids.buffer, kuiper.buffer])
    return
  }
  if (msg.type === 'paths') {
    const jd1 = msg.jd
    const packs = [
      { id: 'voyager1', data: trajectorySamples('voyager1', ymdToJD(1977, 9, 5), jd1 + 365.25 * 30, 240) },
      { id: 'voyager2', data: trajectorySamples('voyager2', ymdToJD(1977, 8, 20), jd1 + 365.25 * 30, 280) },
      { id: 'newhorizons', data: trajectorySamples('newhorizons', ymdToJD(2006, 1, 19), jd1 + 365.25 * 20, 200) },
      { id: 'pioneer10', data: trajectorySamples('pioneer10', ymdToJD(1972, 3, 2), jd1 + 365.25 * 20, 160) },
      { id: 'pioneer11', data: trajectorySamples('pioneer11', ymdToJD(1973, 4, 6), jd1 + 365.25 * 20, 180) },
    ]
    const transfers = packs.map((p) => p.data.buffer)
    self.postMessage({ type: 'paths', packs }, transfers)
    return
  }
  if (msg.type === 'ephemeris') {
    writeWorld(msg.jd)
    const buf = new Float64Array(WORLD)
    self.postMessage({ type: 'ephemeris', jd: msg.jd, token: msg.token, buf }, [buf.buffer])
  }
}
