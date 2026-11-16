import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import type { AnalyzeResponse } from '../api/client'
import { REPORTED_LEVELS } from '../domain/levels'
import { buildSpineLayout, findItem } from '../features/spine3d/buildSpineLayout'
import { AppRoutes } from '../routes'
import { useAnalysisStore } from '../state/analysisStore'
import { ThemeProvider } from '../theme/ThemeProvider'
import case1 from '../test-utils/results/case1.json'
import case2 from '../test-utils/results/case2.json'
import case3 from '../test-utils/results/case3.json'
import case8 from '../test-utils/results/case8.json'

const load = (r: unknown) => r as AnalyzeResponse

function show(result: AnalyzeResponse) {
  useAnalysisStore.setState({ result, status: 'done', selectedLevel: null })
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/results']}>
        <AppRoutes />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  useAnalysisStore.getState().reset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }))
})

const rowsOf = () => within(screen.getByTestId('findings-table')).getAllByRole('row').slice(1)

test('T-7.1-01 the table has one row per returned finding', () => {
  const r = load(case2)
  show(r)
  expect(rowsOf()).toHaveLength(r.statistical.findings.length)
})

test('T-7.1-02 displayed values equal the API values at their rounding', () => {
  const r = load(case2)
  show(r)
  const rows = rowsOf()
  const sample = r.statistical.findings.filter((x) => x.value !== null && x.unit === 'mm' && !x.derived).slice(0, 5)
  expect(sample).toHaveLength(5)
  for (const f of sample) {
    const row = rows.find((tr) => tr.getAttribute('data-level') === f.level && tr.textContent!.includes(f.feature.replace(/_mm$/, '').replace(/_/g, ' ')))!
    expect(row.textContent).toContain((f.value as number).toFixed(2))
    expect(row.textContent).toContain((f.z_score as number).toFixed(2))
  }
})

test('T-7.1-03 angle rows show a dash with a reason for the percentage', () => {
  show(load(case2))
  const row = rowsOf().find((tr) => tr.textContent!.includes('segmental sagittal angle'))!
  const cell = row.querySelectorAll('td')[5]
  expect(cell.textContent).toBe('—')
  expect(cell.getAttribute('title')).toMatch(/not meaningful for angles/)
})

test('T-7.1-04 sorting by |z| puts the perturbed level first in case 2', () => {
  show(load(case2))
  expect(rowsOf()[0].getAttribute('data-level')).toBe('C3')
})

test('T-7.1-05 filters show only the chosen statuses', async () => {
  show(load(case2))
  await userEvent.click(screen.getByLabelText('Within reference'))
  await userEvent.click(screen.getByLabelText('Missing'))
  const statuses = new Set(rowsOf().map((r) => r.getAttribute('data-status')))
  expect([...statuses].sort()).toEqual(['large_deviation', 'review'])
})

test('T-7.1-06 clicking a row selects its level in the details panel and the figure', async () => {
  show(load(case2))
  await userEvent.click(within(rowsOf()[0]).getByRole('button'))
  expect(screen.getByRole('heading', { name: 'C3' })).toBeInTheDocument()
  expect(document.querySelector('[data-selected]')).toHaveAttribute('data-level', 'C3')
})

test('T-7.1-07 and 08 incomplete data: grey rows, indeterminate overall, model did not run', () => {
  show(load(case8))
  expect(screen.getByRole('heading', { level: 1, name: 'Indeterminate' })).toBeInTheDocument()
  expect(rowsOf().some((r) => r.getAttribute('data-status') === 'missing' && /Missing/.test(r.textContent!))).toBe(true)
  expect(screen.getByText(/Model did not run: 151 measurements are missing/)).toBeInTheDocument()
})

test('T-7.1-09 a model that is unavailable gives a calm notice and the statistics stay', () => {
  const r = structuredClone(load(case1))
  r.model = { status: 'unavailable', contributors: [], message: '' } as never
  show(r)
  expect(screen.getByText(/model is not available right now/i)).toBeInTheDocument()
  expect(rowsOf().length).toBeGreaterThan(200)
})

test('T-7.1-10 a within-reference case reads calmly and still lists everything', () => {
  const r = load(case1)
  show(r)
  expect(screen.getByRole('heading', { level: 1, name: 'Within reference pattern' })).toBeInTheDocument()
  expect(rowsOf()).toHaveLength(r.statistical.findings.length)
})

test('T-7.1-11 and 12 numbers carry units and the table has proper header cells', () => {
  show(load(case2))
  const table = screen.getByTestId('findings-table')
  expect(within(table).getAllByRole('columnheader')).toHaveLength(10)
  expect(rowsOf()[1].textContent).toMatch(/mm|°|deg|%/)
  expect(within(table).getAllByRole('rowheader').length).toBe(rowsOf().length)
})

test('model score is shown with the not-a-probability sentence and top contributors', () => {
  show(load(case2))
  expect(screen.getByText(/Not the probability of disease/)).toBeInTheDocument()
  expect(screen.getByText('C3 vertebral body heights')).toBeInTheDocument()
})

test('T-7.3-05 Escape clears the selection', async () => {
  show(load(case2))
  act(() => useAnalysisStore.getState().selectLevel('T7'))
  expect(screen.getByRole('heading', { name: 'T7' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByTestId('level-summary')).toBeNull()
})

test('T-7.3-07 keyboard: arrow keys in the level list move the selection', async () => {
  show(load(case2))
  const list = screen.getByRole('list', { name: 'Levels' })
  const c3 = list.querySelector('[data-level="C3"]') as HTMLButtonElement
  c3.focus()
  await userEvent.keyboard('{Enter}')
  expect(useAnalysisStore.getState().selectedLevel).toBe('C3')
  await userEvent.keyboard('{ArrowDown}')
  expect(useAnalysisStore.getState().selectedLevel).toBe('C4')
})

test('T-7.3-08 selecting C1 says it is not measured in this version', () => {
  show(load(case2))
  act(() => useAnalysisStore.getState().selectLevel('C1'))
  expect(screen.getByText(/C1 is not measured in this version/)).toBeInTheDocument()
})

test('T-7.3-09 mapping audit: all 45 reported levels select exactly the matching figure element and layout item', () => {
  show(load(case2))
  const vertebrae = Object.fromEntries(REPORTED_LEVELS.filter((l) => !l.includes('-')).map((l) => [l, { height_mm: 20, width_mm: 40, depth_mm: 30 }]))
  const discs = Object.fromEntries(REPORTED_LEVELS.filter((l) => l.includes('-')).map((l) => [l, { height_mm: 5, sagittal_angle_deg: 1 }]))
  const layout = buildSpineLayout({ level_sizes: { vertebrae, discs } } as never)
  let matched = 0
  for (const level of REPORTED_LEVELS) {
    act(() => useAnalysisStore.getState().selectLevel(level))
    const selected = document.querySelectorAll('[data-selected]')
    if (selected.length === 1 && selected[0].getAttribute('data-level') === level && findItem(layout, level)?.level === level) matched += 1
  }
  expect(matched).toBe(45)
})

test('T-7.2-06 and 07 figure colours agree with each level status; a disc finding colours the disc, not its bodies', () => {
  const r = load(case3)
  show(r)
  const flagged = r.statistical.levels.filter((l) => l.status === 'large_deviation' || l.status === 'review')
  expect(flagged.length).toBeGreaterThan(0)
  for (const l of flagged.slice(0, 5)) expect(document.querySelector(`[data-level="${l.level}"][data-kind]`)).toHaveAttribute('data-status', l.status)
  const discFlag = r.statistical.levels.find((l) => l.target_type === 'disc' && l.status !== 'within')!
  for (const body of discFlag.level.split('-')) {
    const stat = r.statistical.levels.find((l) => l.level === body)
    if (stat) expect(document.querySelector(`[data-level="${body}"][data-kind]`)).toHaveAttribute('data-status', stat.status)
  }
})

test('T-7.2-08 not-measured levels are outlines and never carry a status', () => {
  show(load(case2))
  for (const l of ['C1', 'C2']) {
    const el = document.querySelector(`[data-level="${l}"][data-kind]`)!
    expect(el).toHaveAttribute('data-measured', 'false')
    expect(el).not.toHaveAttribute('data-status')
  }
})

test('T-7.2-09 without WebGL the 2D schematic is shown with a short note', () => {
  show(load(case2))
  expect(document.querySelector('[data-figure="2d"]')).not.toBeNull()
  expect(screen.getByText(/3D view is not available in this browser/)).toBeInTheDocument()
})

test('provenance panel states synthetic origin and the disclaimer', () => {
  show(load(case2))
  expect(screen.getByText(/Synthetic \(generated, not collected from people\)/)).toBeInTheDocument()
  expect(screen.getAllByText(/not a medical device/i).length).toBeGreaterThan(0)
})
