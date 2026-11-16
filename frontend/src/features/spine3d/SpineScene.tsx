import { Html, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { statusWord, type Status } from '../../components/ui'
import type { SpineItem, SpineLayout } from './buildSpineLayout'
import { colorForLevel, useThemeColors } from './statusColor'

export interface ViewApi {
  reset: () => void
  fit: () => void
}

interface SceneProps {
  layout: SpineLayout
  statuses?: Record<string, Status>
  selected?: string | null
  onSelect?: (level: string | null) => void
  /** 0 stacked .. 1 spread apart; driven by scroll on the landing page. */
  spreadValue?: MotionValue<number>
  interactive?: boolean
  /** Orbit, zoom and pan with the pointer. Off for the landing figure so touch scrolling still works. */
  orbit?: boolean
  apiRef?: MutableRefObject<ViewApi | null>
  className?: string
}

// Geometries are created once and shared by every mesh, then scaled per element.
let shared: { body: THREE.BufferGeometry; box: THREE.BufferGeometry; disc: THREE.BufferGeometry } | null = null
function geometries() {
  shared ??= { body: new RoundedBoxGeometry(1, 1, 1, 3, 0.14), box: new THREE.BoxGeometry(1, 1, 1), disc: new THREE.CylinderGeometry(0.5, 0.5, 1, 28) }
  return shared
}

function Element({ item, color, selected, spreadValue, interactive, onSelect, onHover }: { item: SpineItem; color: string; selected: boolean; spreadValue?: MotionValue<number>; interactive: boolean; onSelect?: (l: string | null) => void; onHover: (l: string | null) => void }) {
  const group = useRef<THREE.Group>(null)
  const g = geometries()
  const { height: h, width: w, depth: d } = item.size
  const faint = !item.measured
  const material = { color, roughness: 0.72, metalness: 0.05, transparent: faint, opacity: faint ? 0.3 : 1, wireframe: faint, emissive: selected ? color : 'black', emissiveIntensity: selected ? 0.35 : 0 }

  useFrame(() => {
    const el = group.current
    if (!el) return
    const t = spreadValue ? spreadValue.get() : 0
    const tx = THREE.MathUtils.lerp(item.position[0], item.spreadPosition[0], t) + (selected ? d * 0.9 : 0)
    const ty = THREE.MathUtils.lerp(item.position[1], item.spreadPosition[1], t)
    el.position.x += (tx - el.position.x) * 0.18
    el.position.y += (ty - el.position.y) * 0.5
  })

  const handlers = interactive
    ? {
        onClick: (e: { stopPropagation: () => void }) => {
          e.stopPropagation()
          onSelect?.(item.level)
        },
        onPointerOver: (e: { stopPropagation: () => void }) => {
          e.stopPropagation()
          onHover(item.level)
          document.body.style.cursor = 'pointer'
        },
        onPointerOut: () => {
          onHover(null)
          document.body.style.cursor = ''
        },
      }
    : {}

  return (
    <group ref={group} position={item.position} rotation={[0, 0, item.rotationZ]} userData={{ level: item.level }} name={`level-${item.level}`} {...handlers}>
      {item.kind === 'vertebra' || item.kind === 'sacrum' ? (
        <>
          <mesh geometry={g.body} scale={[d, h, w]} userData={{ level: item.level }}>
            <meshStandardMaterial {...material} />
          </mesh>
          <mesh geometry={g.body} position={[-d * 0.62, 0, 0]} scale={[d * 0.4, h * 0.82, w * 0.72]} userData={{ level: item.level }}>
            <meshStandardMaterial {...material} />
          </mesh>
          <mesh geometry={g.box} position={[-d * 1.15, -h * 0.12, 0]} scale={[d * 0.85, h * 0.26, w * 0.1]} userData={{ level: item.level }}>
            <meshStandardMaterial {...material} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} geometry={g.box} position={[-d * 0.45, 0, side * (w / 2 + w * 0.1)]} scale={[d * 0.3, h * 0.22, w * 0.3]} userData={{ level: item.level }}>
              <meshStandardMaterial {...material} />
            </mesh>
          ))}
        </>
      ) : (
        <mesh geometry={g.disc} scale={[d, h * 0.92, w]} userData={{ level: item.level }}>
          <meshStandardMaterial {...material} />
        </mesh>
      )}
    </group>
  )
}

/** Moves the camera and orbit target together, so selecting a level pans rather than rotates. */
function CameraRig({ layout, selected, apiRef, controls }: { layout: SpineLayout; selected: string | null; apiRef?: MutableRefObject<ViewApi | null>; controls: MutableRefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree()
  const home = useMemo(() => new THREE.Vector3(0, 0, homeDistance(layout)), [layout])
  const wanted = useRef(new THREE.Vector3())
  const animUntil = useRef(0)

  // every selection change starts a short camera move: pan to the part and zoom in on it (or back out when cleared)
  useEffect(() => {
    animUntil.current = performance.now() + 1600
  }, [selected])

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      reset: () => {
        camera.position.copy(home)
        controls.current?.target.set(0, 0, 0)
        controls.current?.update()
      },
      fit: () => {
        const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180
        const distance = (layout.height / 2 / Math.tan(fov / 2)) * 1.12
        const dir = camera.position.clone().sub(controls.current?.target ?? new THREE.Vector3()).normalize()
        controls.current?.target.set(0, 0, 0)
        camera.position.copy(dir.multiplyScalar(distance))
        controls.current?.update()
      },
    }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, camera, home, layout, controls])

  useFrame(() => {
    const c = controls.current
    if (!c) return
    const item = selected ? layout.items.find((i) => i.level === selected) : null
    wanted.current.set(item ? item.position[0] : 0, item ? item.position[1] : 0, 0)
    const delta = wanted.current.clone().sub(c.target)
    if (performance.now() > animUntil.current) return // after the move the reader is free to orbit, zoom and pan
    const dist = camera.position.distanceTo(c.target)
    const desired = item ? Math.max(2.2, item.size.width * 2.4) : homeDistance(layout)
    if (Math.abs(dist - desired) > 0.01) {
      const dir = camera.position.clone().sub(c.target).normalize()
      camera.position.copy(c.target).addScaledVector(dir, dist + (desired - dist) * 0.1)
    }
    if (delta.lengthSq() > 1e-6) {
      delta.multiplyScalar(0.08)
      c.target.add(delta)
      camera.position.add(delta)
      c.update()
    }
  })
  return null
}

/** Far enough that the whole spine fits a tall, narrow canvas with some air around it. */
function homeDistance(layout: SpineLayout): number {
  return layout.height * 1.75
}

export default function SpineScene({ layout, statuses, selected = null, onSelect, spreadValue, interactive = true, orbit = true, apiRef, className }: SceneProps) {
  const colors = useThemeColors()
  const [hovered, setHovered] = useState<string | null>(null)
  const controls = useRef<OrbitControlsImpl | null>(null)
  const hoveredItem = hovered ? layout.items.find((i) => i.level === hovered) : undefined

  return (
    <Canvas
      className={className}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 0, homeDistance(layout)], fov: 35, near: 0.1, far: 200 }}
      onPointerMissed={() => interactive && onSelect?.(null)}
      role="img"
      aria-label="Three-dimensional schematic spine. A level list and a table next to it give the same information as text."
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 6, 6]} intensity={1.6} />
      <directionalLight position={[-4, -2, 3]} intensity={0.5} />
      {layout.items.map((item) => (
        <Element
          key={item.level}
          item={item}
          color={colorForLevel(colors, item.measured, statuses?.[item.level])}
          selected={selected === item.level}
          spreadValue={spreadValue}
          interactive={interactive}
          onSelect={onSelect}
          onHover={setHovered}
        />
      ))}
      {hoveredItem && (
        <Html position={[hoveredItem.position[0] + hoveredItem.size.depth + 0.5, hoveredItem.position[1], 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded-sm border border-rule bg-surface px-2 py-1 font-mono text-xs text-text">
            {hoveredItem.level} · {hoveredItem.measured ? (statuses?.[hoveredItem.level] ? statusWord(statuses[hoveredItem.level]).toLowerCase() : 'reference shape') : 'not measured'}
          </div>
        </Html>
      )}
      <OrbitControls ref={controls as never} makeDefault enabled={orbit} enableDamping dampingFactor={0.12} enablePan minDistance={2} maxDistance={layout.height * 3.5} target={[0, 0, 0]} />
      <CameraRig layout={layout} selected={selected} apiRef={apiRef} controls={controls} />
    </Canvas>
  )
}
