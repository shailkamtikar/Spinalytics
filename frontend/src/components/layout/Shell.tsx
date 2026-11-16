import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { ThemeToggle } from '../../theme/ThemeToggle'
import { ApiStatus } from '../feedback/Feedback'
import { ButtonLink, SyntheticBadge } from '../ui'

const NAV = [
  { to: '/about', label: 'Method' },
  { to: '/analyze', label: 'Analyse' },
]

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-bg/95 backdrop-blur-[2px]">
      <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-6 py-3 lg:px-10">
        <Link to="/" className="mr-auto flex items-baseline gap-3" aria-label="Spinalytics home">
          <span className="font-display text-2xl leading-none">Spinalytics</span>
          <span className="max-sm:hidden">
            <SyntheticBadge />
          </span>
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 sm:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `font-mono text-[0.75rem] uppercase tracking-[0.16em] ${isActive ? 'text-text' : 'text-muted hover:text-text'}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <ThemeToggle />
        <ButtonLink to="/analyze" className="max-md:hidden">
          Start an analysis
        </ButtonLink>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-rule">
      <div className="mx-auto grid max-w-[1280px] gap-6 px-6 py-8 lg:grid-cols-[2fr_1fr] lg:px-10">
        <p role="note" className="max-w-prose text-sm text-muted">
          Spinalytics is an educational and research prototype that runs on <strong className="font-medium text-text">synthetic data</strong>. It is not a medical device and does not diagnose, treat or advise. A qualified clinician must interpret any real measurement.
        </p>
        <div className="flex flex-wrap items-start gap-4 lg:justify-end">
          <nav aria-label="Footer" className="flex gap-4 font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="hover:text-text">
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
  useEffect(() => {
    window.scrollTo?.(0, 0)
  }, [pathname])
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent">
        Skip to content
      </a>
      <TopBar />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
