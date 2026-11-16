import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { BackToTop, CountUp, Marquee, RevealWords, Stagger, StaggerItem } from '.'

test('the animated headline reads as one plain sentence to a screen reader', () => {
  render(<h1><RevealWords parts={[{ text: 'Read the spine' }, { text: 'level by level', accent: true }, { text: '.' }]} /></h1>)
  expect(screen.getByRole('heading', { level: 1, name: 'Read the spine level by level.' })).toBeInTheDocument()
})

test('count-up ends on its final value', async () => {
  render(<CountUp value={204} />)
  expect(await screen.findByText('204', {}, { timeout: 3000 })).toBeInTheDocument()
})

test('stagger children and the marquee render their content', () => {
  render(
    <>
      <Stagger as="ul">
        <StaggerItem as="li">one</StaggerItem>
        <StaggerItem as="li">two</StaggerItem>
      </Stagger>
      <Marquee items={['alpha', 'beta']} />
    </>,
  )
  expect(screen.getByText('one')).toBeInTheDocument()
  expect(screen.getAllByText('alpha').length).toBeGreaterThan(0)
})

test('the back-to-top button starts out of the tab order', () => {
  render(<BackToTop />)
  expect(screen.getByLabelText('Back to top', { selector: 'button' })).toHaveAttribute('tabindex', '-1')
})
