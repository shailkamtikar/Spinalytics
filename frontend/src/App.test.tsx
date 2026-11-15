import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'

afterEach(() => vi.unstubAllGlobals())

test('shows API ok when the backend answers', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', version: '0.1.0', ai_assistant_configured: false }),
    }),
  )
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Spinalytics' })).toBeInTheDocument()
  expect(await screen.findByText('API: ok')).toBeInTheDocument()
})

test('shows API unreachable when the backend is down', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  render(<App />)
  expect(await screen.findByText('API: unreachable')).toBeInTheDocument()
})
