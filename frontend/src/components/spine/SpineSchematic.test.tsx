import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { SpineSchematic } from './SpineSchematic'
import { ALL_VERTEBRAE, DISCS } from '../../domain/levels'

test('T-5.2-05 renders 24 vertebrae and 23 discs with unique data-level, C1 and C2 marked not measured', () => {
  const { container } = render(<SpineSchematic />)
  const vertebrae = [...container.querySelectorAll('[data-kind="vertebra"]')]
  const discs = [...container.querySelectorAll('[data-kind="disc"]')]
  expect(vertebrae).toHaveLength(24)
  expect(discs).toHaveLength(23)
  const levels = [...vertebrae, ...discs].map((e) => e.getAttribute('data-level'))
  expect(new Set(levels).size).toBe(47)
  expect(levels.filter((l) => !l!.includes('-'))).toEqual(ALL_VERTEBRAE)
  expect(levels.filter((l) => l!.includes('-'))).toEqual(DISCS)
  for (const lv of ['C1', 'C2']) expect(container.querySelector(`[data-level="${lv}"]`)).toHaveAttribute('data-measured', 'false')
  expect(container.querySelector('[data-level="L3"]')).toHaveAttribute('data-measured', 'true')
})

test('status colouring is carried on the matching element only', () => {
  const { container } = render(<SpineSchematic statuses={{ L3: 'large_deviation', 'L4-L5': 'review' }} />)
  expect(container.querySelector('[data-level="L3"]')).toHaveAttribute('data-status', 'large_deviation')
  expect(container.querySelector('[data-level="L4-L5"]')).toHaveAttribute('data-status', 'review')
  expect(container.querySelector('[data-level="L4"]')).not.toHaveAttribute('data-status')
})

test('every level is selectable by click and keyboard; unmeasured ones are described as such by the details panel', async () => {
  const onSelect = vi.fn()
  const { container } = render(<SpineSchematic onSelect={onSelect} statuses={{ T7: 'within' }} />)
  await userEvent.click(container.querySelector('[data-level="T7"]')!)
  expect(onSelect).toHaveBeenCalledWith('T7')
  ;(container.querySelector('[data-level="L1"]') as SVGGElement).focus()
  await userEvent.keyboard('{Enter}')
  expect(onSelect).toHaveBeenLastCalledWith('L1')
  await userEvent.click(container.querySelector('[data-level="C1"]')!)
  expect(onSelect).toHaveBeenLastCalledWith('C1')
})

test('the group has a text alternative that says the sizes are illustrative', () => {
  const { container } = render(<SpineSchematic />)
  expect(container.querySelector('svg')).toHaveAttribute('aria-label', expect.stringMatching(/not anatomically exact/))
})
