import { fireEvent, render, screen } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { visibleScreens } from '@/app/router'
import { MotionPanel } from '../panel/MotionPanel'
import { VariantsBoard } from '../panel/VariantsBoard'
import { R } from '../roles'
import { MotionRoot, ScreenProvider, useMotionRuntime } from '../runtime'
import type { MotionDecisions, MotionStyle } from '../types'
import { broken, d, fixtureA, fixtureB, stated } from './fixtures'

const styles: Record<string, MotionStyle> = { 'fixture-a': fixtureA, 'fixture-b': fixtureB }
const both = ['fixture-a', 'fixture-b']

/** Как App: экран пересоздаётся по activeId:replayKey. */
function Screen({ mounts, children }: { mounts?: { count: number }; children?: ReactNode }) {
  const { activeId, replayKey } = useMotionRuntime()
  return <ScreenBody key={activeId + ':' + replayKey} mounts={mounts}>{children}</ScreenBody>
}

function ScreenBody({ mounts, children }: { mounts?: { count: number }; children: ReactNode }) {
  useEffect(() => {
    if (mounts) mounts.count += 1
  }, [mounts])
  return <>{children}</>
}

function setup(decisions: MotionDecisions, opts: { isProd?: boolean; name?: string; mounts?: { count: number }; children?: ReactNode } = {}) {
  return render(
    <MotionRoot decisions={decisions} styles={styles}>
      <ScreenProvider name={opts.name ?? 'Home'}>
        <MotionPanel isProd={opts.isProd ?? false} />
        <Screen mounts={opts.mounts}>{opts.children}</Screen>
      </ScreenProvider>
    </MotionRoot>,
  )
}

describe('MotionPanel', () => {
  test('при style: null есть переключатель кандидатов, клик меняет стиль', () => {
    const { container } = setup(d({ style: null, candidates: both }))
    expect(screen.getByTestId('style-option-fixture-a')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('style-option-fixture-b'))
    expect(container.querySelector('[data-motion-style]')).toHaveAttribute('data-motion-style', 'fixture-b')
  })

  test('при зафиксированном стиле в продакшене панели нет, в разработке она без переключателя', () => {
    const fixed = d({ style: 'fixture-b', candidates: both })
    const prod = setup(fixed, { isProd: true })
    expect(prod.container.querySelector('[data-motion-panel]')).toBeNull()
    prod.unmount()
    const dev = setup(fixed, { isProd: false })
    expect(dev.container.querySelector('[data-motion-panel]')).not.toBeNull()
    expect(screen.queryByTestId('style-option-fixture-a')).toBeNull()
  })

  test('показывает сведения об активном стиле', () => {
    const rich: MotionStyle = {
      ...fixtureA,
      tagline: 'Тихо и быстро',
      restingChanges: ['Тоньше обводка'],
      references: [{ title: 'Пример', url: 'https://example.com/x', kind: 'site' }],
    }
    render(
      <MotionRoot decisions={d({ style: 'fixture-a', candidates: ['fixture-a'] })} styles={{ 'fixture-a': rich }}>
        <MotionPanel isProd={false} />
      </MotionRoot>,
    )
    expect(screen.getByText('Тихо и быстро')).toBeInTheDocument()
    expect(screen.getByText('Тоньше обводка')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Пример' })
    expect(link).toHaveAttribute('href', 'https://example.com/x')
    expect(link).toHaveAttribute('target', '_blank')
  })

  test('без изменений вида в покое — пояснение', () => {
    setup(d({ style: null, candidates: both }))
    expect(screen.getByText('Вид в покое не меняется')).toBeInTheDocument()
  })

  test('«Проиграть появление» перемонтирует экран', () => {
    const mounts = { count: 0 }
    setup(d({ style: null, candidates: both }), { mounts })
    expect(mounts.count).toBe(1)
    fireEvent.click(screen.getByTestId('replay'))
    expect(mounts.count).toBe(2)
  })

  test('«Уменьшить движение» включает reduced', () => {
    let reduced = false
    function Probe() {
      reduced = useMotionRuntime().reduced
      return null
    }
    render(
      <MotionRoot decisions={d({ style: null, candidates: both })} styles={styles}>
        <MotionPanel isProd={false} />
        <Probe />
      </MotionRoot>,
    )
    expect(reduced).toBe(false)
    fireEvent.click(screen.getByTestId('reduced-toggle'))
    expect(reduced).toBe(true)
  })

  test('панель сворачивается и разворачивается', () => {
    setup(d({ style: null, candidates: both }))
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть панель' }))
    expect(screen.queryByTestId('replay')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть панель' }))
    expect(screen.getByTestId('replay')).toBeInTheDocument()
  })

  test('стиль из candidates, которого нет, — сообщение в списке проблем', () => {
    render(
      <MotionRoot decisions={d({ style: null, candidates: ['ghost'] })} styles={styles}>
        <MotionPanel isProd={false} />
      </MotionRoot>,
    )
    expect(screen.getByTestId('motion-problems')).toHaveTextContent('Неизвестный стиль "ghost" в candidates')
  })

  test('без проблем списка нет', () => {
    setup(d({ style: null, candidates: both }))
    expect(screen.queryByTestId('motion-problems')).toBeNull()
  })

  test('элемент из overrides, которого нет на экране, — предупреждение', () => {
    setup(
      d({ style: null, candidates: both, overrides: [{ screen: 'Login', element: 'OTP', role: 'otp', use: 'fixture-b:otp' }] }),
      { name: 'Login', children: <R.Input element="Email"><input /></R.Input> },
    )
    expect(screen.getByTestId('motion-problems')).toHaveTextContent(
      'Элемент "OTP" из overrides[0] не найден на экране "Login" — переименован в pen.dev?',
    )
  })

  test('элемент из overrides на экране — предупреждения нет', () => {
    setup(
      d({ style: null, candidates: both, overrides: [{ screen: 'Login', element: 'OTP', role: 'otp', use: 'fixture-b:otp' }] }),
      { name: 'Login', children: <R.Otp element="OTP">1</R.Otp> },
    )
    expect(screen.queryByTestId('motion-problems')).toBeNull()
  })
})

describe('VariantsBoard', () => {
  const options = [
    { label: 'Базовый', use: 'fixture-a:otp' },
    { label: 'Луч', use: 'fixture-b:otp/beam', note: 'с лучом' },
    { label: 'Второй', use: 'fixture-b:otp' },
  ]

  function board() {
    return render(
      <MotionRoot decisions={d({ style: null, candidates: both })} styles={styles}>
        <MotionPanel isProd={false} />
        <VariantsBoard title="Код" role="otp" element="OTP" options={options}>
          <span>код</span>
        </VariantsBoard>
      </MotionRoot>,
    )
  }

  test('три варианта — три ячейки с подписями и реализациями', () => {
    const { container } = board()
    for (const o of options) expect(screen.getByText(o.label)).toBeInTheDocument()
    expect(screen.getByText('с лучом')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-testid="variant-cell"]')).toHaveLength(3)
    expect(container.querySelector('[data-impl="fixture-a:otp"]')).toHaveTextContent('код')
    expect(container.querySelector('[data-impl="fixture-b:otp/beam"]')).toHaveTextContent('код')
  })

  test('«Повторить» перемонтирует только свою ячейку', () => {
    const { container } = board()
    const before = [...container.querySelectorAll('[data-impl]')]
    fireEvent.click(screen.getAllByRole('button', { name: 'Повторить' })[1])
    const after = [...container.querySelectorAll('[data-impl]')]
    expect(after[0]).toBe(before[0])
    expect(after[1]).not.toBe(before[1])
    expect(after[2]).toBe(before[2])
  })

  test('при reduced ячейки по-прежнему показаны', () => {
    const { container } = board()
    fireEvent.click(screen.getByTestId('reduced-toggle'))
    expect(container.querySelectorAll('[data-testid="variant-cell"]')).toHaveLength(3)
  })

  test('битая ссылка use — ячейка показывает содержимое как есть', () => {
    const { container } = render(
      <MotionRoot decisions={d({ style: null, candidates: both })} styles={styles}>
        <VariantsBoard title="Код" role="otp" element="OTP" options={[{ label: 'Битый', use: 'ghost:otp' }]}>
          <span>код</span>
        </VariantsBoard>
      </MotionRoot>,
    )
    expect(container.querySelector('[data-testid="variant-cell"]')).toHaveTextContent('код')
  })
})

describe('VariantsBoard: состояния', () => {
  const opts = [{ label: 'Один', use: 'stated:otp' }, { label: 'Два', use: 'stated:otp' }]

  function stateBoard(states?: Array<'idle' | 'loading' | 'success' | 'error'>) {
    return render(
      <MotionRoot decisions={d({ style: null, candidates: ['stated'] })} styles={{ stated }}>
        <VariantsBoard title="Код" role="otp" element="OTP" options={opts} states={states}>
          <span>код</span>
        </VariantsBoard>
      </MotionRoot>,
    )
  }

  test('по три кнопки на ячейку, первое состояние активно', () => {
    stateBoard(['idle', 'error', 'success'])
    for (const i of [0, 1]) {
      expect(screen.getByTestId(`variant-state-${i}-idle`)).toHaveTextContent('Обычное')
      expect(screen.getByTestId(`variant-state-${i}-error`)).toHaveTextContent('Ошибка')
      expect(screen.getByTestId(`variant-state-${i}-success`)).toHaveTextContent('Успех')
      expect(screen.queryByTestId(`variant-state-${i}-loading`)).toBeNull()
    }
    expect(screen.getByTestId('variant-state-0-idle')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('variant-state-0-error')).toHaveAttribute('aria-pressed', 'false')
  })

  test('клик «Ошибка» передаёт state в реализацию только своей ячейки, «Повторить» его сохраняет', () => {
    const { container } = stateBoard(['idle', 'error'])
    fireEvent.click(screen.getByTestId('variant-state-1-error'))
    const impls = () => [...container.querySelectorAll('[data-impl]')]
    expect(impls().map((e) => e.getAttribute('data-state'))).toEqual(['idle', 'error'])
    expect(screen.getByTestId('variant-state-1-error')).toHaveAttribute('aria-pressed', 'true')
    const before = impls()[1]
    fireEvent.click(screen.getAllByRole('button', { name: 'Повторить' })[1])
    expect(impls()[1]).not.toBe(before)
    expect(impls()[1]).toHaveAttribute('data-state', 'error')
  })

  test('без states кнопок состояний нет', () => {
    const { container } = stateBoard()
    expect(container.querySelector('[data-testid^="variant-state-"]')).toBeNull()
    expect(container.querySelector('[data-impl]')).toHaveAttribute('data-state', '')
  })
})

describe('VariantsBoard: упавший вариант', () => {
  test('ячейка показывает содержимое, сбой виден в панели', () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <MotionRoot decisions={d({ style: null, candidates: ['broken'] })} styles={{ broken }}>
        <MotionPanel isProd={false} />
        <VariantsBoard title="Кнопка" role="button" element="Go" options={[{ label: 'Упавший', use: 'broken:button' }]}>
          <button>Ок</button>
        </VariantsBoard>
      </MotionRoot>,
    )
    silence.mockRestore()
    expect(container.querySelector('[data-testid="variant-cell"]')).toHaveTextContent('Ок')
    expect(screen.getByTestId('motion-problems')).toHaveTextContent('Роль "button" стиля "broken" упала: бум')
  })
})

describe('visibleScreens', () => {
  const list = [
    { id: 'Home', title: 'Home', component: () => null },
    { id: '_variants/otp', title: 'otp', component: () => null },
  ]

  test('в итоговой сборке со стилем убирает экраны с _', () => {
    expect(visibleScreens(list, { isProd: true, styleFixed: true }).map((s) => s.id)).toEqual(['Home'])
  })

  test('иначе оставляет все', () => {
    expect(visibleScreens(list, { isProd: true, styleFixed: false })).toHaveLength(2)
    expect(visibleScreens(list, { isProd: false, styleFixed: true })).toHaveLength(2)
  })
})
