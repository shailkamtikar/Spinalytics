import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { NumberCell, StatusBadge, type Status } from '.'

test('T-5.1-06 each status is shown with a glyph and a word, not colour alone', () => {
  const expected: [Status, string, string][] = [
    ['within', '●', 'Within reference'],
    ['review', '◐', 'Review'],
    ['large_deviation', '▲', 'Larger deviation'],
    ['missing', '○', 'Missing'],
  ]
  for (const [status, glyph, word] of expected) {
    const { container, unmount } = render(<StatusBadge status={status} />)
    expect(container).toHaveTextContent(glyph)
    expect(screen.getByText(word)).toBeInTheDocument()
    unmount()
  }
})

test('compact badge keeps the word available to screen readers', () => {
  render(<StatusBadge status="review" compact />)
  expect(screen.getByText('Review')).toHaveClass('sr-only')
})

test('numbers carry units, signs and an em dash for no value', () => {
  const { container } = render(
    <>
      <NumberCell value={44.123} unit="mm" />
      <NumberCell value={2} signed digits={1} unit="°" />
      <NumberCell value={null} />
    </>,
  )
  expect(container).toHaveTextContent('44.12mm')
  expect(container).toHaveTextContent('+2.0°')
  expect(container).toHaveTextContent('—')
})
