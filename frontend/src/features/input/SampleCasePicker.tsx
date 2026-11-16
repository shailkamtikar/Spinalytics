import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { getSampleCase, getSampleCases, type SampleCase, type SampleCaseSummary } from '../../api/client'
import type { ApiError } from '../../api/errors'
import { ApiError as ApiErrorClass } from '../../api/errors'
import { ErrorPanel } from '../../components/feedback/Feedback'
import { Caption, SyntheticBadge } from '../../components/ui'

interface Props {
  onPick: (c: SampleCase) => void
}

/** A numbered table of synthetic cases. Titles and descriptions come from the API unchanged. */
export function SampleCasePicker({ onPick }: Props) {
  const [cases, setCases] = useState<SampleCaseSummary[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    getSampleCases().then(
      (c) => alive && (setCases(c), setError(null)),
      (e) => alive && setError(e instanceof ApiErrorClass ? e : new ApiErrorClass('server', 'Unexpected error.')),
    )
    return () => {
      alive = false
    }
  }, [attempt])

  const pick = async (id: string) => {
    setSelected(id)
    setLoadingId(id)
    try {
      onPick(await getSampleCase(id))
    } catch (e) {
      setError(e instanceof ApiErrorClass ? e : new ApiErrorClass('server', 'Unexpected error.'))
    } finally {
      setLoadingId(null)
    }
  }

  if (error) return <ErrorPanel error={error} onRetry={() => setAttempt((a) => a + 1)} />
  if (!cases) return <p role="status" className="font-mono text-sm text-muted">Loading sample cases…</p>

  return (
    <figure>
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Synthetic sample cases</caption>
        <thead>
          <tr className="border-b border-rule font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted">
            <th scope="col" className="w-10 py-2 font-normal">No.</th>
            <th scope="col" className="py-2 font-normal">Case</th>
            <th scope="col" className="hidden py-2 font-normal md:table-cell">What it shows</th>
            <th scope="col" className="py-2 text-right font-normal"><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c, i) => (
            <motion.tr key={c.case_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className={`border-b border-rule align-top transition-colors hover:bg-surface ${selected === c.case_id ? 'bg-surface' : ''}`}>
              <td className="py-3 font-mono text-accent">{String(i + 1).padStart(2, '0')}</td>
              <th scope="row" className="py-3 pr-4 font-normal">
                <span className="block">{c.title}</span>
                <span className="mt-1 inline-block"><SyntheticBadge /></span>
              </th>
              <td className="hidden py-3 pr-4 text-muted md:table-cell">{c.description}</td>
              <td className="py-3 text-right">
                <button
                  type="button"
                  onClick={() => pick(c.case_id)}
                  disabled={loadingId !== null}
                  aria-label={`Use case ${i + 1}: ${c.title}`}
                  aria-pressed={selected === c.case_id}
                  className="rounded-sm border border-rule px-3 py-1.5 font-mono text-[0.72rem] uppercase tracking-[0.14em] hover:border-accent disabled:opacity-50"
                >
                  {loadingId === c.case_id ? 'Loading…' : selected === c.case_id ? 'Selected' : 'Use'}
                </button>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
      <Caption label="TABLE 1">Synthetic sample cases. Each is a generated measurement pattern, not a person.</Caption>
    </figure>
  )
}
