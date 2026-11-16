import { motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { useEffect, type KeyboardEvent } from 'react'
import { ALL_VERTEBRAE, DISCS, UNMEASURED, regionOf } from '../../domain/levels'
import type { Status } from '../ui'

interface Props {
  /** 0 = stacked, 1 = fully spread apart. Ignored when `spreadValue` is given. */
  spread?: number
  /** Drive the spread from a motion value (scroll progress) without re-rendering React. */
  spreadValue?: MotionValue<number>
  statuses?: Record<string, Status>
  selected?: string | null
  onSelect?: (level: string) => void
  labels?: boolean
  className?: string
}

const GAP = 6
const SIZE = { cervical: { h: 15, w: 34 }, thoracic: { h: 18, w: 44 }, lumbar: { h: 26, w: 62 } }
const SPREAD_STEP = 7
const MID = (ALL_VERTEBRAE.length - 1) / 2

/** Side-view bend control points, as fraction down the spine -> horizontal offset (forward positive). */
const CURVE: [number, number][] = [[0, 4], [0.14, 11], [0.3, 1], [0.5, -14], [0.7, -6], [0.85, 12], [1, 9]]
function curve(t: number): number {
  for (let i = 1; i < CURVE.length; i++) {
    if (t <= CURVE[i][0]) {
      const [t0, x0] = CURVE[i - 1]
      const [t1, x1] = CURVE[i]
      const k = (t - t0) / (t1 - t0)
      return x0 + (x1 - x0) * (1 - Math.cos(Math.PI * k)) / 2
    }
  }
  return CURVE[CURVE.length - 1][1]
}

interface Slot {
  level: string
  kind: 'vertebra' | 'disc'
  y: number
  h: number
  w: number
  x: number
  index: number
}

function buildSlots(): { slots: Slot[]; bottom: number } {
  const slots: Slot[] = []
  let y = 0
  const total = ALL_VERTEBRAE.reduce((s, v) => s + SIZE[regionOf(v)].h + GAP, 0)
  ALL_VERTEBRAE.forEach((level, i) => {
    const { h, w } = SIZE[regionOf(level)]
    slots.push({ level, kind: 'vertebra', y, h, w, x: 110 + curve((y + h / 2) / total) - w / 2, index: i })
    const disc = DISCS.find((d) => d.startsWith(`${level}-`))
    if (disc) slots.push({ level: disc, kind: 'disc', y: y + h, h: GAP, w: w * 0.86, x: 110 + curve((y + h + GAP / 2) / total) - (w * 0.86) / 2, index: i + 0.5 })
    y += h + GAP
  })
  return { slots, bottom: y }
}

const { slots: SLOTS, bottom: BOTTOM } = buildSlots()
export const SCHEMATIC_SLOTS = SLOTS

function Slot({ slot, spread, status, selected, onSelect }: { slot: Slot; spread: MotionValue<number>; status?: Status; selected: boolean; onSelect?: (l: string) => void }) {
  const y = useTransform(spread, (v) => (slot.index - MID) * SPREAD_STEP * v)
  const measured = !UNMEASURED.includes(slot.level)
  const color = !measured ? 'var(--muted)' : status === 'within' ? 'var(--within)' : status === 'review' ? 'var(--review)' : status === 'large_deviation' ? 'var(--large)' : status === 'missing' || status === 'no_reference' ? 'var(--missing)' : 'var(--bone)'
  const interactive = Boolean(onSelect)
  const label = `${slot.level}${measured ? '' : ', not measured in this version'}${status ? `, ${status.replace('_', ' ')}` : ''}`
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(slot.level)
    }
  }
  const body = (
    <>
      <title>{label}</title>
      <rect
        x={slot.x - (selected ? 8 : 0)}
        y={slot.y}
        width={slot.w}
        height={slot.kind === 'disc' ? slot.h - 1.5 : slot.h}
        rx={slot.kind === 'disc' ? 1 : 4}
        fill={measured ? color : 'none'}
        fillOpacity={slot.kind === 'disc' ? 0.55 : status ? 0.28 : 0.16}
        stroke={color}
        strokeWidth={selected ? 2.4 : 1.2}
        strokeDasharray={measured ? undefined : '3 3'}
        style={{ transition: 'x 200ms ease, stroke-width 200ms ease' }}
      />
      {slot.kind === 'vertebra' && <rect x={slot.x - 11 - (selected ? 8 : 0)} y={slot.y + slot.h / 2 - 2} width={11} height={4} rx={1.5} fill="none" stroke={color} strokeWidth={1} strokeDasharray={measured ? undefined : '3 3'} />}
    </>
  )
  return (
    <motion.g
      data-level={slot.level}
      data-kind={slot.kind}
      data-measured={measured}
      data-status={status}
      data-selected={selected || undefined}
      style={{ y }}
      {...(interactive ? { role: 'button', tabIndex: 0, onClick: () => onSelect?.(slot.level), onKeyDown: onKey, 'aria-pressed': selected, 'aria-label': label, className: 'cursor-pointer focus:outline-none [&:focus-visible_rect]:stroke-[3px]' } : {})}
    >
      {body}
    </motion.g>
  )
}

function LevelLabel({ slot, spread }: { slot: Slot; spread: MotionValue<number> }) {
  const y = useTransform(spread, (v) => (slot.index - MID) * SPREAD_STEP * v)
  return (
    <motion.text x={196} y={slot.y + slot.h / 2 + 3} style={{ y }} fontFamily="var(--font-mono)" fontSize={9} fill="var(--muted)" aria-hidden="true">
      {slot.level}
    </motion.text>
  )
}

/** The accessible 2D map: 24 vertebrae (C1 to L5), 23 discs, each carrying `data-level`. */
export function SpineSchematic({ spread = 0, spreadValue, statuses, selected = null, onSelect, labels = true, className = '' }: Props) {
  const own = useMotionValue(spread)
  useEffect(() => own.set(spread), [spread, own])
  const driver = spreadValue ?? own
  const pad = MID * SPREAD_STEP + 10
  return (
    <svg
      viewBox={`0 ${-pad} 230 ${BOTTOM + 2 * pad + 36}`}
      role="group"
      aria-label="Schematic spine, vertebrae C1 to L5 with the discs between them. Sizes are illustrative, not anatomically exact."
      className={className}
      style={{ overflow: 'visible' }}
    >
      {SLOTS.map((slot) => (
        <Slot key={slot.level} slot={slot} spread={driver} status={statuses?.[slot.level]} selected={selected === slot.level} onSelect={onSelect} />
      ))}
      {labels && SLOTS.filter((s) => s.kind === 'vertebra').map((s) => <LevelLabel key={`t-${s.level}`} slot={s} spread={driver} />)}
      <rect x={78} y={BOTTOM + 4} width={64} height={26} rx={4} fill="none" stroke="var(--muted)" strokeDasharray="3 3" data-level="sacrum" data-measured="false" aria-label="Sacrum, not measured" />
    </svg>
  )
}
