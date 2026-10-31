import { MotionConfig } from 'motion/react'
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { initialStyle, validateDecisions } from './decisions'
import { cssVars } from './tokens'
import type { MotionDecisions, MotionStyle } from './types'

export interface MotionRuntime {
  decisions: MotionDecisions
  styles: Record<string, MotionStyle>
  activeId: string
  /** Работает только пока стиль не выбран (decisions.style === null). */
  setActiveId(id: string): void
  replayKey: number
  replay(): void
  /** Принудительный режим ИЛИ системная настройка prefers-reduced-motion. */
  reduced: boolean
  reducedForced: boolean
  setReducedForced(v: boolean): void
  /** validateDecisions + сбои ролей, о которых сообщили через reportProblem. */
  problems: string[]
  /** Сообщить о проблеме во время работы (например, реализация роли упала); повтор не дублируется. */
  reportProblem(message: string): void
  registerElement(screen: string, el: string): void
  /** Элементы (`element` ролей), которые уже появлялись на каждом экране. */
  rendered: Map<string, Set<string>>
}

const RuntimeContext = createContext<MotionRuntime | null>(null)
const ScreenContext = createContext('')

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeSystemReduced(onChange: () => void): () => void {
  const query = window.matchMedia?.(REDUCED_QUERY)
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

function systemReduced(): boolean {
  return window.matchMedia?.(REDUCED_QUERY).matches ?? false
}

export function MotionRoot({ decisions, styles, children }: {
  decisions: MotionDecisions
  styles: Record<string, MotionStyle>
  children: ReactNode
}) {
  const [activeId, setChosenId] = useState(() => initialStyle(decisions, window.location.search))
  const [replayKey, setReplayKey] = useState(0)
  const [reducedForced, setReducedForced] = useState(false)
  const [rendered, setRendered] = useState(() => new Map<string, Set<string>>())
  const reduced = useSyncExternalStore(subscribeSystemReduced, systemReduced) || reducedForced

  const styleFixed = decisions.style !== null
  const setActiveId = useCallback((id: string) => {
    if (!styleFixed) setChosenId(id)
  }, [styleFixed])
  const replay = useCallback(() => setReplayKey((k) => k + 1), [])
  // Вызывается из эффектов ролей. Повторная регистрация возвращает прежний объект — React не перерисовывает.
  const registerElement = useCallback((screen: string, el: string) => {
    setRendered((prev) => (prev.get(screen)?.has(el) ? prev : new Map(prev).set(screen, new Set(prev.get(screen)).add(el))))
  }, [])
  const [reported, setReported] = useState<string[]>([])
  const reportProblem = useCallback((message: string) => {
    setReported((prev) => (prev.includes(message) ? prev : [...prev, message]))
  }, [])
  const problems = useMemo(() => [...validateDecisions(decisions, styles), ...reported], [decisions, styles, reported])

  const value = useMemo<MotionRuntime>(
    () => ({
      decisions, styles, activeId, setActiveId, replayKey, replay,
      reduced, reducedForced, setReducedForced, problems, reportProblem, registerElement, rendered,
    }),
    [decisions, styles, activeId, setActiveId, replayKey, replay, reduced, reducedForced, problems, reportProblem, registerElement, rendered],
  )

  // Неизвестный стиль: без переменных токенов, роли рендерят детей как есть, проблема — в problems.
  const active = Object.hasOwn(styles, activeId) ? styles[activeId] : undefined
  // Порталы (модальные окна, меню) рендерятся в body, вне корня: стиль, reduced и переменные дублируются на <html>.
  useLayoutEffect(() => {
    if (!active) return
    const html = document.documentElement
    const vars = Object.entries(cssVars(active.tokens))
    html.setAttribute('data-motion-style', activeId)
    if (reduced) html.setAttribute('data-motion-reduced', '')
    for (const [k, v] of vars) html.style.setProperty(k, v)
    return () => {
      html.removeAttribute('data-motion-style')
      html.removeAttribute('data-motion-reduced')
      for (const [k] of vars) html.style.removeProperty(k)
    }
  }, [active, activeId, reduced])
  return (
    <RuntimeContext value={value}>
      <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
        <div data-motion-style={activeId} data-motion-reduced={reduced ? '' : undefined} style={active ? (cssVars(active.tokens) as CSSProperties) : undefined}>
          {children}
        </div>
      </MotionConfig>
    </RuntimeContext>
  )
}

export function useMotionRuntime(): MotionRuntime {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new Error('useMotionRuntime() вызван вне <MotionRoot> — оберните приложение в MotionRoot')
  return runtime
}

export function ScreenProvider({ name, children }: { name: string; children: ReactNode }) {
  return <ScreenContext value={name}>{children}</ScreenContext>
}

/** Имя текущего экрана (id рамки pen.dev); вне ScreenProvider — ''. */
export function useScreenName(): string {
  return useContext(ScreenContext)
}
