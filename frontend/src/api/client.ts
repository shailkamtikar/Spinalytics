// Empty in development (the Vite proxy handles /api); set to the backend URL in production.
const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

export interface Health {
  status: string
  version: string
  ai_assistant_configured: boolean
}

export async function getHealth(): Promise<Health> {
  const response = await fetch(`${BASE_URL}/api/health`)
  if (!response.ok) throw new Error(`Health check failed with status ${response.status}`)
  return (await response.json()) as Health
}
