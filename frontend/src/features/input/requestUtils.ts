import { useEffect, useState } from 'react'
import { getCatalog, type AnalyzeRequest, type Catalog, type CatalogFeature } from '../../api/client'
import type { Region } from '../../domain/levels'

let catalogPromise: Promise<Catalog> | null = null

/** The catalog is static, so it is fetched once per page load and shared. */
export function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= getCatalog().catch((e) => {
    catalogPromise = null // let a later retry try again
    throw e
  })
  return catalogPromise
}

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    loadCatalog().then((c) => alive && setCatalog(c), (e) => alive && setError(e))
    return () => {
      alive = false
    }
  }, [attempt])
  return { catalog, error, retry: () => { setError(null); setAttempt((a) => a + 1) } }
}

export const spineFeatures = (c: Catalog): CatalogFeature[] => c.features.filter((f) => f.target_type !== 'person')
export const personFeatures = (c: Catalog): CatalogFeature[] => c.features.filter((f) => f.target_type === 'person')

export interface InputSummary {
  present: number
  expected: number
  completeness: number
  missing: number
  byRegion: Record<Region, { present: number; total: number }>
  personGiven: number
  personTotal: number
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function summarise(request: AnalyzeRequest, catalog: Catalog): InputSummary {
  const byRegion: InputSummary['byRegion'] = { cervical: { present: 0, total: 0 }, thoracic: { present: 0, total: 0 }, lumbar: { present: 0, total: 0 } }
  let present = 0
  const feats = spineFeatures(catalog)
  for (const f of feats) {
    const region = (f.region ?? 'lumbar') as Region
    byRegion[region].total += 1
    if (isNumber(request.measurements?.[f.column])) {
      present += 1
      byRegion[region].present += 1
    }
  }
  const people = personFeatures(catalog)
  const person = (request.person ?? {}) as Record<string, unknown>
  return {
    present,
    expected: feats.length,
    completeness: feats.length ? present / feats.length : 0,
    missing: feats.length - present,
    byRegion,
    personGiven: people.filter((f) => person[f.column] !== undefined && person[f.column] !== null).length,
    personTotal: people.length,
  }
}

/** Plain-language warnings shown in the review step. Nothing here changes the request. */
export function reviewWarnings(s: InputSummary): string[] {
  const out: string[] = []
  if (s.present === 0) out.push('No spine measurements have been entered yet.')
  else if (s.completeness < 0.5) out.push(`Only ${Math.round(s.completeness * 100)}% of the ${s.expected} spine measurements are present. The overall result will be indeterminate.`)
  if (s.missing > 0 && s.present > 0) out.push(`${s.missing} measurements are missing. The statistical comparison will run on the ${s.present} you provided; the model needs all ${s.expected} and will not give a score. Nothing is filled in.`)
  if (s.personGiven < s.personTotal) out.push('Person details are incomplete or absent. This only affects which reference group is used and whether the model uses person context.')
  return out
}
