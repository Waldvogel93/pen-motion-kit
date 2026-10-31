import { motion } from 'motion/react'
import { Component, useLayoutEffect, type ReactNode } from 'react'
import { resolveRoleSource, type RoleSource } from './decisions'
import { useEnterItemVariants } from './enter'
import { useMotionRuntime, useScreenName } from './runtime'
import type { RoleId, RoleProps } from './types'

interface BoundaryProps { fallback: ReactNode; onError(error: unknown): void; children: ReactNode }

/** Упавшая реализация роли не роняет экран: вместо неё — дети как есть. */
class RoleBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Реализация роли под защитой RoleBoundary; новый источник (другой стиль) — новая попытка. */
export function Guarded({ source, props }: { source: RoleSource; props: RoleProps }) {
  const { reportProblem } = useMotionRuntime()
  const { impl: Impl, styleId, roleKey } = source
  const onError = (error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error)
    reportProblem(`Роль "${roleKey}" стиля "${styleId}" упала: ${reason} — показан элемент без анимации`)
  }
  return (
    <RoleBoundary key={`${styleId}:${roleKey}`} fallback={props.children} onError={onError}>
      <Impl {...props} />
    </RoleBoundary>
  )
}

/** Ролевая обёртка: реализация из точечной правки или активного стиля, иначе — дети как есть. */
function makeRole(role: RoleId, name: string) {
  function Role(props: RoleProps) {
    const { decisions, styles, activeId, reduced, registerElement } = useMotionRuntime()
    const screen = useScreenName()
    const { element } = props
    // Регистрация после рендера и до отрисовки — панель не мигает предупреждением «элемент не найден».
    useLayoutEffect(() => {
      if (element !== undefined) registerElement(screen, element)
    }, [registerElement, screen, element])
    // При reduced появление мгновенное, что бы ни написал стиль: без EnterProvider R.Item — обычный div.
    const source = reduced && role === 'screen-enter'
      ? null
      : resolveRoleSource(decisions, styles, activeId, screen, element, role)
    return source ? <Guarded source={source} props={props} /> : <>{props.children}</>
  }
  Role.displayName = `R.${name}`
  return Role
}

/** Элемент каскада появления: варианты даёт реализация `screen-enter` через EnterProvider. */
function Item({ children, className }: Pick<RoleProps, 'children' | 'className'>) {
  const variants = useEnterItemVariants()
  if (!variants) return <div data-motion-item="" className={className}>{children}</div>
  return <motion.div data-motion-item="" className={className} variants={variants}>{children}</motion.div>
}

export const R = {
  Screen: makeRole('screen-enter', 'Screen'),
  Item,
  Button: makeRole('button', 'Button'),
  NavLink: makeRole('nav-link', 'NavLink'),
  Card: makeRole('card', 'Card'),
  Input: makeRole('input', 'Input'),
  Otp: makeRole('otp', 'Otp'),
  Toggle: makeRole('toggle', 'Toggle'),
  Overlay: makeRole('overlay', 'Overlay'),
  Toast: makeRole('toast', 'Toast'),
  Number: makeRole('number', 'Number'),
  List: makeRole('list', 'List'),
  Loading: makeRole('loading', 'Loading'),
  Ambient: makeRole('ambient', 'Ambient'),
}

/** Роль `screen-transition`: реализация получает id экрана в `value`. */
export function ScreenTransition({ screenId, children }: { screenId: string; children: ReactNode }) {
  const { decisions, styles, activeId } = useMotionRuntime()
  const source = resolveRoleSource(decisions, styles, activeId, screenId, undefined, 'screen-transition')
  return source ? <Guarded source={source} props={{ value: screenId, children }} /> : <>{children}</>
}
