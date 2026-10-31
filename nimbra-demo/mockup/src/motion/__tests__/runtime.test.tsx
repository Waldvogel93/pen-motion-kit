import { act, render, renderHook } from '@testing-library/react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { describe, expect, test, vi } from 'vitest'
import { EnterProvider } from '../enter'
import { R, ScreenTransition } from '../roles'
import { MotionRoot, ScreenProvider, useMotionRuntime, useScreenName } from '../runtime'
import type { MotionDecisions } from '../types'
import { a, b, broken, d, slotted, withOverride } from './fixtures'

function rootOf(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('[data-motion-style]')!
}

function hookIn(decisions: MotionDecisions) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MotionRoot decisions={decisions} styles={{ a, b }}>{children}</MotionRoot>
  )
  return renderHook(() => useMotionRuntime(), { wrapper })
}

describe('MotionRoot: reduced и documentElement', () => {
  const html = document.documentElement

  test('data-motion-reduced на корне следует за setReducedForced', () => {
    let set: (v: boolean) => void = () => {}
    function Probe() {
      set = useMotionRuntime().setReducedForced
      return null
    }
    const { container } = render(<MotionRoot decisions={d({ style: 'a' })} styles={{ a }}><Probe /></MotionRoot>)
    expect(rootOf(container)).not.toHaveAttribute('data-motion-reduced')
    act(() => set(true))
    expect(rootOf(container)).toHaveAttribute('data-motion-reduced')
    expect(html).toHaveAttribute('data-motion-reduced')
    act(() => set(false))
    expect(rootOf(container)).not.toHaveAttribute('data-motion-reduced')
    expect(html).not.toHaveAttribute('data-motion-reduced')
  })

  test('documentElement получает стиль и переменные, меняет их и очищается', () => {
    html.style.setProperty('--foreign', '1') // сбрасывается в test/setup.ts
    let setId: (id: string) => void = () => {}
    function Probe() {
      setId = useMotionRuntime().setActiveId
      return null
    }
    const fast = { ...b, tokens: { ...b.tokens, duration: { ...b.tokens.duration, base: 111 } } }
    const { unmount } = render(
      <MotionRoot decisions={d({ style: null, candidates: ['a', 'b'] })} styles={{ a, b: fast }}><Probe /></MotionRoot>,
    )
    expect(html).toHaveAttribute('data-motion-style', 'a')
    expect(html.style.getPropertyValue('--m-base')).toBe('240ms')
    act(() => setId('b'))
    expect(html).toHaveAttribute('data-motion-style', 'b')
    expect(html.style.getPropertyValue('--m-base')).toBe('111ms')
    unmount()
    expect(html).not.toHaveAttribute('data-motion-style')
    expect(html.style.getPropertyValue('--m-base')).toBe('')
    expect(html.style.getPropertyValue('--foreign')).toBe('1')
  })

  test('неизвестный стиль ничего не ставит на documentElement', () => {
    render(<MotionRoot decisions={d({ style: 'ghost' })} styles={{ a }}>x</MotionRoot>)
    expect(html).not.toHaveAttribute('data-motion-style')
  })

  test('элемент в портале в body находится внутри [data-motion-style]', () => {
    render(<MotionRoot decisions={d({ style: 'a' })} styles={{ a }}>{createPortal(<i data-testid="p" />, document.body)}</MotionRoot>)
    expect(document.querySelector('[data-testid="p"]')!.closest('[data-motion-style="a"]')).not.toBeNull()
  })
})

describe('MotionRoot', () => {
  test('корень получает data-motion-style и переменные токенов', () => {
    const { container } = render(<MotionRoot decisions={d({ style: 'a', candidates: ['a', 'b'] })} styles={{ a, b }}>x</MotionRoot>)
    expect(rootOf(container)).toHaveAttribute('data-motion-style', 'a')
    expect(rootOf(container).style.getPropertyValue('--m-base')).toBe('240ms')
  })

  test('при style: null активен первый кандидат', () => {
    const { result } = hookIn(d({ style: null, candidates: ['b', 'a'] }))
    expect(result.current.activeId).toBe('b')
  })

  test('неизвестный активный стиль — экран без анимации и проблема в списке', () => {
    let problems: string[] = []
    function Problems() {
      problems = useMotionRuntime().problems
      return null
    }
    const { container } = render(
      <MotionRoot decisions={d({ style: 'ghost' })} styles={{ a }}>
        <R.Otp>код</R.Otp>
        <Problems />
      </MotionRoot>,
    )
    expect(rootOf(container)).toHaveAttribute('data-motion-style', 'ghost')
    expect(rootOf(container).style.getPropertyValue('--m-base')).toBe('')
    expect(rootOf(container).innerHTML).toBe('код')
    expect(problems).toEqual(['Неизвестный стиль "ghost" в style'])
  })

  test('setActiveId меняет стиль только при style: null', () => {
    const free = hookIn(d({ style: null, candidates: ['a', 'b'] }))
    act(() => free.result.current.setActiveId('b'))
    expect(free.result.current.activeId).toBe('b')

    const fixed = hookIn(d({ style: 'a', candidates: ['a', 'b'] }))
    act(() => fixed.result.current.setActiveId('b'))
    expect(fixed.result.current.activeId).toBe('a')
  })

  test('setReducedForced(true) включает reduced', () => {
    const { result } = hookIn(d())
    expect(result.current.reduced).toBe(false)
    act(() => result.current.setReducedForced(true))
    expect(result.current.reducedForced).toBe(true)
    expect(result.current.reduced).toBe(true)
  })

  test('replay увеличивает replayKey', () => {
    const { result } = hookIn(d())
    act(() => result.current.replay())
    expect(result.current.replayKey).toBe(1)
  })

  test('useMotionRuntime вне MotionRoot — понятная ошибка', () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useMotionRuntime())).toThrow(/MotionRoot/)
    silence.mockRestore()
  })
})

describe('роли', () => {
  test('R.Button без реализации у активного стиля рендерит детей без обёрток', () => {
    const { container } = render(
      <MotionRoot decisions={d()} styles={{ a }}><R.Button><button>Ок</button></R.Button></MotionRoot>,
    )
    expect(rootOf(container).innerHTML).toBe('<button>Ок</button>')
  })

  test('точечная правка подменяет реализацию только у своего элемента', () => {
    const { container } = render(
      <MotionRoot decisions={withOverride('b:otp')} styles={{ a, b }}>
        <ScreenProvider name="Login">
          <R.Otp element="OTP">1</R.Otp>
          <R.Otp element="Other">2</R.Otp>
        </ScreenProvider>
      </MotionRoot>,
    )
    expect(container.querySelector('[data-impl="b:otp"]')).toHaveTextContent('1')
    expect(container.querySelector('[data-impl="a:otp"]')).toHaveTextContent('2')
  })

  test('роли регистрируют элементы экрана в rendered', () => {
    let rendered: Map<string, Set<string>> | undefined
    function Probe() {
      rendered = useMotionRuntime().rendered
      return null
    }
    render(
      <MotionRoot decisions={d()} styles={{ a }}>
        <ScreenProvider name="Login">
          <R.Input element="Email"><input /></R.Input>
          <R.Button element="Войти"><button>Войти</button></R.Button>
          <R.Card><div /></R.Card>
        </ScreenProvider>
        <Probe />
      </MotionRoot>,
    )
    expect([...rendered!.get('Login')!]).toEqual(['Email', 'Войти'])
  })

  test('ScreenProvider задаёт имя экрана', () => {
    const { result } = renderHook(() => useScreenName(), {
      wrapper: ({ children }) => <ScreenProvider name="Login">{children}</ScreenProvider>,
    })
    expect(result.current).toBe('Login')
  })

  test('ScreenTransition без реализации рендерит детей как есть', () => {
    const { container } = render(
      <MotionRoot decisions={d()} styles={{ a }}><ScreenTransition screenId="Home"><p>экран</p></ScreenTransition></MotionRoot>,
    )
    expect(rootOf(container).innerHTML).toBe('<p>экран</p>')
  })

  test('R.Item без контекста появления — обычный div с data-motion-item', () => {
    const { container } = render(<R.Item className="grid">текст</R.Item>)
    expect(container.innerHTML).toBe('<div data-motion-item="" class="grid">текст</div>')
  })

  test('R.Item в контексте появления берёт варианты стиля', () => {
    const variants = { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    const { container } = render(
      <EnterProvider itemVariants={variants}>
        <motion.div initial="hidden" animate="visible"><R.Item>текст</R.Item></motion.div>
      </EnterProvider>,
    )
    const item = container.querySelector<HTMLElement>('[data-motion-item]')!
    expect(item.style.opacity).toBe('0')
  })
})

describe('устойчивость ролей', () => {
  function withRuntime() {
    const probe: { runtime?: ReturnType<typeof useMotionRuntime> } = {}
    function Probe() {
      probe.runtime = useMotionRuntime()
      return null
    }
    return { probe, Probe }
  }

  test('упавшая реализация роли — дети показаны как есть, сбой в problems', () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { probe, Probe } = withRuntime()
    const { container } = render(
      <MotionRoot decisions={d({ candidates: ['broken'] })} styles={{ broken }}>
        <R.Button><button>Ок</button></R.Button>
        <Probe />
      </MotionRoot>,
    )
    silence.mockRestore()
    expect(rootOf(container).innerHTML).toBe('<button>Ок</button>')
    expect(probe.runtime!.problems).toEqual([
      'Роль "button" стиля "broken" упала: бум — показан элемент без анимации',
    ])
  })

  test('Slot-реализация: текст в R.Button и несколько детей в R.Screen не роняют экран', () => {
    const { probe, Probe } = withRuntime()
    const { container } = render(
      <MotionRoot decisions={d({ candidates: ['slotted'] })} styles={{ slotted }}>
        <R.Button>Ок</R.Button>
        <R.Screen>
          <R.Item>первый</R.Item>
          <R.Item>второй</R.Item>
        </R.Screen>
        <Probe />
      </MotionRoot>,
    )
    expect(rootOf(container)).toHaveTextContent('Окпервыйвторой')
    const items = container.querySelectorAll<HTMLElement>('[data-motion-item]')
    expect([...items].map((el) => el.style.opacity)).toEqual(['0', '0'])
    expect(probe.runtime!.problems).toEqual([])
  })

  test('Slot-реализация: единственный элемент получает Motion без обёртки', () => {
    const { container } = render(
      <MotionRoot decisions={d({ candidates: ['slotted'] })} styles={{ slotted }}>
        <R.Button><button>Ок</button></R.Button>
      </MotionRoot>,
    )
    expect(rootOf(container).children).toHaveLength(1)
    expect(rootOf(container).firstElementChild!.tagName).toBe('BUTTON')
  })

  test('reduced (принудительный): R.Screen не вызывает реализацию появления, элементы видны сразу', () => {
    const { probe, Probe } = withRuntime()
    const { container } = render(
      <MotionRoot decisions={d({ candidates: ['slotted'] })} styles={{ slotted }}>
        <R.Screen><main><R.Item>текст</R.Item></main></R.Screen>
        <Probe />
      </MotionRoot>,
    )
    expect(container.querySelector<HTMLElement>('[data-motion-item]')!.style.opacity).toBe('0')
    act(() => probe.runtime!.setReducedForced(true))
    expect(rootOf(container).innerHTML).toBe('<main><div data-motion-item="">текст</div></main>')
  })

  test('reduced (системный): появление мгновенное с первого рендера', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener() {},
      removeEventListener() {},
    }))
    const { probe, Probe } = withRuntime()
    const { container } = render(
      <MotionRoot decisions={d({ candidates: ['slotted'] })} styles={{ slotted }}>
        <R.Screen><main><R.Item>текст</R.Item></main></R.Screen>
        <Probe />
      </MotionRoot>,
    )
    vi.unstubAllGlobals()
    expect(probe.runtime!.reduced).toBe(true)
    expect(rootOf(container).innerHTML).toBe('<main><div data-motion-item="">текст</div></main>')
  })
})
