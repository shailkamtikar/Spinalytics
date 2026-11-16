import Papa from 'papaparse'
import type { AnalyzeRequest, Catalog } from '../../../api/client'
import { personFeatures, spineFeatures } from '../requestUtils'

export const MAX_CSV_BYTES = 2 * 1024 * 1024
const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/
const IGNORED_HEADERS = new Set(['is_healthy'])

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
  /** header -> catalog column, only for exact (case-insensitive, trimmed) matches */
  recognised: Record<string, string>
  unrecognised: string[]
  ignored: string[]
  /** catalog input columns that no header matched */
  missingColumns: string[]
  duplicateRows: number[]
  parseErrors: string[]
}

export interface BuiltRequest {
  request: AnalyzeRequest
  notes: string[]
  /** cells that were not valid numbers: treated as missing, never converted */
  badCells: { row: number; header: string; value: string }[]
}

export function checkFile(file: { name: string; size: number }): string | null {
  if (!/\.csv$/i.test(file.name)) return `"${file.name}" is not a .csv file. Export your data as CSV (comma separated) and try again.`
  if (file.size > MAX_CSV_BYTES) return `The file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 2 MB.`
  return null
}

/** Pure: no network, no mapping beyond exact name matches. */
export function parseCsv(text: string, catalog: Catalog): ParsedCsv {
  const clean = text.replace(/^﻿/, '')
  const result = Papa.parse<string[]>(clean, { skipEmptyLines: 'greedy' })
  const all = result.data as string[][]
  const headers = (all[0] ?? []).map((h) => h.trim())
  const rows = all.slice(1)
  const byLower = new Map(catalog.features.map((f) => [f.column.toLowerCase(), f.column]))
  const recognised: Record<string, string> = {}
  const unrecognised: string[] = []
  const ignored: string[] = []
  for (const h of headers) {
    if (IGNORED_HEADERS.has(h.toLowerCase())) ignored.push(h)
    else if (byLower.has(h.toLowerCase())) recognised[h] = byLower.get(h.toLowerCase())!
    else if (h) unrecognised.push(h)
  }
  const matched = new Set(Object.values(recognised))
  const seen = new Map<string, number>()
  const duplicateRows: number[] = []
  rows.forEach((r, i) => {
    const key = JSON.stringify(r.map((c) => c.trim()))
    if (seen.has(key)) duplicateRows.push(i)
    else seen.set(key, i)
  })
  return {
    headers,
    rows,
    recognised,
    unrecognised,
    ignored,
    missingColumns: catalog.features.map((f) => f.column).filter((c) => !matched.has(c)),
    duplicateRows,
    parseErrors: result.errors.map((e) => e.message),
  }
}

/** Build a request from one row. `mapping` holds the user's explicit choices for unrecognised headers. */
export function buildRequest(parsed: ParsedCsv, catalog: Catalog, rowIndex: number, mapping: Record<string, string> = {}): BuiltRequest {
  const row = parsed.rows[rowIndex] ?? []
  const personCols = new Set(personFeatures(catalog).map((f) => f.column))
  const spineCols = new Set(spineFeatures(catalog).map((f) => f.column))
  const notes: string[] = []
  const badCells: BuiltRequest['badCells'] = []
  const measurements: Record<string, number | null> = {}
  const person: Record<string, number> = {}
  const used = new Set<string>()

  const assign = (header: string, column: string) => {
    if (used.has(column)) {
      notes.push(`"${header}" was not used because ${column} was already supplied by another column.`)
      return
    }
    used.add(column)
    const idx = parsed.headers.indexOf(header)
    const raw = (row[idx] ?? '').trim()
    if (raw === '') {
      if (spineCols.has(column)) measurements[column] = null
      return
    }
    if (!NUMBER.test(raw)) {
      badCells.push({ row: rowIndex, header, value: raw })
      if (spineCols.has(column)) measurements[column] = null
      return
    }
    const n = Number(raw)
    if (personCols.has(column)) person[column] = n
    else measurements[column] = n
  }

  for (const [header, column] of Object.entries(parsed.recognised)) assign(header, column)
  for (const [header, column] of Object.entries(mapping)) {
    if (column && parsed.unrecognised.includes(header)) {
      assign(header, column)
      notes.push(`Your mapping: "${header}" → ${column}.`)
    }
  }
  if (parsed.ignored.length) notes.push(`Column ${parsed.ignored.join(', ')} is a training label and was ignored. It is never sent.`)
  const skipped = parsed.unrecognised.filter((h) => !mapping[h])
  if (skipped.length) notes.push(`${skipped.length} column(s) were not recognised and are not sent: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? ', …' : ''}.`)
  if (badCells.length) notes.push(`${badCells.length} cell(s) were not valid numbers and are treated as missing: ${badCells.slice(0, 4).map((c) => `${c.header} = "${c.value}"`).join(', ')}${badCells.length > 4 ? ', …' : ''}. Decimal commas are not converted.`)
  const missing = parsed.missingColumns.filter((c) => spineCols.has(c)).length
  if (missing) notes.push(`${missing} spine column(s) are absent from the file and will be treated as missing.`)

  const request = { source: 'csv', units: { length: 'mm', angle: 'deg' }, person, measurements } as AnalyzeRequest
  return { request, notes, badCells }
}

/** Header row plus one example row, in catalog order. */
export function templateCsv(catalog: Catalog, example?: AnalyzeRequest): string {
  const cols = catalog.features.map((f) => f.column)
  const row = cols.map((c) => {
    const v = (example?.person as Record<string, unknown> | undefined)?.[c] ?? (example?.measurements as Record<string, unknown> | undefined)?.[c]
    return v === undefined || v === null ? '' : String(v)
  })
  return [cols.join(','), row.join(',')].join('\n') + '\n'
}
