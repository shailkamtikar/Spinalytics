import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { analyze, getHealth, REQUEST_TIMEOUT_MS } from '../api/client'
import { ApiError } from '../api/errors'
import { useAnalysisStore, WAKING_AFTER_MS } from './analysisStore'

const REQUEST = { source: 'sample', units: { length: 'mm', angle: 'deg' }, person: {}, measurements: {} } as never
const OK = { analysis_id: 'abc', overall: { state: 'within_reference' }, statistical: { findings: [] }, model: { status: 'ok' } }

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  vi.useFakeTimers()
  useAnalysisStore.getState().reset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

test('T-5.3-02 success path stores the result', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, OK)))
  const ok = await useAnalysisStore.getState().run(REQUEST)
  const s = useAnalysisStore.getState()
  expect(ok).toBe(true)
  expect(s.status).toBe('done')
  expect(s.result?.analysis_id).toBe('abc')
})

test('T-5.3-03 a 422 envelope becomes a typed error with the field list', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(422, { error: { code: 'validation_error', message: 'Fix these', fields: [{ field: 'person.age_years', message: 'too large' }] } })))
  await useAnalysisStore.getState().run(REQUEST)
  const { status, error } = useAnalysisStore.getState()
  expect(status).toBe('error')
  expect(error).toBeInstanceOf(ApiError)
  expect(error?.kind).toBe('validation')
  expect(error?.fields).toEqual([{ field: 'person.age_years', message: 'too large' }])
})

test('T-5.3-04 a 429 is reported once and never retried automatically', async () => {
  const fetchMock = vi.fn().mockResolvedValue(respond(429, { error: { code: 'rate_limited', message: 'Too many requests', fields: [] } }))
  vi.stubGlobal('fetch', fetchMock)
  await useAnalysisStore.getState().run(REQUEST)
  expect(useAnalysisStore.getState().error?.kind).toBe('rate_limited')
  await vi.advanceTimersByTimeAsync(120_000)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('T-5.3-05 network failure gives a network error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  await useAnalysisStore.getState().run(REQUEST)
  expect(useAnalysisStore.getState().error?.kind).toBe('network')
})

test('T-5.3-06 the waking state appears after 4 s and clears on response', async () => {
  let release!: (v: unknown) => void
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((r) => (release = r))))
  const run = useAnalysisStore.getState().run(REQUEST)
  expect(useAnalysisStore.getState().status).toBe('loading')
  await vi.advanceTimersByTimeAsync(WAKING_AFTER_MS + 100)
  expect(useAnalysisStore.getState().status).toBe('waking')
  release(respond(200, OK))
  await run
  expect(useAnalysisStore.getState().status).toBe('done')
})

test('T-5.3-07 a request that never answers times out at 60 s', async () => {
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))))
  const run = useAnalysisStore.getState().run(REQUEST)
  await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 100)
  await run
  expect(useAnalysisStore.getState().error?.kind).toBe('timeout')
})

test('a second click while a request is running sends nothing', async () => {
  let release!: (v: unknown) => void
  const fetchMock = vi.fn().mockReturnValue(new Promise((r) => (release = r)))
  vi.stubGlobal('fetch', fetchMock)
  const first = useAnalysisStore.getState().run(REQUEST)
  expect(await useAnalysisStore.getState().run(REQUEST)).toBe(false)
  release(respond(200, OK))
  await first
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('T-5.3-08 nothing is written to web storage during an analysis', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, OK)))
  await useAnalysisStore.getState().run(REQUEST)
  expect(localStorage.length).toBe(0)
  expect(sessionStorage.length).toBe(0)
})

test('typed client functions call the documented paths', async () => {
  const fetchMock = vi.fn().mockResolvedValue(respond(200, { status: 'ok' }))
  vi.stubGlobal('fetch', fetchMock)
  await getHealth()
  await analyze(REQUEST)
  expect(fetchMock.mock.calls[0][0]).toBe('/api/health')
  expect(fetchMock.mock.calls[1][0]).toBe('/api/analyze')
  expect(fetchMock.mock.calls[1][1].method).toBe('POST')
})
