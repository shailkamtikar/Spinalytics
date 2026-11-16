import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function scan(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`)).toEqual([])
}

async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((t) => localStorage.setItem('spinalytics-theme', t), theme)
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`accessibility, ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => setTheme(page, theme))

    test('landing', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await scan(page, `landing/${theme}`)
    })

    test('analyse (all three input tabs)', async ({ page }) => {
      await page.goto('/analyze')
      await expect(page.getByRole('table', { name: /sample cases/i })).toBeVisible()
      await scan(page, `analyze-sample/${theme}`)
      await page.getByRole('tab', { name: 'CSV upload' }).click()
      await scan(page, `analyze-csv/${theme}`)
      await page.getByRole('tab', { name: 'Manual entry' }).click()
      await expect(page.getByRole('heading', { name: /person details/i })).toBeVisible()
      await scan(page, `analyze-manual/${theme}`)
    })

    test('results and report', async ({ page }) => {
      await page.goto('/analyze')
      await page.getByRole('button', { name: /^Use case 2:/ }).click()
      await page.getByRole('button', { name: 'Analyse spine' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Unusual pattern detected' })).toBeVisible()
      await scan(page, `results/${theme}`)
      await page.getByRole('link', { name: 'Export report' }).click()
      await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible()
      await scan(page, `report/${theme}`)
    })

    test('method page', async ({ page }) => {
      await page.goto('/about')
      await scan(page, `about/${theme}`)
    })
  })
}
