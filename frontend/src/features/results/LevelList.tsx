import { useEffect, useRef, type KeyboardEvent } from 'react'
import { StatusBadge, type Status } from '../../components/ui'
import { ALL_LEVELS_FOR_LIST } from './selectors'

interface Props {
  statuses: Record<string, Status>
  selected: string | null
  onSelect: (level: string | null) => void
  /** Fill the height of the parent instead of a fixed box. */
  fill?: boolean
}

/** A keyboard-reachable list of every level: arrow keys move the selection, Escape clears it. */
export function LevelList({ statuses, selected, onSelect, fill = false }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const box = useRef<HTMLUListElement>(null)

  // keep the selected row in the middle of the list, scrolling only the list, never the page
  useEffect(() => {
    const row = selected ? refs.current[selected] : null
    const ul = box.current
    if (row && ul) ul.scrollTo?.({ top: row.offsetTop - ul.clientHeight / 2 + row.clientHeight / 2, behavior: 'smooth' })
  }, [selected])
  const move = (from: string, step: number) => {
    const i = ALL_LEVELS_FOR_LIST.indexOf(from)
    const next = ALL_LEVELS_FOR_LIST[Math.min(ALL_LEVELS_FOR_LIST.length - 1, Math.max(0, i + step))]
    onSelect(next)
    refs.current[next]?.focus({ preventScroll: true })
  }
  const onKey = (e: KeyboardEvent, level: string) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), move(level, 1))
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(level, -1))
    else if (e.key === 'Escape') onSelect(null)
  }
  return (
    <ul ref={box} aria-label="Levels" className={`scroll-fade-y overflow-y-auto relative rounded-sm border border-rule ${fill ? 'h-full max-h-full' : 'max-h-64'}`}>
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
              className={`flex w-full items-center justify-between border-b border-rule px-3 py-1.5 text-left font-mono text-sm transition-colors hover:bg-bg ${selected === level ? 'bg-bg text-text' : 'text-muted'}`}
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
