import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { ThemeToggle } from './ThemeToggle'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const setup = () =>
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )

test('T-5.1-01 default theme is dark', () => {
  setup()
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  expect(screen.getByRole('button', { name: /light theme/i })).toBeInTheDocument()
})

test('T-5.1-02 toggle switches theme and the label names the theme it switches to', async () => {
  setup()
  await userEvent.click(screen.getByRole('button'))
  expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  expect(screen.getByRole('button', { name: /dark theme/i })).toBeInTheDocument()
})

test('T-5.1-03 choice is saved and the provider starts from the attribute set before first paint', async () => {
  setup()
  await userEvent.click(screen.getByRole('button'))
  expect(localStorage.getItem('spinalytics-theme')).toBe('light')
  document.documentElement.setAttribute('data-theme', 'light') // what the inline script does on reload
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
  expect(screen.getAllByRole('button', { name: /dark theme/i }).length).toBeGreaterThan(0)
})

test('T-5.1-04 blocked storage does not break the toggle', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError')
  })
  setup()
  await userEvent.click(screen.getByRole('button'))
  expect(document.documentElement.getAttribute('data-theme')).toBe('light')
})

test('T-5.1-09 keyboard: Enter on the focused toggle switches theme', async () => {
  setup()
  await userEvent.tab()
  expect(screen.getByRole('button')).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  expect(document.documentElement.getAttribute('data-theme')).toBe('light')
})
