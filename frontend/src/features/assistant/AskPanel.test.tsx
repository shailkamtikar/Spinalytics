import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AnalyzeResponse } from '../../api/client'
import { AppRoutes } from '../../routes'
import { useAnalysisStore } from '../../state/analysisStore'
import { ThemeProvider } from '../../theme/ThemeProvider'
import case2 from '../../test-utils/results/case2.json'
import { mockApi } from '../../test-utils/mockApi'
import { suggestedQuestions } from './AskPanel'

const result = case2 as unknown as AnalyzeResponse

function show() {
  useAnalysisStore.setState({ result, status: 'done', selectedLevel: null })
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/results']}>
        <AppRoutes />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

beforeEach(() => useAnalysisStore.getState().reset())
afterEach(() => vi.unstubAllGlobals())

const askCalls = (calls: { url: string; body?: unknown }[]) => calls.filter((c) => c.url === '/api/ask-result')

test('T-8.3-01 and 02 the panel opens and closes without any request, and focus returns to the button', async () => {
  const { calls } = mockApi({ ai: true })
  show()
  const button = await screen.findByRole('button', { name: 'Ask AI About This Result' })
  await userEvent.click(button)
  expect(await screen.findByRole('heading', { name: /ask ai about this result/i })).toBeInTheDocument()
  expect(askCalls(calls)).toHaveLength(0)
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('heading', { name: /ask ai about this result/i })).toBeNull())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ask AI About This Result' })).toHaveFocus())
  expect(askCalls(calls)).toHaveLength(0)
})

test('T-8.3-03 a suggested question returns a labelled answer; the result is sent with it', async () => {
  const { calls } = mockApi({ ai: true })
  show()
  await userEvent.click(await screen.findByRole('button', { name: 'Ask AI About This Result' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Why is C3 flagged?' }))
  expect(await screen.findByText(/One possibility is lower bone density/)).toBeInTheDocument()
  expect(screen.getByText('AI-generated educational explanation')).toBeInTheDocument()
  const sent = askCalls(calls)[0].body as { question: string; result: { analysis_id: string } }
  expect(sent.question).toBe('Why is C3 flagged?')
  expect(sent.result.analysis_id).toBe(result.analysis_id)
})

test('T-8.3-04 a refusal is shown as the fixed sentence and the input stays usable', async () => {
  mockApi({ ai: true, ask: () => ({ status: 200, body: { answer: 'This assistant is limited to explaining spinal anatomy.', ai_generated: false, refused: true, needs_rephrase: false, sources: [], label: '' } }) })
  show()
  await userEvent.click(await screen.findByRole('button', { name: 'Ask AI About This Result' }))
  await userEvent.type(await screen.findByLabelText('Your question'), 'Write python code')
  await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
  expect(await screen.findByText(/limited to explaining spinal anatomy/)).toBeInTheDocument()
  expect(screen.queryByText('AI-generated educational explanation')).toBeNull()
  expect(screen.getByLabelText('Your question')).toBeEnabled()
})

test('T-8.3-05 an unavailable assistant gives a calm message and leaves the results alone', async () => {
  mockApi({ ai: true, ask: () => ({ status: 503, body: { error: { code: 'ai_quota', message: 'The optional AI assistant is temporarily unavailable (usage limit reached). Your results are unaffected.', fields: [] } } }) })
  show()
  await userEvent.click(await screen.findByRole('button', { name: 'Ask AI About This Result' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Why is C3 flagged?' }))
  expect(await screen.findByText(/temporarily unavailable/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Unusual pattern detected' })).toBeInTheDocument()
})

test('T-8.3-06 a 429 asks the user to wait and does not resend automatically', async () => {
  const { calls } = mockApi({ ai: true, ask: () => ({ status: 429, body: { error: { code: 'rate_limited', message: 'Too many', fields: [] } } }) })
  show()
  await userEvent.click(await screen.findByRole('button', { name: 'Ask AI About This Result' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Why is C3 flagged?' }))
  expect(await screen.findByText(/wait a minute/)).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Your question'), 'Another question about C4')
  await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
  expect(askCalls(calls)).toHaveLength(1)
})

test('T-8.3-07 when the assistant is not configured the button is replaced by a note', async () => {
  mockApi({ ai: false })
  show()
  expect(await screen.findByText(/optional AI assistant is not set up on this server/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Ask AI About This Result' })).toBeNull()
})

test('T-8.3-08 markup in an answer is shown as text and never executed', async () => {
  const evil = '<img src=x onerror="window.__pwned=1"> and <b>bold</b>'
  mockApi({ ai: true, ask: () => ({ status: 200, body: { answer: evil, ai_generated: true, refused: false, needs_rephrase: false, sources: [], label: '' } }) })
  show()
  await userEvent.click(await screen.findByRole('button', { name: 'Ask AI About This Result' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Why is C3 flagged?' }))
  expect(await screen.findByText(/<img src=x/)).toBeInTheDocument()
  expect(document.querySelector('img')).toBeNull()
  expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
})

test('T-8.3-09 the table is identical before and after a question', async () => {
  mockApi({ ai: true })
  show()
  const before = screen.getByTestId('findings-table').textContent
  await userEvent.click(await screen.findByRole('button', { name: 'Ask AI About This Result' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Why is C3 flagged?' }))
  await screen.findByText(/One possibility/)
  expect(screen.getByTestId('findings-table').textContent).toBe(before)
})

test('T-8.3-11 new answers are announced through a polite live region', async () => {
  mockApi({ ai: true })
  show()
  await userEvent.click(await screen.findByRole('button', { name: 'Ask AI About This Result' }))
  expect(screen.getByRole('log', { name: 'Conversation' })).toHaveAttribute('aria-live', 'polite')
})

test('suggested questions come from the result', () => {
  expect(suggestedQuestions(result)[0]).toMatch(/^Why is [A-Z]\d{1,2}(-[A-Z]\d{1,2})? flagged\?$/)
  expect(suggestedQuestions(result).length).toBeGreaterThanOrEqual(3)
})

test('T-8.3-10 the conversation is cleared with the result', async () => {
  mockApi({ ai: true })
  show()
  await userEvent.click(await screen.findByRole('button', { name: 'Ask AI About This Result' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Why is C3 flagged?' }))
  await screen.findByText(/One possibility/)
  useAnalysisStore.getState().reset()
  expect(await screen.findByRole('heading', { level: 1, name: /bring in a/i })).toBeInTheDocument()
  expect(screen.queryByText(/One possibility/)).toBeNull()
})
