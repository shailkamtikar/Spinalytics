import { useEffect, useState } from 'react'
import { getModelInfo, getReferenceInfo, type AnalyzeResponse, type Finding, type ModelInfo, type ReferenceInfo } from '../../api/client'
import type { Status } from '../../components/ui'
import { ALL_VERTEBRAE, DISCS, MEASURED_VERTEBRAE, regionOf, type Region } from '../../domain/levels'

export type Result = AnalyzeResponse

export function statusMap(result: Result): Record<string, Status> {
  return Object.fromEntries(result.statistical.levels.map((l) => [l.level, l.status as Status]))
}

const ORDER = new Map<string, number>([...MEASURED_VERTEBRAE, ...DISCS, 'cervical', 'thoracic', 'lumbar'].map((l, i) => [l, i]))
export const levelOrder = (level: string) => ORDER.get(level) ?? 999

export function absZ(f: Finding): number {
  return f.z_score === null || f.z_score === undefined ? -1 : Math.abs(f.z_score)
}

export interface FindingFilter {
  region: Region | 'all'
  statuses: Set<Status>
  sort: 'z' | 'level'
}

export function selectFindings(findings: Finding[], filter: FindingFilter): Finding[] {
  const rows = findings.filter((f) => (filter.region === 'all' || f.region === filter.region) && filter.statuses.has(f.status as Status))
  return rows.sort((a, b) => (filter.sort === 'z' ? absZ(b) - absZ(a) || levelOrder(a.level) - levelOrder(b.level) : levelOrder(a.level) - levelOrder(b.level) || a.column.localeCompare(b.column)))
}

export function findingsForLevel(findings: Finding[], level: string | null): Finding[] {
  return level ? findings.filter((f) => f.level === level) : []
}

export function featureLabel(f: Pick<Finding, 'feature' | 'unit'>): string {
  return f.feature.replace(/_(mm|deg)$/, '').replace(/_/g, ' ')
}

export const REPORTED_ORDER: string[] = [...MEASURED_VERTEBRAE, ...DISCS]
export const ALL_LEVELS_FOR_LIST: string[] = [...ALL_VERTEBRAE.filter((v) => v === 'C1' || v === 'C2'), ...MEASURED_VERTEBRAE, ...DISCS]

export function regionLabel(level: string): string {
  return level === 'cervical' || level === 'thoracic' || level === 'lumbar' ? level : regionOf(level)
}

export function formatNumber(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined ? '—' : v.toFixed(digits)
}

/** Strongest deviation overall, used as the default focus for the reference chart. */
export function strongestFinding(findings: Finding[]): Finding | undefined {
  return [...findings].sort((a, b) => absZ(b) - absZ(a))[0]
}

let refPromise: Promise<ReferenceInfo> | null = null
let modelPromise: Promise<ModelInfo> | null = null

export function loadReferenceInfo() {
  refPromise ??= getReferenceInfo().catch((e) => {
    refPromise = null
    throw e
  })
  return refPromise
}
export function loadModelInfo() {
  modelPromise ??= getModelInfo().catch((e) => {
    modelPromise = null
    throw e
  })
  return modelPromise
}

/** Reference and model provenance, fetched once and shared. Failure only hides the 3D view and provenance panel. */
export function useInfo() {
  const [reference, setReference] = useState<ReferenceInfo | null>(null)
  const [model, setModel] = useState<ModelInfo | null>(null)
  useEffect(() => {
    let alive = true
    loadReferenceInfo().then((r) => alive && setReference(r), () => {})
    loadModelInfo().then((m) => alive && setModel(m), () => {})
    return () => {
      alive = false
    }
  }, [])
  return { reference, model }
}
