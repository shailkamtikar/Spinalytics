import { useEffect, useRef, useState, type FormEvent } from 'react'
import { askResult, type AnalyzeResponse, type AskTurn } from '../../api/client'
import { ApiError, friendlyMessage } from '../../api/errors'
import { Button, Label, Panel } from '../../components/ui'

interface Message {
  role: 'user' | 'assistant'
  text: string
  aiGenerated?: boolean
  kind?: 'answer' | 'refusal' | 'rephrase' | 'error'
}

const MAX = 500

/** Questions the result itself suggests; none is sent until the user chooses or types one. */
export function suggestedQuestions(result: AnalyzeResponse): string[] {
  const top = result.statistical.flagged_levels[0]
  const out: string[] = []
  if (top) out.push(`Why is ${top.level} flagged?`)
  if (result.overall.state === 'indeterminate') out.push('Why is this result marked indeterminate?')
  out.push('What is the difference between percentage deviation and a z-score?')
  out.push('What information might help distinguish possible explanations?')
  return out.slice(0, 4)
}

interface Props {
  result: AnalyzeResponse
  onClose: () => void
}

/** Plain-text conversation, kept in memory only. Answers are rendered as text, never as HTML. */
export function AskPanel({ result, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [blockedUntil, setBlockedUntil] = useState(0)
  const input = useRef<HTMLTextAreaElement>(null)
  const submitting = useRef(false)

  useEffect(() => input.current?.focus(), [])

  const history = (): AskTurn[] => messages.filter((m) => m.kind === 'answer' || m.role === 'user').map((m) => ({ role: m.role, text: m.text }))

  const send = async (question: string) => {
    const q = question.trim()
    if (!q || busy || submitting.current) return
    if (Date.now() < blockedUntil) return
    submitting.current = true
    setBusy(true)
    setMessages((m) => [...m, { role: 'user', text: q }])
    setText('')
    try {
      const r = await askResult(q, history(), result)
      setMessages((m) => [...m, { role: 'assistant', text: r.answer, aiGenerated: r.ai_generated, kind: r.refused ? 'refusal' : r.needs_rephrase ? 'rephrase' : 'answer' }])
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('server', 'Unexpected error.')
      if (err.kind === 'rate_limited') setBlockedUntil(Date.now() + 60_000) // no automatic resend
      setMessages((m) => [...m, { role: 'assistant', text: err.kind === 'rate_limited' ? 'You have asked several questions in a short time. Please wait a minute before asking another.' : friendlyMessage(err), kind: 'error' }])
    } finally {
      setBusy(false)
      submitting.current = false
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void send(text)
  }

  return (
    <Panel aria-labelledby="ask-title" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label>Optional assistant</Label>
          <h2 id="ask-title" className="mt-1 text-2xl">Ask AI about this result</h2>
        </div>
        <button type="button" onClick={onClose} className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted hover:text-text">Close (Esc)</button>
      </div>
      <p className="mt-3 text-xs text-muted">
        Nothing is sent until you submit a question. A question sends your selected measurements and deviations (a few levels, no names or contact details, no person details) and your question to Google Gemini to produce a plain-language explanation. It cannot change any number in your result, and answers are educational, not a diagnosis.
      </p>

      {messages.length === 0 && (
        <div className="mt-4">
          <p className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted">Suggested questions</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {suggestedQuestions(result).map((q) => (
              <li key={q}>
                <button type="button" onClick={() => send(q)} disabled={busy} className="rounded-sm border border-rule px-3 py-1.5 text-left text-sm hover:border-accent disabled:opacity-50">{q}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 max-h-96 space-y-4 overflow-auto" role="log" aria-live="polite" aria-label="Conversation">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">{m.role === 'user' ? 'You' : m.aiGenerated ? 'AI-generated educational explanation' : 'Spinalytics'}</p>
            <p className={`mt-1 whitespace-pre-line text-sm ${m.kind === 'error' ? 'text-review' : ''}`}>{m.text}</p>
            {m.aiGenerated && <p className="mt-1 text-xs text-muted">Not a diagnosis. Sources: none supplied, so none are cited.</p>}
          </div>
        ))}
        {busy && <p role="status" className="font-mono text-sm text-muted">Thinking…</p>}
      </div>

      <form onSubmit={onSubmit} className="mt-4">
        <label htmlFor="ask-input" className="block font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted">Your question</label>
        <textarea
          id="ask-input"
          ref={input}
          value={text}
          maxLength={MAX}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          className="mt-1 w-full rounded-sm border border-rule bg-surface px-3 py-2"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-xs tabular-nums text-muted">{text.length} / {MAX}</span>
          <Button type="submit" disabled={busy || !text.trim()}>Ask</Button>
        </div>
      </form>
    </Panel>
  )
}
