import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const TEMPLATE = join(process.cwd(), 'public', 'spinalytics_template.csv')

async function analyseSample(page: Page, caseNumber: number) {
  await page.goto('/analyze')
  await page.getByRole('button', { name: new RegExp(`^Use case ${caseNumber}:`) }).click()
  await page.getByRole('button', { name: 'Analyse spine' }).click()
  await expect(page).toHaveURL(/\/results$/)
}

test('sample path: case 2 ends on a result that flags C3', async ({ page }) => {
  await analyseSample(page, 2)
  await expect(page.getByRole('heading', { level: 1, name: 'Unusual pattern detected' })).toBeFocused()
  await expect(page.getByTestId('findings-table').getByRole('row').nth(1)).toHaveAttribute('data-level', 'C3')
  await expect(page.locator('[data-figure="3d"] canvas')).toBeVisible()
})

test('CSV path: the template example gives the same result as sample case 1', async ({ page }) => {
  await page.goto('/analyze')
  await page.getByRole('tab', { name: 'CSV upload' }).click()
  await page.locator('input[type=file]').setInputFiles(TEMPLATE)
  await expect(page.getByTestId('csv-summary')).toContainText('220 recognised')
  await expect(page.getByTestId('present-count')).toHaveText('204')
  await page.getByRole('button', { name: 'Analyse spine' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Within reference pattern' })).toBeVisible()
})

test('manual path: prefill, shrink one vertebra, and the level is flagged', async ({ page }) => {
  await page.goto('/analyze')
  await page.getByRole('tab', { name: 'Manual entry' }).click()
  await page.getByLabel('Prefill from a sample case').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Prefill' }).click()
  await expect(page.getByTestId('present-count')).toHaveText('204')
  for (const f of ['anterior', 'posterior']) {
    const field = page.getByLabel(`C3 vertebral body height ${f} (mm)`)
    const v = Number(await field.inputValue())
    await field.fill(String(Math.round(v * 0.7 * 100) / 100))
  }
  await page.getByRole('button', { name: 'Analyse spine' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const c3 = page.getByRole('list', { name: 'Levels' }).locator('[data-level="C3"]')
  await expect(c3).toContainText(/Larger deviation|Review/)
})

test('selection is shared: level list, details panel, table and 2D map agree', async ({ page }) => {
  await analyseSample(page, 3)
  await page.getByRole('list', { name: 'Levels' }).locator('[data-level="L4-L5"]').click()
  await expect(page.getByRole('heading', { name: 'L4-L5' })).toBeVisible()
  await expect(page.getByTestId('findings-table').locator('tr[aria-selected="true"]').first()).toHaveAttribute('data-level', 'L4-L5')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('level-summary')).toHaveCount(0)
  await page.getByTestId('findings-table').locator('tr[data-level="C3"]').first().click()
  await expect(page.getByRole('heading', { name: 'C3' })).toBeVisible()
})

test('theme: dark by default, switch to light, survives a reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'light theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('assistant: an out-of-scope question gets the refusal (assistant route mocked)', async ({ page }) => {
  await page.route('**/api/health', (r) => r.fulfill({ json: { status: 'ok', version: '0.1.0', ai_assistant_configured: true } }))
  await page.route('**/api/ask-result', (r) =>
    r.fulfill({ json: { answer: 'This assistant is limited to explaining spinal anatomy, spinal measurements, and your current Spinalytics result. Please ask a question related to those topics.', ai_generated: false, refused: true, needs_rephrase: false, sources: [], label: '' } }),
  )
  await analyseSample(page, 2)
  await page.getByRole('button', { name: 'Ask AI About This Result' }).click()
  await page.getByLabel('Your question').fill('Write Python code to add two numbers')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByText(/limited to explaining spinal anatomy/)).toBeVisible()
  await expect(page.getByLabel('Your question')).toBeEnabled()
})

test('report: export opens the report and the print layout is light even in the dark theme', async ({ page }) => {
  await analyseSample(page, 2)
  await page.getByRole('link', { name: 'Export report' }).click()
  await expect(page).toHaveURL(/\/report$/)
  await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ media: 'print' })
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)')
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('header.sticky')!).display)).toBe('none')
})

test('backend down: a clear message with Retry instead of a crash', async ({ page }) => {
  await page.route('**/api/**', (r) => r.abort())
  await page.goto('/analyze')
  await expect(page.getByRole('alert')).toContainText('Cannot reach the server')
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})

test('deep links and unknown routes work on the built app', async ({ page }) => {
  await page.goto('/about')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('How a result is made')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('How a result is made')
  await page.goto('/nope')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Page not found')
  await page.goto('/results')
  await expect(page.getByRole('status').filter({ hasText: 'no result yet' })).toBeVisible()
})

test('nothing about the analysis is kept in browser storage', async ({ page }) => {
  await analyseSample(page, 2)
  const stored = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    idb: (await indexedDB.databases?.())?.length ?? 0,
  }))
  expect(stored.local.filter((k) => k !== 'spinalytics-theme')).toEqual([])
  expect(stored.session).toEqual([])
  expect(stored.idb).toBe(0)
})

test('all eight sample cases give the expected overall state through the API', async ({ request }) => {
  const expected = ['within_reference', 'unusual_pattern', 'unusual_pattern', 'unusual_pattern', 'unusual_pattern', 'unusual_pattern', 'unusual_pattern', 'indeterminate']
  const list = await (await request.get('/api/sample-cases')).json()
  expect(list).toHaveLength(8)
  for (const [i, c] of list.entries()) {
    const sample = await (await request.get(`/api/sample-cases/${c.case_id}`)).json()
    const res = await request.post('/api/analyze', { data: sample.request })
    expect(res.status()).toBe(200)
    expect((await res.json()).overall.state, c.case_id).toBe(expected[i])
  }
})
