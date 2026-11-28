import { useFrame } from '@react-three/fiber'
import { Bloom, BrightnessContrast, ChromaticAberration, EffectComposer, FXAA, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BloomEffect, ToneMappingMode } from 'postprocessing'
import { useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { sim } from '../engine/state'

export default function PostFX({ ca }: { ca: RefObject<{ offset: THREE.Vector2 } | null> }) {
  const bloom = useRef<BloomEffect | null>(null)
  useFrame(() => {
    const fx = bloom.current
    if (!fx) return
    fx.intensity = sim.bloom
    fx.luminanceMaterial.threshold = sim.echelle <= 2 ? 1.62 : 1.14
  })
  const aa = sim.quality === 'ultra' ? 'smaa' : sim.quality === 'low' ? 'none' : 'fxaa'
  return (
    <EffectComposer multisampling={0} frameBufferType={THREE.HalfFloatType}>
      <Bloom ref={bloom as never} intensity={sim.bloom} luminanceThreshold={1.14} mipmapBlur luminanceSmoothing={0.25} radius={0.42} />
      <ChromaticAberration ref={ca as never} offset={new THREE.Vector2(0, 0)} radialModulation modulationOffset={0.2} />
      {aa === 'smaa' ? <SMAA /> : aa === 'fxaa' ? <FXAA /> : <Vignette eskil={false} offset={0.2} darkness={0.4} />}
      <Vignette eskil={false} offset={0.16} darkness={0.62} />
      <BrightnessContrast brightness={(sim.exposure - 1) * 0.45} contrast={0.05} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
