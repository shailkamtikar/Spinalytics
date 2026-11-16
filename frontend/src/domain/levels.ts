export type Region = 'cervical' | 'thoracic' | 'lumbar'

/** C1 to L5. C1 and C2 are drawn but not measured (no vertebral-body columns in the data). */
export const ALL_VERTEBRAE: string[] = [
  ...Array.from({ length: 7 }, (_, i) => `C${i + 1}`),
  ...Array.from({ length: 12 }, (_, i) => `T${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `L${i + 1}`),
]
export const UNMEASURED = ['C1', 'C2']
export const MEASURED_VERTEBRAE = ALL_VERTEBRAE.filter((v) => !UNMEASURED.includes(v))

const CHAIN = ['C2', ...MEASURED_VERTEBRAE, 'S1']
/** C2-C3 ... L5-S1 */
export const DISCS: string[] = CHAIN.slice(0, -1).map((v, i) => `${v}-${CHAIN[i + 1]}`)

export function regionOf(level: string): Region {
  return level.startsWith('C') ? 'cervical' : level.startsWith('T') ? 'thoracic' : 'lumbar'
}

export function isDisc(level: string): boolean {
  return level.includes('-')
}

export function isMeasured(level: string): boolean {
  return !UNMEASURED.includes(level)
}

/** Every level the application reports: 22 vertebrae, 23 discs. Regional angles are separate. */
export const REPORTED_LEVELS: string[] = [...MEASURED_VERTEBRAE, ...DISCS]
