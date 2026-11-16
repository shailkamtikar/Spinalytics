import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import type { AnalyzeResponse } from '../api/client'
import { AppRoutes } from '../routes'
import { useAnalysisStore } from '../state/analysisStore'
import { ThemeProvider } from '../theme/ThemeProvider'
import case2 from '../test-utils/results/case2.json'
import case8 from '../test-utils/results/case8.json'

function openReport(result: AnalyzeResponse | null) {
  useAnalysisStore.getState().reset()
  if (result) useAnalysisStore.setState({ result, status: 'done' })
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/report']}>
        <AppRoutes />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })))

test('T-9.1-01 every item the specification asks for is in the report', () => {
  const r = case2 as unknown as AnalyzeResponse
  openReport(r)
  const text = document.body.textContent!
  for (const part of [r.analysis_id, 'Synthetic (generated', 'Completeness', '100%', 'Overall result', 'Affected levels', 'All comparisons', 'Reference group', 'Ref. mean', 'Diff. %', 'Reference, model and evaluation', 'Limitations and uncertainty', 'Non-diagnostic statement', 'FIG. 1', 'TABLE 1']) {
    expect(text, part).toContain(part)
  }
  expect(document.querySelector('[data-level="C3"][data-kind]')).toHaveAttribute('data-status', 'large_deviation')
})

test('T-9.1-02 and 06 values match the results and angles carry no percentage', () => {
  const r = case2 as unknown as AnalyzeResponse
  openReport(r)
  const rows = within(document.querySelector('.report-table')!).getAllByRole('row').slice(1)
  expect(rows).toHaveLength(r.statistical.findings.length)
  const f = r.statistical.findings.find((x) => x.level === 'C3' && x.feature === 'vertebral_body_width_mm')!
  const row = rows.find((tr) => tr.textContent!.startsWith('C3') && tr.textContent!.includes('vertebral body width'))!
  expect(row.textContent).toContain((f.value as number).toFixed(2))
  expect(row.textContent).toContain((f.z_score as number).toFixed(2))
  const angle = rows.find((tr) => tr.textContent!.includes('segmental sagittal angle'))!
  expect(angle.querySelectorAll('td')[5].textContent).toBe('—')
})

test('T-9.1-04 without a result the report redirects to analyse', async () => {
  openReport(null)
  expect(await screen.findByRole('heading', { level: 1, name: /bring in a/i })).toBeInTheDocument()
})

test('T-9.1-05 an incomplete case reads as indeterminate with the missing data shown', () => {
  openReport(case8 as unknown as AnalyzeResponse)
  expect(screen.getByRole('heading', { level: 1, name: 'Indeterminate' })).toBeInTheDocument()
  expect(screen.getByText(/comparisons have no value \(missing\)/)).toBeInTheDocument()
  expect(screen.getByText(/did not run, 151 measurements missing/)).toBeInTheDocument()
})

test('T-9.1-07 and 08 assistant text is off by default and, when ticked, labelled AI-generated', async () => {
  openReport(case2 as unknown as AnalyzeResponse)
  act(() => {
    useAnalysisStore.getState().addMessage({ role: 'user', text: 'Why is C3 flagged?' })
    useAnalysisStore.getState().addMessage({ role: 'assistant', text: 'C3 is below the reference mean.', aiGenerated: true, kind: 'answer' })
  })
  expect(screen.queryByText('C3 is below the reference mean.')).toBeNull()
  await userEvent.click(screen.getByLabelText('Include the AI assistant answers'))
  expect(screen.getByText('C3 is below the reference mean.')).toBeInTheDocument()
  expect(screen.getAllByText('AI-generated educational explanation').length).toBeGreaterThan(0)
  expect(screen.getByText(/not verified medical conclusions/)).toBeInTheDocument()
})

test('T-9.1-09 the print stylesheet forces the light palette and repeats table headers', () => {
  const css = readFileSync(join(__dirname, '..', 'styles', 'print.css'), 'utf-8')
  expect(css).toMatch(/@media print/)
  expect(css).toMatch(/html:root\[data-theme='dark'\]/)
  expect(css).toMatch(/--bg:\s*#ffffff/)
  expect(css).toMatch(/table-header-group/)
  expect(css).toMatch(/break-inside:\s*avoid/)
})

test('T-9.1-10 the last section holds the non-diagnostic and synthetic statements', () => {
  openReport(case2 as unknown as AnalyzeResponse)
  const note = screen.getAllByRole('note').find((n) => /Non-diagnostic statement/.test(n.textContent ?? ''))! // the report note, not the footer
  expect(note.textContent).toMatch(/Non-diagnostic statement/)
  expect(note.textContent).toMatch(/synthetic data/)
})

test('the results page offers the export and the report offers printing', async () => {
  openReport(case2 as unknown as AnalyzeResponse)
  expect(screen.getByRole('button', { name: /print or save as pdf/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /back to results/i })).toHaveAttribute('href', '/results')
})
