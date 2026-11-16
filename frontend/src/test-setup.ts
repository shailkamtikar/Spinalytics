import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom has none of these browser APIs; the animation library and router feature-detect them.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}
class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
if (!('IntersectionObserver' in window)) (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO
if (!('ResizeObserver' in window)) (window as unknown as { ResizeObserver: unknown }).ResizeObserver = IO
window.scrollTo = (() => {}) as typeof window.scrollTo

// asynchronous queries wait up to 5 s: pages pull in lazy chunks and the suite runs many jsdom files in parallel
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
  document.documentElement.setAttribute('data-theme', 'dark')
})
