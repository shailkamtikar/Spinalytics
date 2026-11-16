import { expect, test } from 'vitest'
import type { ReferenceInfo } from '../../api/client'
import { ALL_VERTEBRAE, DISCS, REPORTED_LEVELS } from '../../domain/levels'
import { catalog } from '../../test-utils/fixtures'
import { buildSpineLayout, findItem } from './buildSpineLayout'

/** A reference like the API returns: sizes grow down the spine, angles bend like the real curve. */
function fakeReference(): ReferenceInfo {
  const vertebrae: ReferenceInfo['level_sizes']['vertebrae'] = {}
  const discs: ReferenceInfo['level_sizes']['discs'] = {}
  const measured = ALL_VERTEBRAE.filter((v) => v !== 'C1' && v !== 'C2')
  measured.forEach((v, i) => {
    vertebrae[v] = { height_mm: 13 + i * 1.6, width_mm: 17 + i * 1.9, depth_mm: 15 + i * 1.4 }
  })
  DISCS.forEach((d, i) => {
    discs[d] = { height_mm: 4.5 + i * 0.15, sagittal_angle_deg: d.startsWith('C') ? 3.5 : d.startsWith('L') ? 6 : -3 }
  })
  return { provenance: { limitation: 'x', data_origin: 'synthetic' }, cohorts: {}, thresholds: { within_max_abs_z: 2, large_min_abs_z: 3.5, min_completeness: 0.5, label: '' }, overall_rule: {}, level_sizes: { vertebrae, discs }, disclaimer: '' }
}

const layout = buildSpineLayout(fakeReference())

test('T-7.2-01 counts: 24 vertebrae, a sacrum stub and 23 discs', () => {
  expect(layout.items.filter((i) => i.kind === 'vertebra')).toHaveLength(24)
  expect(layout.items.filter((i) => i.kind === 'sacrum')).toHaveLength(1)
  expect(layout.items.filter((i) => i.kind === 'disc')).toHaveLength(23)
})

test('T-7.2-02 ids are unique and every measured level exists in the catalog', () => {
  const ids = layout.items.map((i) => i.level)
  expect(new Set(ids).size).toBe(ids.length)
  const catalogLevels = new Set(catalog.features.map((f) => f.level))
  for (const item of layout.items.filter((i) => i.measured)) expect(catalogLevels.has(item.level), item.level).toBe(true)
  expect(layout.items.filter((i) => i.measured).map((i) => i.level).sort()).toEqual([...REPORTED_LEVELS].sort())
})

test('T-7.2-03 vertical positions strictly descend from C1 to L5', () => {
  const ys = ALL_VERTEBRAE.map((v) => findItem(layout, v)!.position[1])
  for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1])
})

test('T-7.2-04 sizes follow the reference: L3 is wider than C5 in the reference ratio', () => {
  const ref = fakeReference()
  const l3 = findItem(layout, 'L3')!.size.width
  const c5 = findItem(layout, 'C5')!.size.width
  expect(l3).toBeGreaterThan(c5)
  expect(l3 / c5).toBeCloseTo(ref.level_sizes.vertebrae.L3.width_mm / ref.level_sizes.vertebrae.C5.width_mm, 3)
})

test('T-7.2-05 neighbouring elements do not interpenetrate', () => {
  for (let i = 1; i < layout.items.length; i++) {
    const a = layout.items[i - 1]
    const b = layout.items[i]
    const dist = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1])
    expect(dist, `${a.level} / ${b.level}`).toBeGreaterThanOrEqual(0.9 * ((a.size.height + b.size.height) / 2))
  }
})

test('C1, C2 and the sacrum are not measured; the 45 reported levels are', () => {
  for (const l of ['C1', 'C2', 'sacrum']) expect(findItem(layout, l)!.measured).toBe(false)
  expect(layout.items.filter((i) => i.measured)).toHaveLength(45)
})

test('the spread positions are further apart than the stacked ones and the column is S-shaped', () => {
  const first = layout.items[0]
  const last = layout.items.at(-1)!
  expect(first.spreadPosition[1] - last.spreadPosition[1]).toBeGreaterThan(first.position[1] - last.position[1])
  const xs = layout.items.filter((i) => i.kind === 'vertebra').map((i) => i.position[0])
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.2)
})
