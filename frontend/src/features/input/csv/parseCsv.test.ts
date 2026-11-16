import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { caseRow, catalog, csv, sampleCases } from '../../../test-utils/fixtures'
import { MAX_CSV_BYTES, buildRequest, checkFile, parseCsv, templateCsv } from './parseCsv'

/** -0 and 0 are the same measurement; compare through JSON. */
const same = (a: unknown, b: unknown) => expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)))
const HEADERS = catalog.features.map((f) => f.column)
const case1 = sampleCases[0]
const row1 = caseRow(case1, HEADERS)

test('T-6.2-01 a valid one-row file has 220 recognised columns and reproduces the sample case', () => {
  const p = parseCsv(csv(HEADERS, [row1]), catalog)
  expect(Object.keys(p.recognised)).toHaveLength(220)
  expect(p.unrecognised).toEqual([])
  const built = buildRequest(p, catalog, 0)
  expect(built.request.person).toEqual(case1.request.person)
  same(built.request.measurements, case1.request.measurements)
  expect(built.request.source).toBe('csv')
})

test('T-6.2-02 an unknown column is listed and never sent unless mapped', () => {
  const p = parseCsv(csv([...HEADERS, 'foo'], [[...row1, 5]]), catalog)
  expect(p.unrecognised).toEqual(['foo'])
  const built = buildRequest(p, catalog, 0)
  expect(built.request.measurements).not.toHaveProperty('foo')
  expect(built.notes.join(' ')).toContain('not recognised')
})

test('T-6.2-03 a manual mapping is used and shown in the notes', () => {
  const headers = HEADERS.filter((h) => h !== 'L3_vertebral_body_width_mm')
  const idx = HEADERS.indexOf('L3_vertebral_body_width_mm')
  const row = row1.filter((_, i) => i !== idx)
  const p = parseCsv(csv([...headers, 'L3_width'], [[...row, 41.5]]), catalog)
  expect(buildRequest(p, catalog, 0).request.measurements).not.toHaveProperty('L3_vertebral_body_width_mm', 41.5)
  const built = buildRequest(p, catalog, 0, { L3_width: 'L3_vertebral_body_width_mm' })
  expect((built.request.measurements as Record<string, number>).L3_vertebral_body_width_mm).toBe(41.5)
  expect(built.notes.join(' ')).toContain('L3_width" → L3_vertebral_body_width_mm')
})

test('T-6.2-04 removed lumbar columns are reported missing and analysis stays possible', () => {
  const keep = HEADERS.filter((h) => !/^L[1-5]_/.test(h))
  const p = parseCsv(csv(keep, [caseRow(case1, keep)]), catalog)
  expect(p.missingColumns.length).toBeGreaterThan(30)
  expect(buildRequest(p, catalog, 0).notes.join(' ')).toMatch(/absent from the file and will be treated as missing/)
})

test('T-6.2-05 and 14 invalid cells (text, decimal comma) are missing, flagged and never converted', () => {
  const row = [...row1]
  const a = HEADERS.indexOf('L3_vertebral_body_width_mm')
  const b = HEADERS.indexOf('L4_vertebral_body_width_mm')
  row[a] = 'abc'
  row[b] = '"12,5"'
  const p = parseCsv(csv(HEADERS, [row]), catalog)
  const built = buildRequest(p, catalog, 0)
  const m = built.request.measurements as Record<string, number | null>
  expect(m.L3_vertebral_body_width_mm).toBeNull()
  expect(m.L4_vertebral_body_width_mm).toBeNull()
  expect(built.badCells.map((c) => c.value)).toEqual(['abc', '12,5'])
})

test('T-6.2-06 blank is missing, zero is kept', () => {
  const row = [...row1]
  row[HEADERS.indexOf('L3_vertebral_body_width_mm')] = null
  row[HEADERS.indexOf('L3_L4_segmental_coronal_angle_deg')] = 0
  const m = buildRequest(parseCsv(csv(HEADERS, [row]), catalog), catalog, 0).request.measurements as Record<string, number | null>
  expect(m.L3_vertebral_body_width_mm).toBeNull()
  expect(m.L3_L4_segmental_coronal_angle_deg).toBe(0)
})

test('T-6.2-07 and 08 several rows can be chosen and duplicates are flagged', () => {
  const p = parseCsv(csv(HEADERS, [row1, caseRow(sampleCases[1], HEADERS), row1]), catalog)
  expect(p.rows).toHaveLength(3)
  expect(p.duplicateRows).toEqual([2])
  const m = buildRequest(p, catalog, 1).request.measurements as Record<string, number>
  same(m, sampleCases[1].request.measurements)
})

test('T-6.2-09 the label column is ignored with a notice and never sent', () => {
  const p = parseCsv(csv([...HEADERS, 'is_healthy'], [[...row1, 1]]), catalog)
  expect(p.ignored).toEqual(['is_healthy'])
  const built = buildRequest(p, catalog, 0)
  expect(JSON.stringify(built.request)).not.toContain('is_healthy')
  expect(built.notes.join(' ')).toContain('training label')
})

test('T-6.2-10 and 11 wrong file types and oversized files are rejected', () => {
  expect(checkFile({ name: 'data.xlsx', size: 10 })).toMatch(/not a .csv file/)
  expect(checkFile({ name: 'pic.png', size: 10 })).toMatch(/not a .csv file/)
  expect(checkFile({ name: 'big.csv', size: 5 * 1024 * 1024 })).toMatch(/limit is 2 MB/)
  expect(checkFile({ name: 'ok.CSV', size: MAX_CSV_BYTES })).toBeNull()
})

test('T-6.2-12 header-only files have no data rows', () => {
  expect(parseCsv(csv(HEADERS, []), catalog).rows).toHaveLength(0)
})

test('T-6.2-13 a byte-order mark and quoted fields parse correctly', () => {
  const text = '﻿' + csv(['"age_years"', 'L3_vertebral_body_width_mm'], [['54', '"44.1"']])
  const p = parseCsv(text, catalog)
  expect(p.recognised).toEqual({ age_years: 'age_years', L3_vertebral_body_width_mm: 'L3_vertebral_body_width_mm' })
  const built = buildRequest(p, catalog, 0)
  expect(built.request.person).toEqual({ age_years: 54 })
  expect((built.request.measurements as Record<string, number>).L3_vertebral_body_width_mm).toBe(44.1)
})

test('headers match case-insensitively after trimming, nothing else', () => {
  const p = parseCsv(csv([' AGE_YEARS ', 'l3_vertebral_body_width_mm', 'L3 width mm'], [['40', '44', '9']]), catalog)
  expect(Object.values(p.recognised).sort()).toEqual(['age_years', 'L3_vertebral_body_width_mm'].sort())
  expect(p.unrecognised).toEqual(['L3 width mm'])
})

test('T-6.2-15 the template round trip gives the same result as the sample case', () => {
  const text = templateCsv(catalog, case1.request)
  const built = buildRequest(parseCsv(text, catalog), catalog, 0)
  same(built.request.measurements, case1.request.measurements)
  expect(built.request.person).toEqual(case1.request.person)
  // Git may check the file out with Windows line endings; the content is what matters
  expect(readFileSync(join(__dirname, '..', '..', '..', '..', 'public', 'spinalytics_template.csv'), 'utf-8').replace(/
/g, '
')).toBe(text)
})

test('the same case sent as CSV and posted directly carry identical values (case 2)', () => {
  const c2 = sampleCases[1]
  const built = buildRequest(parseCsv(csv(HEADERS, [caseRow(c2, HEADERS)]), catalog), catalog, 0)
  same(built.request.measurements, c2.request.measurements)
  expect(built.request.person).toEqual(c2.request.person)
})

test('two columns for the same field never both count', () => {
  const p = parseCsv(csv(['age_years', 'age'], [['40', '99']]), catalog)
  const built = buildRequest(p, catalog, 0, { age: 'age_years' })
  expect(built.request.person).toEqual({ age_years: 40 })
  expect(built.notes.join(' ')).toContain('already supplied')
})
