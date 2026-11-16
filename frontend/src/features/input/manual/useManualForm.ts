import { useCallback, useMemo, useState } from 'react'
import type { AnalyzeRequest, Catalog, CatalogFeature } from '../../../api/client'
import type { Region } from '../../../domain/levels'
import { personFeatures, spineFeatures } from '../requestUtils'

const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)$/

export interface FieldIssue {
  kind: 'error' | 'warning'
  message: string
}

export function fieldIssue(raw: string, f: CatalogFeature): FieldIssue | null {
  const v = raw.trim()
  if (v === '') return null // empty stays empty
  if (!NUMBER.test(v)) return { kind: 'error', message: 'Enter a number, using a decimal point.' }
  const n = Number(v)
  if (f.min_supported !== undefined && f.max_supported !== undefined && (n < f.min_supported || n > f.max_supported)) {
    return { kind: 'warning', message: `Outside the supported range ${f.min_supported} to ${f.max_supported} ${f.unit}; it will be excluded from the analysis.` }
  }
  if (f.kind === 'length' && n < 0) return { kind: 'warning', message: 'A length cannot be negative; it will be excluded.' }
  return null
}

export function humanLabel(f: CatalogFeature): string {
  const base = f.feature.replace(/_(mm|deg)$/, '').replace(/_/g, ' ')
  const lead = f.target_type === 'region' ? '' : `${f.level} `
  return `${lead}${base}${f.unit && f.unit !== 'years' ? ` (${f.unit})` : ''}`.trim()
}

export interface RegionGroup {
  region: Region
  levels: { level: string; title: string; features: CatalogFeature[] }[]
  total: number
}

/** Cervical / thoracic / lumbar, each with vertebrae first, then discs, then the regional angle. */
export function groupByRegion(catalog: Catalog): RegionGroup[] {
  const feats = spineFeatures(catalog)
  return (['cervical', 'thoracic', 'lumbar'] as const).map((region) => {
    const inRegion = feats.filter((f) => f.region === region)
    const levels: RegionGroup['levels'] = []
    const order = [...catalog.vertebrae, ...catalog.discs, region]
    for (const level of order) {
      const fs = inRegion.filter((f) => f.level === level)
      if (fs.length) levels.push({ level, title: level === region ? `${region[0].toUpperCase()}${region.slice(1)} regional angle` : level.includes('-') ? `${level} disc` : level, features: fs })
    }
    return { region, levels, total: inRegion.length }
  })
}

export function useManualForm(catalog: Catalog) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [person, setPerson] = useState<Record<string, string>>({})

  const setValue = useCallback((column: string, raw: string) => setValues((v) => ({ ...v, [column]: raw })), [])
  const setPersonValue = useCallback((column: string, raw: string) => setPerson((v) => ({ ...v, [column]: raw })), [])

  const prefill = useCallback((request: AnalyzeRequest) => {
    const toText = (o: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, String(v)]))
    setValues(toText(request.measurements as Record<string, unknown>))
    setPerson(toText(request.person as Record<string, unknown>))
  }, [])

  const { request, blockers, warnings } = useMemo(() => {
    const feats = new Map(catalog.features.map((f) => [f.column, f]))
    const measurements: Record<string, number> = {}
    const personOut: Record<string, number> = {}
    const blockers: string[] = []
    const warnings = new Set<string>()
    const handle = (raw: string, column: string, into: Record<string, number>) => {
      const f = feats.get(column)
      if (!f || raw.trim() === '') return
      const issue = fieldIssue(raw, f)
      if (issue?.kind === 'error') {
        blockers.push(`${humanLabel(f)}: ${issue.message}`)
        return
      }
      if (issue?.kind === 'warning') warnings.add(`${humanLabel(f)}: ${issue.message}`)
      into[column] = Number(raw)
    }
    for (const [c, raw] of Object.entries(values)) handle(raw, c, measurements)
    for (const [c, raw] of Object.entries(person)) handle(raw, c, personOut)
    const request = { source: 'manual', units: { length: 'mm', angle: 'deg' }, person: personOut, measurements } as AnalyzeRequest
    return { request, blockers, warnings: [...warnings] }
  }, [values, person, catalog])

  return { values, person, setValue, setPersonValue, prefill, request, blockers, warnings, personFields: personFeatures(catalog) }
}
