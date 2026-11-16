import { useEffect, useState } from 'react'
import { getHealth } from '../../api/client'
import { ApiError, friendlyMessage } from '../../api/errors'
import { Button, Panel } from '../ui'

/** Calm notice shown when the free server is starting up after being idle. */
export function ServerWaking() {
  return (
    <div role="status" className="rounded-sm border border-rule bg-surface p-4 font-mono text-[0.8rem] text-muted">
      <span className="text-accent">●</span> Waking the server. The free hosting tier sleeps when idle, so the first request can take up to a minute. Nothing is wrong; please keep this page open.
    </div>
  )
}

export function ErrorPanel({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <Panel className="border-large" as="div">
      <div role="alert">
        <p className="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-large">Something needs attention</p>
        <p className="mt-2">{friendlyMessage(error)}</p>
        {error.fields.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-sm text-muted">
            {error.fields.slice(0, 8).map((f) => (
              <li key={`${f.field}-${f.message}`}>
                <span className="font-mono text-text">{f.field}</span>: {f.message}
              </li>
            ))}
          </ul>
        )}
        {onRetry && (
          <Button variant="secondary" className="mt-4" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </Panel>
  )
}

type Health = 'checking' | 'ok' | 'unreachable'

/** Small footer indicator that the backend answers. */
export function ApiStatus() {
  const [state, setState] = useState<Health>('checking')
  useEffect(() => {
    let alive = true
    getHealth()
      .then(() => alive && setState('ok'))
      .catch(() => alive && setState('unreachable'))
    return () => {
      alive = false
    }
  }, [])
  return <span className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted">API: {state}</span>
}
