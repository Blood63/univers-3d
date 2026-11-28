const recent: { t: number; label: string }[] = []

export function note(label: string): void {
  const t = performance.now()
  recent.push({ t, label })
  if (recent.length > 48) recent.shift()
  performance.mark(label)
}

export function notesAround(now = performance.now()): string[] {
  return recent.filter((entry) => now - entry.t < 80).map((entry) => entry.label)
}

export type Hitch = {
  ms: number
  view: string
  phase: 'warmup' | 'measure'
  frame: number
  notes: string[]
}

const hitches: Hitch[] = []

export function logHitch(hit: Hitch): void {
  hitches.push(hit)
  const list = (window as unknown as { __HITCHES__?: Hitch[] }).__HITCHES__ ?? []
  list.push(hit)
  if (list.length > 40) list.splice(0, list.length - 40)
  ;(window as unknown as { __HITCHES__?: Hitch[] }).__HITCHES__ = list
  if (hit.ms > 16.7) console.info('[hitch]', hit.ms.toFixed(1), hit.phase, hit.view, hit.frame, hit.notes.join(' | '))
}

export function takeHitches(): Hitch[] {
  const out = hitches.slice()
  hitches.length = 0
  return out
}

const spans: { label: string; ms: number }[] = []
let committed: string[] = []

/** Record a slice of the frame that just ran. The next frame's dt includes it. */
export function span(label: string, ms: number): void {
  if (ms < 0.3) return
  spans.push({ label, ms })
}

export function commitSpans(): void {
  committed = spans.map((entry) => `${entry.label}:${entry.ms.toFixed(1)}`)
  spans.length = 0
}

export function lastSpans(): string[] {
  return committed
}

let resolvePost = () => {}
/** Resolves once post passes are compiled and their targets exist, before the bench clock. */
export const postReady: Promise<void> = new Promise((resolve) => {
  resolvePost = resolve
})

export function markPostReady(): void {
  note('post-ready')
  resolvePost()
}
