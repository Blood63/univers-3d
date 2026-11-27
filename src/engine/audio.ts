import { sim } from './state'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let droneGain: GainNode | null = null
let radioGain: GainNode | null = null
let started = false

function noiseBuffer(ac: AudioContext): AudioBuffer {
  const len = ac.sampleRate * 2
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  let s = 0
  for (let i = 0; i < len; i++) {
    s = (s + 0.02 * (Math.random() * 2 - 1)) * 0.98
    data[i] = s * 0.6 + (Math.random() * 2 - 1) * 0.4
  }
  return buf
}

export function ensureAudio(): void {
  if (started || sim.muted) return
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0.22
  master.connect(ctx.destination)

  droneGain = ctx.createGain()
  droneGain.gain.value = 0.35
  droneGain.connect(master)

  const oscA = ctx.createOscillator()
  oscA.type = 'sine'
  oscA.frequency.value = 55
  const oscB = ctx.createOscillator()
  oscB.type = 'sine'
  oscB.frequency.value = 82.5
  const oscC = ctx.createOscillator()
  oscC.type = 'triangle'
  oscC.frequency.value = 110
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 240
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.05
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 40
  lfo.connect(lfoGain)
  lfoGain.connect(filter.frequency)
  oscA.connect(filter)
  oscB.connect(filter)
  oscC.connect(filter)
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer(ctx)
  noise.loop = true
  const nFilter = ctx.createBiquadFilter()
  nFilter.type = 'bandpass'
  nFilter.frequency.value = 180
  nFilter.Q.value = 0.7
  const nGain = ctx.createGain()
  nGain.gain.value = 0.08
  noise.connect(nFilter)
  nFilter.connect(nGain)
  nGain.connect(droneGain)
  filter.connect(droneGain)
  oscA.start()
  oscB.start()
  oscC.start()
  lfo.start()
  noise.start()

  radioGain = ctx.createGain()
  radioGain.gain.value = 0
  radioGain.connect(master)
  const radio = ctx.createBufferSource()
  radio.buffer = noiseBuffer(ctx)
  radio.loop = true
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 740
  bp.Q.value = 6
  const trem = ctx.createOscillator()
  trem.frequency.value = 7
  const tremGain = ctx.createGain()
  tremGain.gain.value = 400
  trem.connect(tremGain)
  tremGain.connect(bp.frequency)
  radio.connect(bp)
  bp.connect(radioGain)
  radio.start()
  trem.start()
  started = true
  applyMute()
}

export function applyMute(): void {
  if (!master || !ctx) return
  master.gain.setTargetAtTime(sim.muted ? 0 : 0.22, ctx.currentTime, 0.05)
}

export function setRadio(amount: number): void {
  if (!radioGain || !ctx) return
  radioGain.gain.setTargetAtTime(sim.muted ? 0 : amount, ctx.currentTime, 0.1)
}

export function blip(freq = 880): void {
  if (!ctx || !master || sim.muted || ctx.state !== 'running') return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)
  o.connect(g)
  g.connect(master)
  o.start()
  o.stop(ctx.currentTime + 0.14)
}

export function resumeAudio(): void {
  ensureAudio()
  if (ctx?.state === 'suspended') void ctx.resume()
}
