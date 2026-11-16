/** True when the browser can create a WebGL context. Without it the 2D schematic is shown instead. */
export function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
