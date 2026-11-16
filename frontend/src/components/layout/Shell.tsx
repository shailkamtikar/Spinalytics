import { motion, useMotionValueEvent, useScroll } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ThemeToggle } from '../../theme/ThemeToggle'
import { useReducedMotionSafe } from '../../motion/useReducedMotionSafe'
import { BackToTop, EASE, Magnet, ScrollProgress } from '../fx'
import { ApiStatus } from '../feedback/Feedback'
import { ButtonLink, SyntheticBadge } from '../ui'

const NAV = [
  { to: '/about', label: 'Method' },
  { to: '/analyze', label: 'Analyse' },
]

export function TopBar() {
  const { scrollY } = useScroll()
  const reduced = useReducedMotionSafe()
  const [hidden, setHidden] = useState(false)
  // the bar slides away while reading down and comes back as soon as you scroll up
  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0
    setHidden(!reduced && y > prev && y > 160)
  })
  return (
    <motion.header
      className="sticky top-0 z-30 border-b border-rule bg-bg/95 backdrop-blur-[2px]"
      animate={{ y: hidden ? '-100%' : 0 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      <div className="mx-auto flex max-w-[1360px] items-center gap-4 px-6 py-3 lg:px-10">
        <div className="mr-auto flex items-baseline gap-3">
          <Link to="/" className="font-display text-2xl leading-none">
            Spinalytics
          </Link>
          <span className="max-sm:hidden">
            <SyntheticBadge />
          </span>
        </div>
        <nav aria-label="Primary" className="flex items-center gap-4 sm:gap-6">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `relative py-1 font-mono text-[0.75rem] uppercase tracking-[0.16em] ${isActive ? 'text-text' : 'text-muted hover:text-text'}`}>
              {({ isActive }) => (
                <>
                  {n.label}
                  {isActive && <motion.span layoutId="nav-underline" className="absolute inset-x-0 -bottom-px h-px bg-accent" transition={{ duration: 0.35, ease: EASE }} />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <ThemeToggle />
        <Magnet className="max-md:hidden">
          <ButtonLink to="/analyze">Start an analysis</ButtonLink>
        </Magnet>
      </div>
    </motion.header>
  )
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-rule">
      <div className="mx-auto grid max-w-[1360px] gap-6 px-6 py-8 lg:grid-cols-[2fr_1fr] lg:px-10">
        <p role="note" className="max-w-prose text-sm text-muted">
          Spinalytics is an educational and research prototype that runs on <strong className="font-medium text-text">synthetic data</strong>. It is not a medical device and does not diagnose, treat or advise. A qualified clinician must interpret any real measurement.
        </p>
        <div className="flex flex-wrap items-start gap-4 lg:justify-end">
          <nav aria-label="Footer" className="flex gap-4 font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="link-draw hover:text-text">
                {n.label}
              </Link>
            ))}
          </nav>
          <SyntheticBadge />
          <ApiStatus />
        </div>
      </div>
    </footer>
  )
}

export function Shell() {
  const { pathname } = useLocation()
  const reduced = useReducedMotionSafe()
  useEffect(() => {
    window.scrollTo?.(0, 0)
  }, [pathname])
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollProgress />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent">
        Skip to content
      </a>
      <TopBar />
      <main id="main" className="flex-1">
        {/* each page eases in; there is no exit animation so content is never held back */}
        <motion.div key={pathname} initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
          <Outlet />
        </motion.div>
      </main>
      <Footer />
      <BackToTop />
    </div>
  )
}
