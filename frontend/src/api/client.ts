import type { components } from '../types/api'
import { ApiError, kindForStatus, type FieldIssue } from './errors'

// Empty in development (the Vite proxy handles /api); set to the backend URL in production.
const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''
export const REQUEST_TIMEOUT_MS = 60_000

type Schemas = components['schemas']
export type AnalyzeRequest = Schemas['AnalyzeRequest']
export type AnalyzeResponse = Schemas['AnalyzeResponse']
export type Finding = Schemas['Finding']
export type LevelStatus = Schemas['LevelStatus']
export type ModelResult = Schemas['ModelResult']
export type StatisticalResult = Schemas['StatisticalResult']

export interface Health {
  status: string
  version: string
  ai_assistant_configured: boolean
}

export interface SampleCaseSummary {
  case_id: string
  title: string
  description: string
  data_origin: string
  notice: string
}

export interface SampleCase extends SampleCaseSummary {
  request: AnalyzeRequest
  incomplete_note: string | null
}

export interface CatalogFeature {
  column: string
  target_type: 'person' | 'vertebra' | 'disc' | 'region'
  level: string | null
  region: string | null
  feature: string
  unit: string
  kind: string
  description: string
  derived: boolean
  percentage_allowed: boolean
  value_type?: string
  min_supported?: number
  max_supported?: number
}

export interface Catalog {
  data_origin: string
  notice: string
  vertebrae: string[]
  unmeasured_vertebrae: string[]
  discs: string[]
  features: CatalogFeature[]
  derived: CatalogFeature[]
}

export interface ReferenceInfo {
  provenance: Record<string, unknown> & { limitation: string; data_origin: string }
  cohorts: Record<string, { description: string; n_rows: number }>
  thresholds: { within_max_abs_z: number; large_min_abs_z: number; min_completeness: number; label: string }
  overall_rule: Record<string, unknown>
  level_sizes: { vertebrae: Record<string, { height_mm: number; width_mm: number; depth_mm: number }>; discs: Record<string, { height_mm: number; sagittal_angle_deg: number }> }
  disclaimer: string
}

export interface ModelInfo {
  version: string
  data_origin: string
  training_data: string
  selected_model: string
  score_note: string
  abstention: Record<string, unknown>
  metrics: Record<string, unknown>
  limitations: string[]
  disclaimer: string
}

interface Envelope {
  error?: { code?: string; message?: string; fields?: FieldIssue[] }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal, headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } })
  } catch (cause) {
    if (controller.signal.aborted) throw new ApiError('timeout', 'The request timed out.')
    throw new ApiError('network', 'Cannot reach the server.')
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) {
    let body: Envelope = {}
    try {
      body = (await response.json()) as Envelope
    } catch {
      // not JSON: fall through to the generic message
    }
    const message = body.error?.message ?? `The server answered with status ${response.status}.`
    throw new ApiError(kindForStatus(response.status), message, { status: response.status, code: body.error?.code, fields: body.error?.fields })
  }
  return (await response.json()) as T
}

export const getHealth = () => request<Health>('/api/health', {}, 15_000)
export const getSampleCases = () => request<SampleCaseSummary[]>('/api/sample-cases')
export const getSampleCase = (id: string) => request<SampleCase>(`/api/sample-cases/${encodeURIComponent(id)}`)
export const getCatalog = () => request<Catalog>('/api/feature-catalog')
export const getReferenceInfo = () => request<ReferenceInfo>('/api/reference-info')
export const getModelInfo = () => request<ModelInfo>('/api/model-info')
export const analyze = (body: AnalyzeRequest) => request<AnalyzeResponse>('/api/analyze', { method: 'POST', body: JSON.stringify(body) })
