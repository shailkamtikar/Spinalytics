export interface FieldIssue {
  field: string
  message: string
}

export type ApiErrorKind = 'validation' | 'rate_limited' | 'network' | 'timeout' | 'not_found' | 'server' | 'too_large'

/** Typed error built from the backend's {"error": {...}} envelope, or from a transport failure. */
export class ApiError extends Error {
  kind: ApiErrorKind
  status: number | null
  code: string
  fields: FieldIssue[]

  constructor(kind: ApiErrorKind, message: string, opts: { status?: number | null; code?: string; fields?: FieldIssue[] } = {}) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = opts.status ?? null
    this.code = opts.code ?? kind
    this.fields = opts.fields ?? []
  }
}

export function kindForStatus(status: number): ApiErrorKind {
  if (status === 422) return 'validation'
  if (status === 429) return 'rate_limited'
  if (status === 404) return 'not_found'
  if (status === 413) return 'too_large'
  return 'server'
}

export function friendlyMessage(err: ApiError): string {
  switch (err.kind) {
    case 'network':
      return 'Cannot reach the server. Check your connection and try again.'
    case 'timeout':
      return 'The server took too long to answer (over 60 seconds). Try again in a moment.'
    case 'rate_limited':
      return 'Too many requests in a short time. Please wait a minute before trying again.'
    case 'validation':
      return err.message
    case 'too_large':
      return 'That input is too large to send. Try a smaller file.'
    case 'not_found':
      return 'That item was not found on the server.'
    default:
      return 'The server hit a problem. Please try again.'
  }
}
