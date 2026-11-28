import { Bloom, BrightnessContrast, ChromaticAberration, EffectComposer, FXAA, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { type RefObject } from 'react'
import * as THREE from 'three'
import { sim } from '../engine/state'

export default function PostFX({ ca }: { ca: RefObject<{ offset: THREE.Vector2 } | null> }) {
  const aa = sim.quality === 'ultra' ? 'smaa' : sim.quality === 'low' ? 'none' : 'fxaa'
  return (
    <EffectComposer multisampling={0} frameBufferType={THREE.HalfFloatType}>
      <Bloom intensity={sim.bloom} luminanceThreshold={1.14} mipmapBlur luminanceSmoothing={0.25} radius={0.68} />
      <ChromaticAberration ref={ca as never} offset={new THREE.Vector2(0, 0)} radialModulation modulationOffset={0.2} />
      {aa === 'smaa' ? <SMAA /> : aa === 'fxaa' ? <FXAA /> : <Vignette eskil={false} offset={0.2} darkness={0.4} />}
      <Vignette eskil={false} offset={0.16} darkness={0.62} />
      <BrightnessContrast brightness={(sim.exposure - 1) * 0.45} contrast={0.05} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
