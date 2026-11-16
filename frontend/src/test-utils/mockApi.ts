import { vi } from 'vitest'
import { catalog, sampleCases } from './fixtures'

export interface MockOptions {
  analyze?: (body: unknown) => unknown
  /** Whether /api/health reports the assistant as configured. */
  ai?: boolean
  /** Answer for /api/ask-result: status and JSON body. */
  ask?: (body: unknown) => { status: number; body: unknown }
}

const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body })

/** A fetch stub that serves the real catalog and sample cases and records every call. */
export function mockApi(opts: MockOptions = {}) {
  const calls: { url: string; body?: unknown }[] = []
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, body })
    if (url === '/api/health') return json(200, { status: 'ok', version: '0.1.0', ai_assistant_configured: opts.ai ?? false })
    if (url === '/api/feature-catalog') return json(200, catalog)
    if (url === '/api/sample-cases') return json(200, sampleCases.map(({ request: _r, incomplete_note: _n, ...s }) => s))
    const m = /^\/api\/sample-cases\/(.+)$/.exec(url)
    if (m) {
      const c = sampleCases.find((s) => s.case_id === decodeURIComponent(m[1]))
      return c ? json(200, c) : json(404, { error: { code: 'not_found', message: 'Sample case not found.', fields: [] } })
    }
    if (url === '/api/ask-result') {
      const r = opts.ask ? opts.ask(body) : { status: 200, body: { answer: 'C3 is below the reference. One possibility is lower bone density.', ai_generated: true, refused: false, needs_rephrase: false, sources: [], label: 'AI-generated educational explanation. Not a diagnosis.' } }
      return json(r.status, r.body)
    }
    if (url === '/api/analyze') return json(200, opts.analyze ? opts.analyze(body) : fakeResult('within_reference'))
    return json(404, { error: { code: 'not_found', message: url, fields: [] } })
  })
  vi.stubGlobal('fetch', impl)
  return { calls, impl }
}

export function fakeResult(state: 'within_reference' | 'unusual_pattern' | 'indeterminate') {
  return {
    analysis_id: 'test-id',
    data_origin: 'synthetic',
    disclaimer: 'Educational and research prototype on synthetic data. It is not a medical device and does not provide a diagnosis.',
    overall: { state, reason: `reason for ${state}`, statistics_state: state, model_status: 'ok', model_label: state },
    statistical: { findings: [], levels: [], flagged_levels: [], warnings: [], unrecognised_columns: [], overall_state: state, reason: 'r', completeness: 1, n_present: 204, n_expected: 204, cohort: 'all', n_review: 0, n_large: 0, outlier_count: 0, thresholds: { within_max_abs_z: 2, large_min_abs_z: 3.5, min_completeness: 0.5, note: '' }, provenance: {}, disclaimer: '' },
    model: { status: 'ok', label: state, score: 0.2, contributors: [], message: '' },
  }
}
