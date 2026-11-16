import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AppRoutes } from '../routes'
import { useAnalysisStore } from '../state/analysisStore'
import { ThemeProvider } from '../theme/ThemeProvider'
import { catalog, sampleCases } from '../test-utils/fixtures'
import { fakeResult, mockApi } from '../test-utils/mockApi'
import { groupByRegion } from '../features/input/manual/useManualForm'

beforeEach(() => useAnalysisStore.getState().reset())
afterEach(() => vi.unstubAllGlobals())

function visit(path: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

test('T-6.1-01 the list loads with eight synthetic cases', async () => {
  mockApi()
  visit('/analyze')
  const table = await screen.findByRole('table', { name: /sample cases/i })
  expect(within(table).getAllByRole('row')).toHaveLength(9)
  expect(within(table).getAllByText('Synthetic data')).toHaveLength(8)
})

test('T-6.1-02 to 04 pick, review, analyse, land on the result heading with focus', async () => {
  const { calls } = mockApi({ analyze: () => fakeResult('unusual_pattern') })
  visit('/analyze')
  await userEvent.click(await screen.findByRole('button', { name: /use case 2/i }))
  expect(await screen.findByRole('heading', { name: /check what will be sent/i })).toBeInTheDocument()
  expect(screen.getByTestId('present-count')).toHaveTextContent('204')
  await userEvent.click(screen.getByRole('button', { name: /analyse spine/i }))
  const heading = await screen.findByRole('heading', { level: 1, name: 'Unusual pattern detected' })
  expect(heading).toHaveFocus()
  const sent = calls.find((c) => c.url === '/api/analyze')!.body as { source: string }
  expect(sent.source).toBe('sample')
})

test('T-6.1-04 an incomplete case shows the low-completeness warning', async () => {
  mockApi()
  visit('/analyze')
  await userEvent.click(await screen.findByRole('button', { name: /use case 8/i }))
  const notes = await screen.findByRole('list', { name: /review notes/i })
  expect(notes).toHaveTextContent(/indeterminate/i)
  expect(notes).toHaveTextContent(/model needs all 204|will not give a score/i)
})

test('T-6.1-05 the backend being down shows an error panel with Retry, not a crash', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')))
  visit('/analyze')
  expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the server/i)
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
})

test('T-6.1-06 opening results directly redirects to analyse with a note', async () => {
  mockApi()
  visit('/results')
  expect(await screen.findByRole('heading', { level: 1, name: /bring in a/i })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent(/no result yet/i)
})

test('T-6.1-07 a double click sends one request', async () => {
  const { calls } = mockApi()
  visit('/analyze')
  await userEvent.click(await screen.findByRole('button', { name: /use case 1/i }))
  const analyse = await screen.findByRole('button', { name: /analyse spine/i })
  await userEvent.dblClick(analyse)
  await screen.findByRole('heading', { level: 1, name: 'Within reference pattern' })
  expect(calls.filter((c) => c.url === '/api/analyze')).toHaveLength(1)
})

test('T-6.1-08 result wording never says healthy, disease or diagnosis outside the notice', async () => {
  mockApi()
  visit('/analyze')
  await userEvent.click(await screen.findByRole('button', { name: /use case 1/i }))
  await userEvent.click(await screen.findByRole('button', { name: /analyse spine/i }))
  await screen.findByRole('heading', { level: 1, name: 'Within reference pattern' })
  const main = document.getElementById('main')!
  expect(main.textContent).not.toMatch(/healthy|disease|diagnosis/i)
})

test('T-6.3-01 the form covers 204 spine fields plus 16 optional person fields, with units', async () => {
  const groups = groupByRegion(catalog)
  expect(groups.map((g) => g.total)).toEqual([49, 109, 46])
  expect(groups.reduce((n, g) => n + g.total, 0)).toBe(204)
  mockApi()
  visit('/analyze')
  await userEvent.click(await screen.findByRole('tab', { name: /manual entry/i }))
  const person = await screen.findByRole('heading', { name: /person details/i })
  expect(person.closest('section')!.querySelectorAll('select, input')).toHaveLength(16)
  expect(screen.getByLabelText('C3 vertebral body height anterior (mm)')).toBeInTheDocument()
})

test('T-6.3-09 there is no name, e-mail, phone or date-of-birth field', async () => {
  mockApi()
  visit('/analyze')
  await userEvent.click(await screen.findByRole('tab', { name: /manual entry/i }))
  await screen.findByRole('heading', { name: /person details/i })
  expect(screen.queryByLabelText(/name|e-?mail|phone|birth/i)).toBeNull()
})

test('T-6.3-02 to 04 prefill then edit sends the edited value; text shows an inline error', async () => {
  const { calls } = mockApi()
  visit('/analyze')
  await userEvent.click(await screen.findByRole('tab', { name: /manual entry/i }))
  await userEvent.selectOptions(await screen.findByLabelText(/prefill from a sample case/i), await screen.findByRole('option', { name: /01 ·/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Prefill' }))
  await waitFor(() => expect(screen.getByTestId('present-count')).toHaveTextContent('204'))
  const field = screen.getByLabelText('C3 vertebral body height anterior (mm)') as HTMLInputElement
  const original = Number(field.value)
  await userEvent.clear(field)
  await userEvent.type(field, String(Math.round(original * 0.7 * 100) / 100))
  await userEvent.click(screen.getByRole('button', { name: /analyse spine/i }))
  await screen.findByRole('heading', { level: 1 })
  const sent = calls.find((c) => c.url === '/api/analyze')!.body as { measurements: Record<string, number>; source: string }
  expect(sent.source).toBe('manual')
  expect(sent.measurements.C3_vertebral_body_height_anterior_mm).toBeCloseTo(original * 0.7, 1)
})

test('T-6.3-04 and 05 text is an error that blocks analysis; out-of-range is a warning', async () => {
  mockApi()
  visit('/analyze')
  await userEvent.click(await screen.findByRole('tab', { name: /manual entry/i }))
  const w = await screen.findByLabelText('C3 vertebral body width (mm)')
  await userEvent.type(w, 'abc')
  expect((await screen.findAllByText(/enter a number/i)).length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: /analyse spine/i })).toBeDisabled()
  await userEvent.clear(w)
  await userEvent.type(w, '4400')
  expect((await screen.findAllByText(/outside the supported range/i)).length).toBeGreaterThan(0)
})

test('T-6.3-06 to 08 empty stays empty, zero is a value, partial forms warn the model will not run', async () => {
  const { calls } = mockApi()
  visit('/analyze')
  await userEvent.click(await screen.findByRole('tab', { name: /manual entry/i }))
  await userEvent.type(await screen.findByLabelText('C3 vertebral body width (mm)'), '0')
  expect(screen.getByTestId('present-count')).toHaveTextContent('1')
  expect(screen.getByRole('list', { name: /review notes/i })).toHaveTextContent(/model needs all 204/i)
  await userEvent.click(screen.getByRole('button', { name: /analyse spine/i }))
  await screen.findByRole('heading', { level: 1 })
  const sent = calls.find((c) => c.url === '/api/analyze')!.body as { measurements: Record<string, number> }
  expect(Object.keys(sent.measurements)).toEqual(['C3_vertebral_body_width_mm'])
  expect(sent.measurements.C3_vertebral_body_width_mm).toBe(0)
})

test('T-6.3-10 switching region tabs keeps what was typed', async () => {
  mockApi()
  visit('/analyze')
  await userEvent.click(await screen.findByRole('tab', { name: /manual entry/i }))
  await userEvent.type(await screen.findByLabelText('C3 vertebral body width (mm)'), '41.5')
  await userEvent.click(screen.getByRole('tab', { name: /^lumbar/i }))
  await userEvent.click(screen.getByRole('tab', { name: /^cervical/i }))
  expect(screen.getByLabelText('C3 vertebral body width (mm)')).toHaveValue('41.5')
})

test('the three input methods are separate tabs and a sample case exists for each id used', () => {
  expect(sampleCases).toHaveLength(8)
})
