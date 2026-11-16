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

/** How far a selected part slides toward the viewer. The camera aims at the part after this shift. */
const pullForward = (item: SpineItem) => item.size.depth * 0.9

function Element({ item, color, selected, hovered, spreadValue, interactive, onSelect, onHover }: { item: SpineItem; color: string; selected: boolean; hovered: boolean; spreadValue?: MotionValue<number>; interactive: boolean; onSelect?: (l: string | null) => void; onHover: (l: string | null) => void }) {
  const group = useRef<THREE.Group>(null)
  const g = geometries()
  const { height: h, width: w, depth: d } = item.size
  const faint = !item.measured
  const glow = selected ? 0.4 : hovered ? 0.22 : 0
  const material = { color, roughness: 0.72, metalness: 0.05, transparent: faint, opacity: faint ? 0.3 : 1, wireframe: faint, emissive: glow ? color : 'black', emissiveIntensity: glow }

  useFrame((_, delta) => {
    const el = group.current
    if (!el) return
    const t = spreadValue ? spreadValue.get() : 0
    const k = 1 - Math.exp(-delta * 9)
    const tx = THREE.MathUtils.lerp(item.position[0], item.spreadPosition[0], t) + (selected ? pullForward(item) : 0)
    const ty = THREE.MathUtils.lerp(item.position[1], item.spreadPosition[1], t)
    el.position.x += (tx - el.position.x) * k
    el.position.y += (ty - el.position.y) * (spreadValue ? 0.5 : k)
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

/** Far enough that the whole spine fits a tall, narrow canvas with some air around it. */
function homeDistance(layout: SpineLayout): number {
  return layout.height * 1.75
}

/**
 * Camera director. A selection flies the camera straight to that part, side-on, close enough that the part fills
 * the middle of the canvas. Clearing the selection flies back out. While it flies the orbit controls are paused;
 * once it lands the reader is free to orbit, zoom and pan again.
 */
function CameraRig({ layout, selected, apiRef, controls }: { layout: SpineLayout; selected: string | null; apiRef?: MutableRefObject<ViewApi | null>; controls: MutableRefObject<OrbitControlsImpl | null> }) {
  const { camera, size } = useThree()
  const flying = useRef(false)
  const goal = useRef({ target: new THREE.Vector3(), position: new THREE.Vector3(0, 0, homeDistance(layout)) })
  const home = useMemo(() => new THREE.Vector3(0, 0, homeDistance(layout)), [layout])
  const first = useRef(true)

  // a new selection sets a new goal and starts the flight
  useEffect(() => {
    const item = selected ? layout.items.find((i) => i.level === selected) : null
    const cam = camera as THREE.PerspectiveCamera
    const half = Math.tan((cam.fov * Math.PI) / 360)
    if (item) {
      const aspect = size.width / Math.max(1, size.height)
      const needV = Math.max(item.size.height * 3.4, item.size.width * 2.0, 0.9) // world height that should be visible
      const needH = (item.size.width + item.size.depth * 2.4) * 1.9 / aspect // keep the part inside a narrow canvas too
      const dist = Math.max(needV, needH) / 2 / half
      const target = new THREE.Vector3(item.position[0] + pullForward(item), item.position[1], 0)
      goal.current = { target, position: new THREE.Vector3(target.x, target.y, dist) }
    } else {
      goal.current = { target: new THREE.Vector3(0, 0, 0), position: home.clone() }
    }
    if (first.current) {
      first.current = false
      if (!item) return // initial mount with nothing selected: stay at the starting pose
    }
    flying.current = true
    if (controls.current) controls.current.enabled = false
  }, [selected, layout, camera, size.width, size.height, home, controls])

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      reset: () => {
        goal.current = { target: new THREE.Vector3(0, 0, 0), position: home.clone() }
        flying.current = true
        if (controls.current) controls.current.enabled = false
      },
      fit: () => {
        const cam = camera as THREE.PerspectiveCamera
        const dist = (layout.height / 2 / Math.tan((cam.fov * Math.PI) / 360)) * 1.12
        goal.current = { target: new THREE.Vector3(0, 0, 0), position: new THREE.Vector3(0, 0, dist) }
        flying.current = true
        if (controls.current) controls.current.enabled = false
      },
    }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, camera, home, layout, controls])

  useFrame((_, delta) => {
    const c = controls.current
    if (!c || !flying.current) return
    const k = 1 - Math.exp(-delta * 5.5)
    c.target.lerp(goal.current.target, k)
    camera.position.lerp(goal.current.position, k)
    c.update()
    if (c.target.distanceTo(goal.current.target) < 0.004 && camera.position.distanceTo(goal.current.position) < 0.008) {
      c.target.copy(goal.current.target)
      camera.position.copy(goal.current.position)
      flying.current = false
      c.enabled = true
      c.update()
    }
  })
  return null
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
          hovered={hovered === item.level}
          spreadValue={spreadValue}
          interactive={interactive}
          onSelect={onSelect}
          onHover={setHovered}
        />
      ))}
      {hoveredItem && hovered !== selected && (
        <Html position={[hoveredItem.position[0] + hoveredItem.size.depth + 0.5, hoveredItem.position[1], 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded-sm border border-rule bg-surface px-2 py-1 font-mono text-xs text-text">
            {hoveredItem.level} · {hoveredItem.measured ? (statuses?.[hoveredItem.level] ? statusWord(statuses[hoveredItem.level]).toLowerCase() : 'reference shape') : 'not measured'} · click to zoom
          </div>
        </Html>
      )}
      <OrbitControls ref={controls as never} makeDefault enabled={orbit} enableDamping dampingFactor={0.12} enablePan minDistance={1.4} maxDistance={layout.height * 3.5} />
      <CameraRig layout={layout} selected={selected} apiRef={apiRef} controls={controls} />
    </Canvas>
  )
}
