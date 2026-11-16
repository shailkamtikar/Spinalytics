import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { AppRoutes } from './routes'
import { ThemeProvider } from './theme/ThemeProvider'

afterEach(() => vi.unstubAllGlobals())

function visit(path: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', version: '0.1.0', ai_assistant_configured: false }) }))
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

test('T-5.2-01 routes render the right page and set the document title', () => {
  visit('/about')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/How a result is made/)
  expect(document.title).toBe('Method and limits · Spinalytics')
})

test('landing has an h1, the numbered sections, the table caption and a path to /analyze', () => {
  visit('/')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Read the spine level by level.')
  expect(screen.getAllByRole('link', { name: /start an analysis/i })[0]).toHaveAttribute('href', '/analyze')
  expect(screen.getByText('TABLE 1')).toBeInTheDocument()
  expect(screen.getAllByText('FIG. 1').length).toBeGreaterThan(0)
})

test('T-5.2-02 unknown route shows Page not found with a link home', () => {
  visit('/nope')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page not found')
  expect(screen.getByRole('link', { name: /back to the start/i })).toHaveAttribute('href', '/')
})

test('T-5.2-09 the non-diagnostic notice is in the footer of every route', () => {
  for (const path of ['/', '/about', '/styleguide', '/nope']) {
    const { unmount } = visit(path)
    expect(screen.getByRole('note')).toHaveTextContent(/not a medical device and does not diagnose/)
    unmount()
  }
})

test('T-5.2-08 skip link and primary navigation exist', () => {
  visit('/')
  expect(screen.getByRole('link', { name: /skip to content/i })).toHaveAttribute('href', '#main')
  expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
})

test('styleguide shows every token', () => {
  visit('/styleguide')
  for (const t of ['--bg', '--accent', '--within', '--review', '--large', '--missing']) expect(screen.getByText(t)).toBeInTheDocument()
})
