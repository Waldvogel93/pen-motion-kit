import type { CubicBezier, MotionTokens, SpringToken } from './types'

/** Токены хранятся в миллисекундах, Motion ждёт секунды. */
export function sec(ms: number): number {
  return ms / 1000
}

export function spring(t: SpringToken): { type: 'spring'; stiffness: number; damping: number; mass: number } {
  return { type: 'spring', stiffness: t.stiffness, damping: t.damping, mass: t.mass }
}

function bezier(c: CubicBezier): string {
  return `cubic-bezier(${c.join(', ')})`
}

/** CSS-переменные токенов для style.css стиля и CSS-переходов. */
export function cssVars(t: MotionTokens): Record<string, string> {
  return {
    '--m-fast': `${t.duration.fast}ms`,
    '--m-base': `${t.duration.base}ms`,
    '--m-slow': `${t.duration.slow}ms`,
    '--m-ease-enter': bezier(t.ease.enter),
    '--m-ease-exit': bezier(t.ease.exit),
    '--m-ease-move': bezier(t.ease.move),
    '--m-stagger': `${t.stagger}ms`,
    '--m-distance': `${t.distance}px`,
    '--m-blur': `${t.blur}px`,
  }
}
