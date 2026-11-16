import { useReducedMotion } from 'motion/react'

/** True when the reader asked for less motion; every animation has a static path for this case. */
export function useReducedMotionSafe(): boolean {
  return useReducedMotion() ?? false
}
