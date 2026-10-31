import { useState, type ReactNode } from 'react'
import { resolveUseSource } from '../decisions'
import { Guarded } from '../roles'
import { useMotionRuntime } from '../runtime'
import type { RoleId, RoleState } from '../types'

const STATE_LABELS: Record<RoleState, string> = {
  idle: 'Обычное',
  loading: 'Загрузка',
  success: 'Успех',
  error: 'Ошибка',
}

export interface VariantOption { label: string; use: string; note?: string }

function Cell({ index, role, element, option, states, children }: {
  index: number
  role: RoleId
  element: string
  option: VariantOption
  states?: RoleState[]
  children: ReactNode
}) {
  const { styles, reduced } = useMotionRuntime()
  const [run, setRun] = useState(0)
  const [state, setState] = useState<RoleState | undefined>(states?.[0])
  // Та же защита и то же правило reduced, что у R.*: упавший вариант не роняет доску, сбой уходит в панель
  const source = reduced && role === 'screen-enter' ? null : resolveUseSource(styles, option.use)
  return (
    <div data-testid="variant-cell" className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <div className="font-medium">{option.label}</div>
        {option.note && <div className="text-sm text-muted-foreground">{option.note}</div>}
      </div>
      {states && (
        <div className="flex flex-wrap gap-1.5">
          {states.map((st) => (
            <button
              key={st}
              type="button"
              data-testid={`variant-state-${index}-${st}`}
              aria-pressed={state === st}
              className="rounded-md border px-2 py-0.5 text-xs aria-pressed:bg-accent aria-pressed:font-medium"
              onClick={() => setState(st)}
            >
              {STATE_LABELS[st]}
            </button>
          ))}
        </div>
      )}
      {/* key: «Повторить» пересоздаёт только эту ячейку, и её анимация играет заново */}
      <div key={run}>{source ? <Guarded source={source} props={{ element, state, children }} /> : children}</div>
      <button type="button" className="self-start rounded-md border px-2.5 py-1 text-sm" onClick={() => setRun(run + 1)}>
        Повторить
      </button>
    </div>
  )
}

/** Доска вариантов: один и тот же элемент в каждой реализации из `use`, рядом, с повтором на ячейку. Экран `_variants/<имя>`. */
export function VariantsBoard({ title, role, element, options, states, children }: {
  title: string
  role: RoleId
  element: string
  options: VariantOption[]
  /** Кнопки состояний в каждой ячейке (например OTP: обычное, ошибка, успех); без них доска как раньше. */
  states?: RoleState[]
  children: ReactNode
}) {
  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">
        {title} <span className="text-base font-normal text-muted-foreground">роль {role}</span>
      </h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o, i) => <Cell key={o.label} index={i} role={role} element={element} option={o} states={states}>{children}</Cell>)}
      </div>
    </section>
  )
}
