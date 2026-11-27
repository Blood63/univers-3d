import { Canvas, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import { BODY_BY_ID, BODY_IDS } from '../astro/catalog'
import { formatDist } from '../astro/math'
import { sim } from '../engine/state'

function Row({ ids }: { ids: string[] }) {
  const bodies = ids.map((id) => BODY_BY_ID[id]).filter(Boolean)
  const maxR = Math.max(...bodies.map((b) => b.radius), 1)
  const gap = maxR * 2.8
  const span = Math.max(gap * Math.max(bodies.length - 1, 1) + maxR * 2, maxR * 3)
  const meshes = useMemo(() => bodies, [bodies])
  const lookX = ((bodies.length - 1) * gap) / 2
  return (
    <>
      <color attach="background" args={['#070b12']} />
      <Frame lookX={lookX} span={span} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 8]} intensity={2.4} />
      <gridHelper args={[span * 1.4, 12, '#355', '#243']} position={[lookX, -maxR * 1.05, 0]} />
      {meshes.map((b, i) => (
        <mesh key={b.id} position={[i * gap, 0, 0]}>
          <sphereGeometry args={[b.radius, 48, 32]} />
          <meshStandardMaterial color={b.color} roughness={0.55} metalness={0.08} />
        </mesh>
      ))}
    </>
  )
}

function Frame({ lookX, span }: { lookX: number; span: number }) {
  const camera = useThree((s) => s.camera)
  useLayoutEffect(() => {
    camera.position.set(lookX, span * 0.18, span * 0.95)
    camera.lookAt(lookX, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, lookX, span])
  return null
}

export function Comparator({ onClose }: { onClose: () => void }) {
  const ids = sim.compIds.filter((id) => BODY_BY_ID[id])
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#04070d]/80">
      <div className="flex items-center justify-between px-5 py-3">
        <div>
          <div className="text-xs tracking-[0.22em] text-[#9ec5ff]">COMPARATEUR</div>
          <div className="text-lg">Tailles réelles, côte à côte</div>
        </div>
        <button className="hud-btn" onClick={onClose}>
          Fermer
        </button>
      </div>
      <div className="flex gap-3 px-5">
        {[0, 1, 2].map((i) => (
          <select
            key={i}
            className="glass mono rounded-full px-3 py-2 text-xs"
            value={sim.compIds[i] ?? ''}
            onChange={(e) => {
              sim.compIds[i] = e.target.value
              onClose()
              sim.comparator = true
            }}
          >
            {BODY_IDS.map((id) => (
              <option key={id} value={id}>
                {BODY_BY_ID[id].name}
              </option>
            ))}
          </select>
        ))}
      </div>
      <div className="relative mx-5 mt-3 flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Canvas camera={{ position: [0, 0, 10], fov: 42 }} gl={{ antialias: true }}>
          <Row ids={ids} />
        </Canvas>
        <div className="pointer-events-none absolute bottom-3 left-0 right-0 flex justify-around text-center">
          {ids.map((id) => (
            <div key={id}>
              <div className="text-sm">{BODY_BY_ID[id].name}</div>
              <div className="mono text-[11px] text-[#9ec5ff]">Ø {formatDist(BODY_BY_ID[id].radius * 2)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
