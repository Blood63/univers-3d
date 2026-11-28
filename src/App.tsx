import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { HUD } from './hud/HUD'
import { beginWarp, bindInput, boot, frame } from './engine/runtime'
import { detectMobile, sim } from './engine/state'
import { createUniverse, type UniverseHandle } from './scene/world'
import { loadTextures } from './scene/textures'
import { applyAnisotropy, bindRenderer, markFrameStart, startHdUpgrade } from './engine/texcache'

const PostFX = lazy(() => import('./scene/PostFX'))

const glBridge: { current: THREE.WebGLRenderer | null } = { current: null }
export function capturePng(): void {
  const gl = glBridge.current
  if (!gl) return
  const a = document.createElement('a')
  a.href = gl.domElement.toDataURL('image/png')
  a.download = `univers-${Date.now()}.png`
  a.click()
}

function Scene({ textures }: { textures: Record<string, THREE.Texture> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const handle = useRef<UniverseHandle | null>(null)
  const ca = useRef<{ offset: THREE.Vector2 } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    glBridge.current = gl
    if (detectMobile()) {
      sim.quality = 'low'
      sim.bloom = 0.28
      sim.bloomUser = 0.28
    }
    const built = createUniverse(textures)
    scene.add(built.object)
    handle.current = built.handle
    bindRenderer(gl)
    let cancelled = false
    const params = new URLSearchParams(location.search)
    const renderer = gl as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Scene, c: THREE.Camera) => Promise<void> }
    const compiled = renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera))
    void Promise.resolve(compiled)
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return
        try {
          boot(params.get('vue') || 'system')
          startHdUpgrade(sim.quality)
        } catch (err) {
          const message = err instanceof Error ? err.stack ?? err.message : String(err)
          document.documentElement.dataset.booterr = message.slice(0, 500)
          sim.ready = true
        }
      })
    const canvas = gl.domElement
    const onLost = (e: Event) => {
      e.preventDefault()
      sim.contextLost = true
    }
    const onRestored = () => {
      sim.contextLost = false
      window.location.reload()
    }
    const onVis = () => {
      sim.hidden = document.hidden
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    document.addEventListener('visibilitychange', onVis)
    const unbind = bindInput(canvas)
    const onUp = (e: PointerEvent) => {
      if (Math.abs(sim.dragX) + Math.abs(sim.dragY) > 6) return
      const rect = canvas.getBoundingClientRect()
      const id = built.handle.pick(camera, e.clientX - rect.left, e.clientY - rect.top)
      if (id) {
        sim.selected = id
        if (!e.shiftKey) {
          beginWarp(id)
        } else if (!sim.rulerA || sim.rulerA === id) sim.rulerA = id
        else sim.rulerB = id
      }
    }
    canvas.addEventListener('pointerup', onUp)
    const pump = window.setInterval(() => setTick((n) => n + 1), 400)
    return () => {
      cancelled = true
      unbind()
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('pointerup', onUp)
      window.clearInterval(pump)
      scene.remove(built.object)
      built.handle.dispose()
    }
  }, [camera, gl, scene, textures])

  const fpsWindow = useRef({ frames: 0, stamp: performance.now() })
  useEffect(() => {
    gl.info.autoReset = false
  }, [gl])

  useFrame((_, dt) => {
    markFrameStart()
    if (!sim.ready || !handle.current) return
    const w = gl.domElement.clientWidth
    const h = gl.domElement.clientHeight
    frame(dt, camera)
    handle.current.update(dt, camera, w, h)
    if (ca.current) ca.current.offset.set(sim.warp * 0.004, sim.warp * 0.001)
  })

  useFrame(() => {
    sim.draws = gl.info.render.calls
    const bucket = fpsWindow.current
    bucket.frames += 1
    const now = performance.now()
    const elapsed = now - bucket.stamp
    if (elapsed >= 400) {
      sim.fps = (bucket.frames * 1000) / elapsed
      bucket.frames = 0
      bucket.stamp = now
    }
    sim.tris = gl.info.render.triangles
    sim.texCount = gl.info.memory.textures
    gl.info.reset()
  }, 2)

  void tick
  return (
    <Suspense fallback={null}>
      <PostFX ca={ca} />
    </Suspense>
  )
}

export default function App() {
  const [textures, setTextures] = useState<Record<string, THREE.Texture> | null>(null)
  const [progress, setProgress] = useState(0)
  const [dpr, setDpr] = useState(() => {
    const mobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 860
    const cap = mobile ? 1 : 1.25
    return Math.min(window.devicePixelRatio || 1, cap)
  })
  const ui = 0

  useEffect(() => {
    let alive = true
    const started = performance.now()
    loadTextures((r) => alive && setProgress(r)).then((t) => alive && setTextures(t))
    let lowFor = 0
    let highFor = 0
    const id = window.setInterval(() => {
      if (sim.benchOn || performance.now() - started < 8000) return
      const cap = sim.quality === 'ultra' ? 1.5 : sim.quality === 'high' ? 1.25 : sim.quality === 'medium' ? 1 : 0.9
      const floor = sim.quality === 'low' ? 0.75 : 0.85
      if (sim.fps > 0 && sim.fps < 55) {
        lowFor += 0.5
        highFor = 0
      } else if (sim.fps > 70) {
        highFor += 0.5
        lowFor = 0
      }
      if (lowFor >= 2) {
        sim.dprBias = Math.max(floor / cap, sim.dprBias * 0.85)
        lowFor = 0
      } else if (highFor >= 2) {
        sim.dprBias = Math.min(1, sim.dprBias * 1.08)
        highFor = 0
      }
      const want = Math.min(window.devicePixelRatio || 1, cap) * sim.dprBias
      setDpr((prev) => (Math.abs(prev - want) > 0.04 ? want : prev))
    }, 500)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  return (
    <div className="relative h-full w-full">
      {!textures && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <div className="text-xs tracking-[0.35em] text-[#9ec5ff]">UNIVERS</div>
          <div className="h-px w-48 bg-white/10">
            <div className="h-px bg-[#f0c27a]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="mono text-[11px] text-white/50">Chargement des cartes {Math.round(progress * 100)} %</div>
        </div>
      )}
      {textures && (
        <Canvas
          className="h-full w-full touch-none"
          dpr={dpr}
          gl={{
            antialias: false,
            logarithmicDepthBuffer: true,
            toneMapping: THREE.NoToneMapping,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance',
            alpha: false,
          }}
          camera={{ fov: 58, near: 0.08, far: 1e32, position: [0, 0, 0] }}
          onCreated={({ gl }) => {
            gl.getContext().getExtension('KHR_parallel_shader_compile')
            gl.setClearColor('#000005')
            if (textures) applyAnisotropy(textures, gl.capabilities.getMaxAnisotropy())
          }}
        >
          <Suspense fallback={null}>
            <Scene textures={textures} />
          </Suspense>
        </Canvas>
      )}
      {textures && <HUD nonce={ui} />}
      <div
        className="flare"
        style={{
          opacity: 0,
        }}
        id="sun-flare"
      />
    </div>
  )
}
