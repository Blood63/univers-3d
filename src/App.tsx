import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, BrightnessContrast, ChromaticAberration, EffectComposer, FXAA, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Suspense, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { HUD } from './hud/HUD'
import { bindInput, boot, frame } from './engine/runtime'
import { sim } from './engine/state'
import { createUniverse, type UniverseHandle } from './scene/world'
import { loadTextures } from './scene/textures'

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
    const built = createUniverse(textures)
    scene.add(built.object)
    handle.current = built.handle
    const params = new URLSearchParams(location.search)
    try {
      boot(params.get('vue') || 'iss')
    } catch (err) {
      const message = err instanceof Error ? err.stack ?? err.message : String(err)
      document.documentElement.dataset.booterr = message.slice(0, 500)
      sim.ready = true
    }
    const canvas = gl.domElement
    const unbind = bindInput(canvas)
    const onUp = (e: PointerEvent) => {
      if (Math.abs(sim.dragX) + Math.abs(sim.dragY) > 6) return
      const rect = canvas.getBoundingClientRect()
      const id = built.handle.pick(camera, e.clientX - rect.left, e.clientY - rect.top)
      if (id) {
        sim.selected = id
        if (!e.shiftKey) {
          import('./engine/runtime').then((m) => m.beginWarp(id))
        } else if (!sim.rulerA || sim.rulerA === id) sim.rulerA = id
        else sim.rulerB = id
      }
    }
    canvas.addEventListener('pointerup', onUp)
    const pump = window.setInterval(() => setTick((n) => n + 1), 400)
    return () => {
      unbind()
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
    gl.info.reset()
  }, 2)

  const aa = sim.quality === 'ultra' ? 'smaa' : sim.quality === 'low' ? 'none' : 'fxaa'
  void tick
  return (
    <>
      <EffectComposer multisampling={0} frameBufferType={THREE.HalfFloatType}>
        <Bloom intensity={sim.bloom} luminanceThreshold={1.08} mipmapBlur luminanceSmoothing={0.22} radius={0.72} />
        <ChromaticAberration ref={ca as never} offset={new THREE.Vector2(0, 0)} radialModulation modulationOffset={0.2} />
        {aa === 'smaa' ? <SMAA /> : <FXAA />}
        <Vignette eskil={false} offset={0.16} darkness={0.62} />
        <BrightnessContrast brightness={(sim.exposure - 1) * 0.45} contrast={0.05} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  )
}

export default function App() {
  const [textures, setTextures] = useState<Record<string, THREE.Texture> | null>(null)
  const [progress, setProgress] = useState(0)
  const [dpr, setDpr] = useState(1)
  const [ui, setUi] = useState(0)

  useEffect(() => {
    let alive = true
    loadTextures((r) => alive && setProgress(r)).then((t) => alive && setTextures(t))
    const id = window.setInterval(() => {
      const want = Math.min(window.devicePixelRatio || 1, sim.quality === 'ultra' ? 1.75 : sim.quality === 'high' ? 1.4 : 1)
      setDpr((prev) => (Math.abs(prev - want) > 0.05 ? want : prev))
      setUi((n) => n + 1)
    }, 250)
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
            gl.setClearColor('#000005')
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
