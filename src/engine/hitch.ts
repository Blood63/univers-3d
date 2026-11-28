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

export type Hitch = { ms: number; view: string; phase: string; notes: string[] }

const hitches: Hitch[] = []

export function logHitch(hit: Hitch): void {
  hitches.push(hit)
  if (hitches.length > 24) hitches.shift()
  const list = (window as unknown as { __HITCHES__?: Hitch[] }).__HITCHES__ ?? []
  list.push(hit)
  ;(window as unknown as { __HITCHES__?: Hitch[] }).__HITCHES__ = list
  console.info('[hitch]', hit.ms.toFixed(1), hit.phase, hit.view, hit.notes.join(' | '))
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
