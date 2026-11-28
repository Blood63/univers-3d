import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, BrightnessContrast, ChromaticAberration, EffectComposer, FXAA, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BloomEffect, ToneMappingMode } from 'postprocessing'
import { useEffect, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { sim } from '../engine/state'

type WarmPass = { updateMaterial?: () => void; fullscreenMaterial?: THREE.Material }
type WarmComposer = { passes?: WarmPass[] }

export default function PostFX({ ca }: { ca: RefObject<{ offset: THREE.Vector2 } | null> }) {
  const bloom = useRef<BloomEffect | null>(null)
  const composer = useRef<WarmComposer | null>(null)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const [live, setLive] = useState(false)
  useEffect(() => {
    let cancel = false
    const start = () => {
      if (cancel) return
      const passes = composer.current?.passes ?? []
      const mats: THREE.Material[] = []
      for (const pass of passes) {
        pass.updateMaterial?.()
        if (pass.fullscreenMaterial) mats.push(pass.fullscreenMaterial)
      }
      const geo = new THREE.PlaneGeometry(2, 2)
      let index = 0
      const step = () => {
        if (cancel) return
        if (index >= mats.length) {
          setLive(true)
          return
        }
        const scene = new THREE.Scene()
        scene.add(new THREE.Mesh(geo, mats[index]))
        index += 1
        const compiled = gl.compileAsync ? gl.compileAsync(scene, camera) : Promise.resolve(gl.compile(scene, camera))
        void Promise.resolve(compiled)
          .catch(() => undefined)
          .then(() => {
            if (cancel) return
            const idle = window.requestIdleCallback
            if (idle) idle(() => step(), { timeout: 32 })
            else window.setTimeout(step, 0)
          })
      }
      step()
    }
    const idle = window.requestIdleCallback
    if (idle) idle(() => start(), { timeout: 180 })
    else window.setTimeout(start, 16)
    return () => {
      cancel = true
    }
  }, [camera, gl])
  useFrame(() => {
    const fx = bloom.current
    if (!fx) return
    fx.intensity = sim.bloom
    fx.luminanceMaterial.threshold = sim.echelle <= 2 ? 1.62 : 1.14
  })
  const aa = sim.quality === 'ultra' ? 'smaa' : sim.quality === 'low' ? 'none' : 'fxaa'
  return (
    <EffectComposer ref={composer as never} enabled={live} multisampling={0} frameBufferType={THREE.HalfFloatType}>
      <Bloom ref={bloom as never} intensity={sim.bloom} luminanceThreshold={1.14} mipmapBlur luminanceSmoothing={0.25} radius={0.42} />
      <ChromaticAberration ref={ca as never} offset={new THREE.Vector2(0, 0)} radialModulation modulationOffset={0.2} />
      {aa === 'smaa' ? <SMAA /> : aa === 'fxaa' ? <FXAA /> : <Vignette eskil={false} offset={0.2} darkness={0.4} />}
      <Vignette eskil={false} offset={0.16} darkness={0.62} />
      <BrightnessContrast brightness={(sim.exposure - 1) * 0.45} contrast={0.05} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
