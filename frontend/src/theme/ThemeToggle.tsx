import { useTheme } from './ThemeProvider'

/** A plain button labelled with the theme it switches to. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const target = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${target} theme`}
      className="rounded-sm border border-rule px-3 py-1.5 font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent hover:text-text"
    >
      {target}
      <span className="max-sm:hidden"> theme</span>
    </button>
  )
}
