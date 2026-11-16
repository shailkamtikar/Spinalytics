import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AnalyzeRequest, Catalog, SampleCase } from '../api/client'

const ARTIFACTS = join(__dirname, '..', '..', '..', 'backend', 'app', 'artifacts')

/** The real catalog and sample cases from the backend artifacts, as the API serves them. */
export const catalog: Catalog = (() => {
  const c = JSON.parse(readFileSync(join(ARTIFACTS, 'feature_catalog.json'), 'utf-8'))
  return { data_origin: c.data_origin, notice: c.notice, vertebrae: c.vertebrae, unmeasured_vertebrae: c.unmeasured_vertebrae, discs: c.discs, features: c.features, derived: c.derived }
})()

interface RawCase {
  case_id: string
  title: string
  description: string
  data_origin: string
  notice: string
  person: Record<string, number>
  measurements: Record<string, number | null>
  units: { length: string; angle: string }
  blanked_fields_note: string | null
}

const raw: RawCase[] = JSON.parse(readFileSync(join(ARTIFACTS, 'sample_cases.json'), 'utf-8'))

export const sampleCases: SampleCase[] = raw.map((c) => ({
  case_id: c.case_id,
  title: c.title,
  description: c.description,
  data_origin: c.data_origin,
  notice: c.notice,
  request: { source: 'sample', units: c.units, person: c.person, measurements: c.measurements } as AnalyzeRequest,
  incomplete_note: c.blanked_fields_note,
}))

/** CSV text from header and rows. */
export function csv(headers: string[], rows: (string | number | null)[][]): string {
  return [headers.join(','), ...rows.map((r) => r.map((v) => (v === null ? '' : String(v))).join(','))].join('\n') + '\n'
}

export function caseRow(c: SampleCase, headers: string[]): (string | number | null)[] {
  const all = { ...(c.request.person as object), ...(c.request.measurements as object) } as Record<string, number | null>
  return headers.map((h) => all[h] ?? null)
}
