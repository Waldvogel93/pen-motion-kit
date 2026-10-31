import type { ComponentType, ReactNode } from 'react'

export type RoleId = 'screen-enter' | 'screen-transition' | 'button' | 'nav-link' | 'card' | 'input'
  | 'otp' | 'toggle' | 'overlay' | 'toast' | 'number' | 'list' | 'loading' | 'ambient'

/** Те же роли списком, в том же порядке, что и role-ids.json (его читают скрипты). */
export const ROLE_IDS_FROM_TYPES = [
  'screen-enter', 'screen-transition', 'button', 'nav-link', 'card', 'input',
  'otp', 'toggle', 'overlay', 'toast', 'number', 'list', 'loading', 'ambient',
] as const satisfies readonly RoleId[]

export type CubicBezier = [number, number, number, number]

export interface SpringToken { stiffness: number; damping: number; mass: number }

export interface MotionTokens {
  duration: { fast: number; base: number; slow: number } // мс
  ease: { enter: CubicBezier; exit: CubicBezier; move: CubicBezier }
  spring: { snappy: SpringToken; soft: SpringToken }
  stagger: number // мс
  distance: number // px
  blur: number // px
}

export type RoleState = 'idle' | 'loading' | 'success' | 'error'

export interface RoleProps {
  /**
   * Обычно один элемент, который передаёт ref своему DOM-узлу (DOM-тег или компонент shadcn): реализация
   * может повесить Motion прямо на него (MotionSlot из ../slot). Текст и несколько детей допустимы —
   * реализация обязана их выдержать (MotionSlot оборачивает их в motion.div); упавшая реализация
   * заменяется детьми как есть, а сбой попадает в problems.
   */
  children?: ReactNode
  /** Имя слоя из pen.dev — по нему находятся точечные правки. */
  element?: string
  className?: string
  state?: RoleState
  value?: number | string
  index?: number
  active?: boolean
}

export type RoleImpl = ComponentType<RoleProps>

export interface StyleReference {
  title: string
  url: string
  kind: 'screenrove-motion' | 'screenrove-screen' | 'library' | 'site' | 'video'
}

export interface MotionStyle {
  id: string
  name: string
  tagline: string
  tokens: MotionTokens
  restingChanges: string[]
  references: StyleReference[]
  roles: Partial<Record<RoleId, RoleImpl>>
  variants?: Record<string, RoleImpl> // ключ "<roleId>/<variant>"
}

export interface Override { screen: string; element: string; role: RoleId; use: string; note?: string }

export interface MotionDecisions { kit: string; style: string | null; candidates: string[]; overrides: Override[] }
