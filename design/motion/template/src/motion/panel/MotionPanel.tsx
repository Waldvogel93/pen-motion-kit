import { useState } from 'react'
import { unknownOverrideElements } from '../decisions'
import { useMotionRuntime, useScreenName } from '../runtime'

const button = 'rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-900 hover:bg-neutral-100'

/**
 * Панель макета: переключатель стилей, сведения об активном стиле, повтор появления,
 * «Уменьшить движение» и список проблем. Для скриншотов и сравнения помечена data-motion-panel.
 * В итоговой сборке с выбранным стилем её нет.
 */
export function MotionPanel({ isProd = import.meta.env.PROD }: { isProd?: boolean }) {
  const runtime = useMotionRuntime()
  const screen = useScreenName()
  const [open, setOpen] = useState(true)
  const { decisions, styles, activeId } = runtime
  if (isProd && decisions.style !== null) return null

  const active = Object.hasOwn(styles, activeId) ? styles[activeId] : undefined
  const rendered = runtime.rendered.get(screen) ?? new Set<string>()
  const problems = [
    ...new Set([...runtime.problems, ...(screen ? unknownOverrideElements(decisions.overrides, screen, rendered) : [])]),
  ]

  return (
    <aside
      data-motion-panel=""
      className="fixed right-4 bottom-4 z-[2147483000] w-72 rounded-lg border border-neutral-300 bg-white p-3 text-xs text-neutral-900 shadow-lg"
      style={{ font: '12px/1.4 system-ui, sans-serif' }}
    >
      <div className="flex items-center justify-between gap-2">
        <strong>Движение макета</strong>
        <button
          type="button"
          className={button}
          aria-expanded={open}
          aria-label={open ? 'Свернуть панель' : 'Развернуть панель'}
          onClick={() => setOpen(!open)}
        >
          {open ? '−' : '+'}
        </button>
      </div>
      {open && (
        <div className="mt-2 flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
          {decisions.style === null && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Стиль движения">
              {decisions.candidates.map((id) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`style-option-${id}`}
                  aria-pressed={id === activeId}
                  className={`${button} ${id === activeId ? 'border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800' : ''}`}
                  onClick={() => runtime.setActiveId(id)}
                >
                  {styles[id]?.name ?? id}
                </button>
              ))}
            </div>
          )}
          {active && (
            <section className="flex flex-col gap-1">
              <div className="text-sm font-semibold">{active.name}</div>
              {active.tagline && <p>{active.tagline}</p>}
              {active.restingChanges.length > 0 ? (
                <ul className="list-disc pl-4">
                  {active.restingChanges.map((c) => <li key={c}>{c}</li>)}
                </ul>
              ) : (
                <p className="text-neutral-500">Вид в покое не меняется</p>
              )}
              {active.references.length > 0 && (
                <ul className="pl-0">
                  {active.references.map((r) => (
                    <li key={r.url}>
                      <a className="underline" href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <div className="flex items-center justify-between gap-2">
            <button type="button" className={button} data-testid="replay" onClick={runtime.replay}>
              Проиграть появление
            </button>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                data-testid="reduced-toggle"
                checked={runtime.reducedForced}
                onChange={(e) => runtime.setReducedForced(e.target.checked)}
              />
              Уменьшить движение
            </label>
          </div>
          {problems.length > 0 && (
            <ul data-testid="motion-problems" role="alert" className="list-disc rounded-md bg-red-50 p-2 pl-6 text-red-800">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </div>
      )}
    </aside>
  )
}
