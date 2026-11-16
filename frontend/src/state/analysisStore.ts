import { create } from 'zustand'
import { analyze, type AnalyzeRequest, type AnalyzeResponse } from '../api/client'
import { ApiError } from '../api/errors'

export interface AssistantMessage {
  role: 'user' | 'assistant'
  text: string
  aiGenerated?: boolean
  kind?: 'answer' | 'refusal' | 'rephrase' | 'error'
}

export type AnalysisStatus = 'idle' | 'waking' | 'loading' | 'done' | 'error'
export const WAKING_AFTER_MS = 4000

interface AnalysisState {
  input: AnalyzeRequest | null
  result: AnalyzeResponse | null
  selectedLevel: string | null
  status: AnalysisStatus
  error: ApiError | null
  /** The assistant conversation about the current result; cleared with it. Memory only. */
  messages: AssistantMessage[]
  addMessage: (m: AssistantMessage) => void
  run: (request: AnalyzeRequest) => Promise<boolean>
  selectLevel: (level: string | null) => void
  reset: () => void
}

/** Memory only: nothing here is written to localStorage, sessionStorage or IndexedDB. */
export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  input: null,
  result: null,
  selectedLevel: null,
  status: 'idle',
  error: null,
  messages: [],
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  async run(request) {
    if (get().status === 'loading' || get().status === 'waking') return false // ignore double clicks
    set({ input: request, status: 'loading', error: null, result: null, selectedLevel: null, messages: [] })
    const timer = setTimeout(() => {
      if (get().status === 'loading') set({ status: 'waking' })
    }, WAKING_AFTER_MS)
    try {
      const result = await analyze(request)
      set({ result, status: 'done' })
      return true
    } catch (e) {
      set({ error: e instanceof ApiError ? e : new ApiError('server', 'Unexpected error.'), status: 'error' })
      return false
    } finally {
      clearTimeout(timer)
    }
  },
  selectLevel: (level) => set({ selectedLevel: level }),
  reset: () => set({ input: null, result: null, selectedLevel: null, status: 'idle', error: null, messages: [] }),
}))
