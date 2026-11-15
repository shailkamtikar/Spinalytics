import { useEffect, useState } from 'react'
import { getHealth } from './api/client'

type ApiState = 'checking' | 'ok' | 'unreachable'

export default function App() {
  const [api, setApi] = useState<ApiState>('checking')

  useEffect(() => {
    let cancelled = false
    getHealth()
      .then((health) => {
        if (!cancelled) setApi(health.status === 'ok' ? 'ok' : 'unreachable')
      })
      .catch(() => {
        if (!cancelled) setApi('unreachable')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="min-h-screen bg-neutral-950 p-8 font-mono text-neutral-200">
      <h1 className="text-2xl">Spinalytics</h1>
      <p className="mt-2 text-sm text-neutral-400" role="status">
        API: {api}
      </p>
    </main>
  )
}
