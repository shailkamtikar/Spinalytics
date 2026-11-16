import type { MotionValue } from 'motion/react'
import { Component, lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ReferenceInfo } from '../../api/client'
import { SpineSchematic } from '../../components/spine/SpineSchematic'
import { Button, StatusBadge, type Status } from '../../components/ui'
import { buildSpineLayout } from './buildSpineLayout'
import type { ViewApi } from './SpineScene'
import { canUseWebGL } from './webgl'

// The 3D code (three.js) is a separate bundle, requested only when a figure needs it.
const SpineScene = lazy(() => import('./SpineScene'))

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function Legend() {
  const items: Status[] = ['within', 'review', 'large_deviation', 'missing']
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1" aria-label="Legend">
      {items.map((s) => (
        <li key={s}>
          <StatusBadge status={s} />
        </li>
      ))}
    </ul>
  )
}

interface Props {
  reference: ReferenceInfo | null
  statuses?: Record<string, Status>
  selected?: string | null
  onSelect?: (level: string | null) => void
  /** Landing hero: scroll-driven spread; no selection, no controls. */
  spreadValue?: MotionValue<number>
  /** Show Reset / Fit buttons and the legend. */
  controls?: boolean
  interactive?: boolean
  /** Force the 2D schematic (reduced motion on the landing page). */
  force2d?: boolean
  className?: string
}

/** Chooses between the 3D scene and the accessible 2D schematic, with a note when 3D is unavailable. */
export function SpineFigure({ reference, statuses, selected = null, onSelect, spreadValue, controls = false, interactive = true, force2d = false, className = '' }: Props) {
  const [webgl] = useState(canUseWebGL)
  const layout = useMemo(() => (reference ? buildSpineLayout(reference) : null), [reference])
  const api = useRef<ViewApi | null>(null)
  const schematic = (
    <SpineSchematic className="mx-auto h-full w-full" spreadValue={spreadValue} statuses={statuses} selected={selected} onSelect={onSelect ? (l) => onSelect(l) : undefined} />
  )
  const use3d = Boolean(layout) && webgl && !force2d
  return (
    <div className={`flex h-full flex-col ${className}`}>
      <div className="relative min-h-0 flex-1" data-figure={use3d ? '3d' : '2d'}>
        {use3d && layout ? (
          <Boundary fallback={schematic}>
            <Suspense fallback={<div className="grid h-full place-items-center font-mono text-sm text-muted" role="status">Loading 3D view…</div>}>
              <SpineScene layout={layout} statuses={statuses} selected={selected} onSelect={onSelect} spreadValue={spreadValue} interactive={interactive} orbit={interactive} apiRef={api} className="!absolute inset-0" />
            </Suspense>
          </Boundary>
        ) : (
          schematic
        )}
      </div>
      {controls && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Legend />
          {use3d && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => api.current?.reset()}>
                Reset view
              </Button>
              <Button variant="secondary" onClick={() => api.current?.fit()}>
                Fit to view
              </Button>
            </div>
          )}
        </div>
      )}
      {controls && !webgl && <p className="mt-2 text-sm text-muted">3D view is not available in this browser, so the 2D schematic is shown. The table has the same information.</p>}
    </div>
  )
}
