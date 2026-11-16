import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf-8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const themes = { dark: block(":root[data-theme='dark']"), light: block(":root[data-theme='light']") }

test('T-5.1-05 every text/background pair reaches 4.5:1 in both themes', () => {
  for (const [name, t] of Object.entries(themes)) {
    const pairs: [string, string][] = [
      ['text', 'bg'], ['text', 'surface'], ['muted', 'bg'], ['muted', 'surface'], ['accent', 'bg'], ['accent', 'surface'],
      ['within', 'bg'], ['within', 'surface'], ['review', 'bg'], ['review', 'surface'], ['large', 'bg'], ['large', 'surface'],
      ['missing', 'bg'], ['missing', 'surface'], ['on-accent', 'accent'],
    ]
    for (const [fg, bg] of pairs) expect(ratio(t[fg], t[bg]), `${name}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
  }
})

test('both themes define the same tokens', () => {
  expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort())
})

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

test('T-5.1-08 no component contains a hard-coded colour', () => {
  const offenders = files(join(__dirname, '..'))
    .filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f))
    .filter((f) => /#[0-9A-Fa-f]{6}\b/.test(readFileSync(f, 'utf-8')))
  expect(offenders).toEqual([])
})

test('T-5.1-07 fonts are self-hosted: no CDN link in the page or the stylesheet', () => {
  const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf-8')
  const index = readFileSync(join(__dirname, '..', 'index.css'), 'utf-8')
  expect(html + index).not.toMatch(/fonts\.googleapis|fonts\.gstatic|cdnjs|jsdelivr|unpkg/)
})
