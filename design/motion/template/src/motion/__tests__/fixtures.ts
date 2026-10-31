// Стили и решения для модульных тестов. Тесты берут стили только отсюда, а не из src/motion/styles:
// в копии шаблона внутри продукта стилей-фикстур нет, а тесты должны проходить.
import { createElement } from 'react'
import { EnterProvider } from '../enter'
import { MotionSlot } from '../slot'
import type { MotionDecisions, MotionStyle, MotionTokens, RoleImpl, RoleProps } from '../types'

export const fixtureTokens: MotionTokens = {
  duration: { fast: 150, base: 240, slow: 400 },
  ease: { enter: [0.23, 1, 0.32, 1], exit: [0.3, 0, 1, 1], move: [0.77, 0, 0.175, 1] },
  spring: { snappy: { stiffness: 500, damping: 32, mass: 1 }, soft: { stiffness: 220, damping: 26, mass: 1 } },
  stagger: 40,
  distance: 8,
  blur: 0,
}

/** Реализация-метка: оборачивает детей в div с data-impl, чтобы тест видел, какая реализация сработала. */
function impl(tag: string): RoleImpl {
  function Impl({ children }: RoleProps) {
    return createElement('div', { 'data-impl': tag }, children)
  }
  Impl.displayName = tag
  return Impl
}

function style(id: string, roles: MotionStyle['roles'], variants?: MotionStyle['variants']): MotionStyle {
  return { id, name: `Стиль ${id}`, tagline: '', tokens: fixtureTokens, restingChanges: [], references: [], roles, variants }
}

export const a = style('a', { otp: impl('a:otp') })
export const b = style('b', { otp: impl('b:otp') }, { 'otp/beam': impl('b:otp/beam') })
/** Стили с id, как у фикстур шаблона: панель и доска проверяются на них, не импортируя src/motion/styles. */
export const fixtureA = style('fixture-a', { otp: impl('fixture-a:otp') })
export const fixtureB = style('fixture-b', { otp: impl('fixture-b:otp') }, { 'otp/beam': impl('fixture-b:otp/beam') })

/** Реализация показывает полученное состояние в data-state. */
export const stated = style('stated', {
  otp: ({ children, state }: RoleProps) => createElement('div', { 'data-impl': 'stated:otp', 'data-state': state ?? '' }, children),
})

export const styleWithoutOtp = style('a', {})

function Boom(): never {
  throw new Error('бум')
}

/** Реализация кнопки падает при рендере. */
export const broken = style('broken', { button: Boom })

const fade = { hidden: { opacity: 0 }, visible: { opacity: 1 } }

/** Как настоящий стиль: Motion прямо на ребёнка через MotionSlot, появление с initial="hidden" без учёта reduced. */
export const slotted = style('slotted', {
  'screen-enter': ({ children }: RoleProps) =>
    createElement(EnterProvider, {
      itemVariants: fade,
      children: createElement(MotionSlot, { initial: 'hidden', animate: 'visible', children }),
    }),
  button: ({ children }: RoleProps) => createElement(MotionSlot, { whileTap: { scale: 0.97 }, children }),
})

export function d(partial: Partial<MotionDecisions> = {}): MotionDecisions {
  return { kit: 'shadcn', style: null, candidates: ['a'], overrides: [], ...partial }
}

export function withOverride(use: string): MotionDecisions {
  return d({ candidates: ['a', 'b'], overrides: [{ screen: 'Login', element: 'OTP', role: 'otp', use }] })
}

export const empty = d()
