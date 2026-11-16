import { useRef, type KeyboardEvent } from 'react'
import { StatusBadge, type Status } from '../../components/ui'
import { ALL_LEVELS_FOR_LIST } from './selectors'

interface Props {
  statuses: Record<string, Status>
  selected: string | null
  onSelect: (level: string | null) => void
}

/** A keyboard-reachable list of every level: arrow keys move the selection, Escape clears it. */
export function LevelList({ statuses, selected, onSelect }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const move = (from: string, step: number) => {
    const i = ALL_LEVELS_FOR_LIST.indexOf(from)
    const next = ALL_LEVELS_FOR_LIST[Math.min(ALL_LEVELS_FOR_LIST.length - 1, Math.max(0, i + step))]
    onSelect(next)
    refs.current[next]?.focus()
  }
  const onKey = (e: KeyboardEvent, level: string) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), move(level, 1))
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(level, -1))
    else if (e.key === 'Escape') onSelect(null)
  }
  return (
    <ul aria-label="Levels" className="max-h-64 overflow-auto border border-rule">
      {ALL_LEVELS_FOR_LIST.map((level) => {
        const status = statuses[level]
        return (
          <li key={level}>
            <button
              ref={(el) => {
                refs.current[level] = el
              }}
              type="button"
              aria-pressed={selected === level}
              data-level={level}
              onClick={() => onSelect(level)}
              onKeyDown={(e) => onKey(e, level)}
              className={`flex w-full items-center justify-between border-b border-rule px-3 py-1.5 text-left font-mono text-sm hover:bg-surface ${selected === level ? 'bg-surface text-text' : 'text-muted'}`}
            >
              <span>{level}</span>
              {status ? <StatusBadge status={status} /> : <span className="text-xs">not measured</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
