import { useEffect, useState } from 'react'
import type { Status } from '../../components/ui'
import { useTheme } from '../../theme/ThemeProvider'

export const COLOR_VARS = { within: '--within', review: '--review', large_deviation: '--large', missing: '--missing', no_reference: '--missing', bone: '--bone', muted: '--muted', accent: '--accent' } as const
export type ColorKey = keyof typeof COLOR_VARS

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#808080'
}

export function readColors(): Record<ColorKey, string> {
  return Object.fromEntries((Object.keys(COLOR_VARS) as ColorKey[]).map((k) => [k, cssVar(COLOR_VARS[k])])) as Record<ColorKey, string>
}

/** Colours read from the CSS variables on mount and again whenever the theme changes. */
export function useThemeColors(): Record<ColorKey, string> {
  const { theme } = useTheme()
  const [colors, setColors] = useState(readColors)
  useEffect(() => {
    // wait one frame so the new data-theme attribute has been applied
    const id = requestAnimationFrame(() => setColors(readColors()))
    return () => cancelAnimationFrame(id)
  }, [theme])
  return colors
}

export function colorForLevel(colors: Record<ColorKey, string>, measured: boolean, status?: Status): string {
  if (!measured) return colors.muted
  return status ? colors[status] : colors.bone
}
