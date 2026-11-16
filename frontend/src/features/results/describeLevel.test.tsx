import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import type { AnalyzeResponse } from '../../api/client'
import { AppRoutes } from '../../routes'
import { useAnalysisStore } from '../../state/analysisStore'
import { ThemeProvider } from '../../theme/ThemeProvider'
import case1 from '../../test-utils/results/case1.json'
import case2 from '../../test-utils/results/case2.json'
import { describeLevel } from './describeLevel'

const r2 = case2 as unknown as AnalyzeResponse
const r1 = case1 as unknown as AnalyzeResponse

test('a level inside the typical range is described as good', () => {
  const level = r1.statistical.levels.find((l) => l.target_type === 'vertebra' && l.status === 'within')!.level
  const d = describeLevel(level, r1.statistical.findings, r1.model)
  expect(d.tone).toBe('good')
  expect(d.headline).toMatch(/^Good: all \d+ comparisons at .* within the typical range/)
  expect(d.reasons).toEqual([])
  expect(d.typicalRows).toHaveLength(6)
})

test('a departing level says why, in numbers and plain words, without naming a cause', () => {
  const d = describeLevel('C3', r2.statistical.findings, r2.model)
  expect(d.tone).toBe('attention')
  expect(d.headline).toMatch(/^Not within the typical range: \d+ of \d+ comparisons at C3/)
  const text = d.reasons.join(' ')
  expect(text).toMatch(/against a typical/)
  expect(text).toMatch(/wedge|lower than typical/)
  expect(text).not.toMatch(/fracture|disease|diagnos|healthy|osteopor|injury/i)
  expect(d.modelNote).toMatch(/biggest contributors/)
})

test('typical values come straight from the reference in the result', () => {
  const d = describeLevel('C3', r2.statistical.findings)
  const width = r2.statistical.findings.find((f) => f.level === 'C3' && f.feature === 'vertebral_body_width_mm')!
  const row = d.typicalRows.find((t) => t.label === 'vertebral body width')!
  expect(row.typical).toBe(width.reference!.mean)
  expect([row.low, row.high]).toEqual([width.reference!.interval_low, width.reference!.interval_high])
})

test('C1 and C2 are described as not measured, never good', () => {
  const d = describeLevel('C1', r2.statistical.findings)
  expect(d.measured).toBe(false)
  expect(d.tone).toBe('unknown')
  expect(d.headline).toMatch(/not measured in this version/)
})

test('a disc is described with disc wording', () => {
  const disc = r2.statistical.levels.find((l) => l.target_type === 'disc')!.level
  const d = describeLevel(disc, r2.statistical.findings)
  expect(d.typicalRows).toHaveLength(3)
})

beforeEach(() => {
  useAnalysisStore.getState().reset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }))
})

function show() {
  useAnalysisStore.setState({ result: r2, status: 'done', selectedLevel: null })
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/results']}>
        <AppRoutes />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

test('selecting a level shows its summary over the figure at once, and Escape closes it', () => {
  show()
  expect(screen.queryByTestId('level-summary')).toBeNull()
  act(() => useAnalysisStore.getState().selectLevel('C3'))
  const card = screen.getByTestId('level-summary')
  expect(within(card).getByRole('heading', { name: 'C3' })).toBeInTheDocument()
  expect(within(card).getByText(/Not within the typical range/)).toBeInTheDocument()
  expect(within(card).getByText(/What a typical vertebra looks like here/)).toBeInTheDocument()
  act(() => useAnalysisStore.getState().selectLevel('T7'))
  expect(within(screen.getByTestId('level-summary')).getByText(/^Good:|Not within/)).toBeInTheDocument()
  act(() => useAnalysisStore.getState().selectLevel(null))
  expect(screen.queryByTestId('level-summary')).toBeNull()
})
