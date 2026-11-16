import { animate, motion, useInView, useMotionValue, useScroll, useSpring, type Variants } from 'motion/react'
import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { useReducedMotionSafe } from '../../motion/useReducedMotionSafe'

/** Shared easing: quick start, long soft landing. */
export const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Original implementations of familiar interaction patterns (word reveal, count-up, magnetic button,
 * cursor spotlight, marquee, stagger). Every one has a static path for `prefers-reduced-motion`.
 */

/** Headline whose words rise out of a mask one after another. `accent` words render in the italic accent style. */
export function RevealWords({ parts, className = '', delay = 0 }: { parts: { text: string; accent?: boolean }[]; className?: string; delay?: number }) {
  const reduced = useReducedMotionSafe()
  let i = 0
  const full = parts.map((p) => p.text).join(' ').replace(/ ([.,;:!?])/g, '$1')
  return (
    <span className={className}>
      {/* screen readers get the plain sentence; the animated words are decoration */}
      <span className="sr-only">{full}</span>
      <span aria-hidden="true">
      {parts.flatMap((p) =>
        p.text.split(' ').filter(Boolean).map((word) => {
          const idx = i++
          const glue = /^[.,;:!?]+$/.test(word) // punctuation hugs the word before it
          const inner = p.accent ? <em className="text-accent">{word}</em> : word
          const space = idx === 0 || glue ? null : ' '
          if (reduced) return <span key={idx}>{space}{inner}</span>
          return (
            <span key={idx}>
              {space}
              <span className="inline-block overflow-hidden pb-[0.12em] align-bottom">
                <motion.span className="inline-block" initial={{ y: '110%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.8, delay: delay + idx * 0.07, ease: EASE }}>
                  {inner}
                </motion.span>
              </span>
            </span>
          )
        }),
      )}
      </span>
    </span>
  )
}

/** Number that counts up the first time it scrolls into view. */
export function CountUp({ value, digits = 0, suffix = '', className = '' }: { value: number; digits?: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' })
  const reduced = useReducedMotionSafe()
  const [shown, setShown] = useState(reduced ? value : 0)
  useEffect(() => {
    if (reduced) return setShown(value)
    if (!inView) {
      // if visibility is never reported (some embeds, print), show the real number rather than 0
      const t = setTimeout(() => setShown(value), 2000)
      return () => clearTimeout(t)
    }
    const controls = animate(0, value, { duration: 1.1, ease: EASE, onUpdate: (v) => setShown(v) })
    return () => controls.stop()
  }, [inView, value, reduced])
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {shown.toFixed(digits)}
      {suffix}
    </span>
  )
}

/** Pulls its child a few pixels toward the pointer, then springs back. */
export function Magnet({ children, strength = 0.28, className = '' }: { children: ReactNode; strength?: number; className?: string }) {
  const reduced = useReducedMotionSafe()
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 })
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 })
  if (reduced) return <span className={`inline-block ${className}`}>{children}</span>
  return (
    <motion.span
      className={`inline-block ${className}`}
      style={{ x, y }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        x.set((e.clientX - (r.left + r.width / 2)) * strength)
        y.set((e.clientY - (r.top + r.height / 2)) * strength)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.span>
  )
}

/** Panel with a soft highlight that follows the cursor. */
export function SpotlightPanel({ children, className = '', ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      className={`spotlight relative rounded-sm border border-rule bg-surface p-5 ${className}`}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect()
        if (!r) return
        ref.current!.style.setProperty('--mx', `${e.clientX - r.left}px`)
        ref.current!.style.setProperty('--my', `${e.clientY - r.top}px`)
      }}
      {...rest}
    >
      {children}
    </div>
  )
}

/** Thin accent line at the top of the page that fills as you scroll. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.2 })
  const reduced = useReducedMotionSafe()
  if (reduced) return null
  return <motion.div aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-accent" style={{ scaleX }} />
}

const list: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const item: Variants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }

/** Children appear one after another when the list scrolls into view. */
export function Stagger({ children, className = '', as = 'div', style, 'aria-label': ariaLabel }: { children: ReactNode; className?: string; as?: 'div' | 'ul' | 'ol'; style?: CSSProperties; 'aria-label'?: string }) {
  const reduced = useReducedMotionSafe()
  const Tag = (motion as unknown as Record<string, typeof motion.div>)[as]
  if (reduced) {
    const Plain = as
    return <Plain className={className} style={style} aria-label={ariaLabel}>{children}</Plain>
  }
  return (
    <Tag className={className} style={style} aria-label={ariaLabel} role={ariaLabel ? 'group' : undefined} variants={list} initial="hidden" whileInView="show" viewport={{ once: true, margin: '0px 0px -8% 0px' }}>
      {children}
    </Tag>
  )
}

export function StaggerItem({ children, className = '', as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'li' }) {
  const reduced = useReducedMotionSafe()
  const Tag = (motion as unknown as Record<string, typeof motion.div>)[as]
  if (reduced) {
    const Plain = as
    return <Plain className={className}>{children}</Plain>
  }
  return <Tag className={className} variants={item}>{children}</Tag>
}

/** Endless slow ticker. Pauses on hover and focus; static when motion is reduced. */
export function Marquee({ items, className = '' }: { items: string[]; className?: string }) {
  const reduced = useReducedMotionSafe()
  const row = items.map((t) => (
    <span key={t} className="mx-5 inline-flex items-center gap-5 whitespace-nowrap font-mono text-[0.72rem] uppercase tracking-[0.16em] text-muted">
      {t}
      <span aria-hidden="true" className="text-accent">◦</span>
    </span>
  ))
  return (
    <div className={`marquee group relative overflow-hidden border-y border-rule py-3 ${className}`} role="presentation">
      <div className={`flex w-max ${reduced ? '' : 'marquee-track'}`} aria-hidden={!reduced}>
        <div className="flex shrink-0">{row}</div>
        {!reduced && <div className="flex shrink-0" aria-hidden="true">{row}</div>}
      </div>
    </div>
  )
}

/** Floating button that appears after a long scroll and glides back to the top. */
export function BackToTop() {
  const { scrollY } = useScroll()
  const reduced = useReducedMotionSafe()
  const [show, setShow] = useState(false)
  useEffect(() => scrollY.on('change', (y) => setShow(y > 900)), [scrollY])
  return (
    <motion.button
      type="button"
      aria-label="Back to top"
      tabIndex={show ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })}
      initial={false}
      animate={{ opacity: show ? 1 : 0, y: show ? 0 : 16, pointerEvents: show ? 'auto' : 'none' }}
      transition={{ duration: 0.3, ease: EASE }}
      whileHover={{ y: -3 }}
      className="fixed bottom-6 right-6 z-40 grid h-11 w-11 place-items-center rounded-sm border border-rule bg-surface font-mono text-lg text-muted hover:border-accent hover:text-text"
    >
      <span aria-hidden="true">↑</span>
    </motion.button>
  )
}
