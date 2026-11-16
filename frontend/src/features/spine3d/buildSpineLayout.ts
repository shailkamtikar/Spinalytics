import type { ReferenceInfo } from '../../api/client'
import { ALL_VERTEBRAE, DISCS, UNMEASURED } from '../../domain/levels'

/** Scene units per millimetre. */
export const SCALE = 0.02
/** Extra gap added between elements when the spine is "spread" (millimetres). */
const SPREAD_GAP_MM = 16

export type Vec3 = [number, number, number]

export interface SpineItem {
  /** "L3", "L4-L5", "C1" or "sacrum": the same id the data and the table use. */
  level: string
  kind: 'vertebra' | 'disc' | 'sacrum'
  measured: boolean
  /** Stacked position. */
  position: Vec3
  /** Position when fully spread apart (used by the landing figure). */
  spreadPosition: Vec3
  /** Tilt in the side view, radians. */
  rotationZ: number
  /** Height (along the spine), width (side to side) and depth (front to back), scene units. */
  size: { height: number; width: number; depth: number }
}

export interface SpineLayout {
  items: SpineItem[]
  center: Vec3
  height: number
}

interface Dim {
  h: number
  w: number
  d: number
}

const rad = (deg: number) => (deg * Math.PI) / 180

function dims(ref: ReferenceInfo): Record<string, Dim> {
  const out: Record<string, Dim> = {}
  for (const [level, s] of Object.entries(ref.level_sizes.vertebrae)) out[level] = { h: s.height_mm, w: s.width_mm, d: s.depth_mm }
  // C1 and C2 are not in the reference; they are drawn as faint outlines sized from C3.
  const c3 = out['C3']
  out['C2'] = { h: c3.h * 1.15, w: c3.w * 1.05, d: c3.d * 1.05 }
  out['C1'] = { h: c3.h * 0.6, w: c3.w * 1.2, d: c3.d * 1.05 }
  const l5 = out['L5']
  out['sacrum'] = { h: l5.h * 1.5, w: l5.w * 0.95, d: l5.d * 0.9 }
  return out
}

/** Walk down the spine accumulating the reference segmental angles. Returns raw items for one gap setting. */
function walk(ref: ReferenceInfo, gapMm: number, phi0: number) {
  const d = dims(ref)
  const sequence: { level: string; kind: SpineItem['kind'] }[] = []
  ALL_VERTEBRAE.forEach((v, i) => {
    sequence.push({ level: v, kind: 'vertebra' })
    const disc = DISCS.find((x) => x.startsWith(`${v}-`))
    if (disc) sequence.push({ level: disc, kind: 'disc' })
    else if (i === ALL_VERTEBRAE.length - 1) sequence.push({ level: 'L5-S1', kind: 'disc' })
  })
  sequence.push({ level: 'sacrum', kind: 'sacrum' })

  let phi = phi0
  let cursor: Vec3 = [0, 0, 0]
  const placed: { level: string; kind: SpineItem['kind']; center: Vec3; phi: number; dim: Dim }[] = []
  for (const item of sequence) {
    if (item.kind === 'disc') {
      const info = ref.level_sizes.discs[item.level]
      const a = rad(info.sagittal_angle_deg)
      const mid = phi - a / 2
      const hmm = info.height_mm
      const upper = d[item.level.split('-')[0]] ?? d['L5']
      const t: Vec3 = [Math.sin(mid), -Math.cos(mid), 0]
      placed.push({ ...item, center: [cursor[0] + (t[0] * hmm) / 2, cursor[1] + (t[1] * hmm) / 2, 0], phi: mid, dim: { h: hmm, w: upper.w * 0.88, d: upper.d * 0.9 } })
      cursor = [cursor[0] + t[0] * (hmm + gapMm), cursor[1] + t[1] * (hmm + gapMm), 0]
      phi -= a
    } else {
      const dim = d[item.level]
      const t: Vec3 = [Math.sin(phi), -Math.cos(phi), 0]
      placed.push({ ...item, center: [cursor[0] + (t[0] * dim.h) / 2, cursor[1] + (t[1] * dim.h) / 2, 0], phi, dim })
      cursor = [cursor[0] + t[0] * (dim.h + gapMm), cursor[1] + t[1] * (dim.h + gapMm), 0]
    }
  }
  return placed
}

/** Pure: builds positions, tilt and sizes for C1 to L5, 23 discs and a sacrum stub from the reference means. */
export function buildSpineLayout(ref: ReferenceInfo): SpineLayout {
  // First pass finds the mean tilt so the column hangs upright instead of leaning.
  const probe = walk(ref, 0, 0)
  const vert = probe.filter((p) => p.kind === 'vertebra')
  const phi0 = -vert.reduce((s, p) => s + p.phi, 0) / vert.length
  const stacked = walk(ref, 0, phi0)
  const spread = walk(ref, SPREAD_GAP_MM, phi0)

  const ys = stacked.map((p) => p.center[1])
  const top = Math.max(...stacked.map((p) => p.center[1] + p.dim.h / 2))
  const bottom = Math.min(...stacked.map((p) => p.center[1] - p.dim.h / 2))
  const cy = (top + bottom) / 2
  const cx = stacked.reduce((s, p) => s + p.center[0], 0) / stacked.length
  const spreadMid = (Math.max(...spread.map((p) => p.center[1])) + Math.min(...spread.map((p) => p.center[1]))) / 2
  void ys

  const items: SpineItem[] = stacked.map((p, i) => ({
    level: p.level,
    kind: p.kind,
    measured: !UNMEASURED.includes(p.level) && p.kind !== 'sacrum',
    position: [(p.center[0] - cx) * SCALE, (p.center[1] - cy) * SCALE, 0],
    spreadPosition: [(spread[i].center[0] - cx) * SCALE, (spread[i].center[1] - spreadMid) * SCALE, 0],
    rotationZ: p.phi,
    size: { height: p.dim.h * SCALE, width: p.dim.w * SCALE, depth: p.dim.d * SCALE },
  }))
  return { items, center: [0, 0, 0], height: (top - bottom) * SCALE }
}

export function findItem(layout: SpineLayout, level: string): SpineItem | undefined {
  return layout.items.find((i) => i.level === level)
}
