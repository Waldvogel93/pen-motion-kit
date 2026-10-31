// Стиль «Кинетика»: ведёт типографика. Элементы экрана выезжают из-под масок, полоса выделения
// прочерчивает фразу-акцент, цифры статистики прокручиваются, как одометр.
// Роли:
// - screen-enter — маска: содержимое поднимается из-под нижнего края (y 110% → 0, clip-path), 520 мс, ease.enter;
//   каскад 90 мс у первых восьми элементов, дальше по 30 мс;
// - number — одометр: колонка цифр делает круг и встаёт на цифру, 900 мс, ease.enter, колонки через 90 мс;
// - ambient — полоса выделения под «Headline Accent», 900 мс на оба куска фразы;
// - button — при наведении подпись перекатывается вверх (180 мс), нажатие 0.97; загрузка — тем же
//   перекатыванием на место подписи въезжает спиннер с «Отправляем…»;
// - nav-link — линия рисуется слева направо и уходит вправо (180 мс);
// - card — плитка иконки темнеет, иконка поднимается на 2 px;
// - screen-transition — уходящий экран уезжает вверх на 32 px и гаснет (220 мс), новый входит масками;
// - input — при фокусе под полем прочерчивается линия (180 мс), ошибка — линия красная;
// - otp — одометр: цифра въезжает в ячейку снизу (260 мс), стёртая уезжает вниз; ошибка — цифры ныряют
//   на пол-ячейки и возвращаются красными, строка встряхивается (320 мс); успех — цифры по очереди
//   уезжают вверх, на их месте встаёт «Готово», рамка зелёная.
// Reduced: появление мгновенное (движок), числа сразу конечные, полоса сразу на месте, подписи не катятся,
// линия меню, линия поля и плитка меняются без движения, экран сменяется сразу, у кода — только цвет и текст.
import { animate, AnimatePresence, motion, useInView, useMotionValue, useTransform, type Variants } from 'motion/react'
import {
  cloneElement,
  Fragment,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { EnterProvider } from '../../enter'
import { useMotionRuntime } from '../../runtime'
import { MotionSlot } from '../../slot'
import { sec } from '../../tokens'
import type { CubicBezier, MotionStyle, MotionTokens, RoleProps } from '../../types'
import tokensJson from './tokens.json'
import './style.css'

const tokens = tokensJson as MotionTokens

type WithChildren = { children?: ReactNode }
type AnyProps = Record<string, unknown>

/** Кривая токена для CSS и Web Animations. */
function cssEase(c: CubicBezier): string {
  return `cubic-bezier(${c.join(', ')})`
}

/* ── Появление: маска ───────────────────────────────────────────────────────────────────────────── */

// Первые восемь элементов (первый экран) идут через stagger, остальные плотнее — вся последовательность ≈ 1,3 с.
const HERO_ITEMS = 8
const TAIL_STEP = 0.03

function cascade(i: number): number {
  const step = sec(tokens.stagger)
  return i < HERO_ITEMS ? i * step : (HERO_ITEMS - 1) * step + (i - HERO_ITEMS + 1) * TAIL_STEP
}

const screenVariants: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: (i: number) => cascade(i) } },
}

// Окно маски стоит на месте: нижний край обрезки = сдвиг − 8% (запас под нижние выносные знаки).
// При y 110% верхний край элемента на 2% ниже окна, при y 0 видно всё. Обе величины идут по одной
// кривой, поэтому окно не двигается. opacity 0 → 1 скачком в момент старта элемента: пока элемент
// ждёт своей очереди, сглаживание края обрезки не рисует волосяную линию.
const itemVariants: Variants = {
  hidden: { y: '110%', clipPath: 'inset(-20% -10% 102% -10%)', opacity: 0 },
  visible: {
    y: '0%',
    clipPath: 'inset(-20% -10% -8% -10%)',
    opacity: 1,
    transition: { duration: sec(tokens.duration.base), ease: tokens.ease.enter, opacity: { duration: 0 } },
    transitionEnd: { clipPath: 'none' },
  },
}

function ScreenEnter({ children, className }: RoleProps) {
  return (
    <EnterProvider itemVariants={itemVariants}>
      <MotionSlot className={className} variants={screenVariants} initial="hidden" animate="visible">
        {children}
      </MotionSlot>
    </EnterProvider>
  )
}

/* ── Кнопка: подпись перекатывается ─────────────────────────────────────────────────────────────── */

/** Строка загрузки под подписью: `on` — кнопка грузится, `caption` — текст рядом со спиннером. */
type Busy = { on: boolean; caption: string }

const BUSY_CAPTION = 'Отправляем…'

/** Спиннер — путь `loader-circle` из lucide (ISC); вращение в style.css. */
function Spinner() {
  return (
    <svg data-kinetic-spinner="" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

/**
 * Текст подписи — два экземпляра в окне: при наведении первый уходит вверх, второй встаёт на его место (style.css).
 * С загрузкой — третья строка (спиннер и подпись): при `busy.on` все строки уходят вверх, и она встаёт в окно.
 */
function RollLabel({ text, busy }: { text: string; busy?: Busy }) {
  return (
    <span data-kinetic-roll="" data-busy={busy?.on ? '' : undefined}>
      <span>{text}</span>
      <span aria-hidden>{text}</span>
      {busy && (
        <span data-kinetic-roll-busy="" aria-hidden={!busy.on}>
          <Spinner />
          {busy.caption}
        </span>
      )}
    </span>
  )
}

/** Находит текст подписи внутри кнопки (и внутри `asChild`) и оборачивает его; одиночный ребёнок остаётся одиночным. */
function rollLabel(node: ReactNode, busy?: Busy): ReactNode {
  if (typeof node === 'string') return node.trim() === '' ? node : <RollLabel text={node} busy={busy} />
  if (Array.isArray(node)) return node.map((child, i) => <Fragment key={i}>{rollLabel(child, busy)}</Fragment>)
  if (isValidElement<WithChildren>(node) && node.props.children !== undefined) {
    return cloneElement(node, undefined, rollLabel(node.props.children, busy))
  }
  return node
}

/** `state="loading"` — загрузка; подпись загрузки — `value` обёртки (строка), иначе «Отправляем…». */
function Button({ children, className, state, value }: RoleProps) {
  const { reduced } = useMotionRuntime()
  const loading = state === 'loading'
  // Строка загрузки появляется с первой загрузкой и дальше остаётся: возврат в idle — обратное перекатывание.
  const [armed, setArmed] = useState(loading)
  if (loading && !armed) setArmed(true)
  const busy = armed ? { on: loading, caption: typeof value === 'string' ? value : BUSY_CAPTION } : undefined
  return (
    <MotionSlot
      className={className}
      whileTap={reduced ? { opacity: 0.85 } : { scale: 0.97 }}
      transition={{ duration: sec(tokens.duration.fast), ease: tokens.ease.enter }}
    >
      {reduced && !armed ? children : rollLabel(children, busy)}
    </MotionSlot>
  )
}

/* ── Меню и карточки: CSS по меткам ─────────────────────────────────────────────────────────────── */

function NavLink({ children, className }: RoleProps) {
  return (
    <MotionSlot className={className} data-kinetic-nav="">
      {children}
    </MotionSlot>
  )
}

function Card({ children, className }: RoleProps) {
  return (
    <MotionSlot className={className} data-kinetic-card="">
      {children}
    </MotionSlot>
  )
}

/* ── Числа: одометр ─────────────────────────────────────────────────────────────────────────────── */

// Прокрутка начинается через 700 мс после появления экрана — вместе с подъёмом строки статистики,
// чтобы нули не стояли на виду; если число ниже края окна — когда оно показалось.
const ROLL_START_MS = 700

/** Колонка: лента 0…(10 + цифра) едет вверх на круг и встаёт на цифру. Ширину задаёт сама цифра — как в тексте. */
function DigitColumn({ digit, order, run, onDone }: { digit: number; order: number; run: boolean; onDone(): void }) {
  const steps = 10 + digit
  const progress = useMotionValue(0)
  const transform = useTransform(progress, (v) => `translateY(${(-v / (steps + 1)) * 100}%)`)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  useEffect(() => {
    if (!run) return
    const controls = animate(progress, steps, {
      duration: sec(tokens.duration.slow),
      ease: tokens.ease.enter,
      delay: order * sec(tokens.stagger),
    })
    controls.then(() => done.current())
    return () => controls.stop()
  }, [run, progress, steps, order])
  return (
    <span data-kinetic-digit="" aria-hidden>
      <span data-kinetic-digit-sizer="">{digit}</span>
      <motion.span data-kinetic-digit-strip="" style={{ transform }}>
        {Array.from({ length: steps + 1 }, (_, i) => (
          <span key={i}>{i % 10}</span>
        ))}
      </motion.span>
    </span>
  )
}

function Odometer({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const [mountedAt] = useState(() => performance.now())
  const [run, setRun] = useState(false)
  const [settled, setSettled] = useState(0)
  useEffect(() => {
    if (!inView) return
    const wait = Math.max(0, ROLL_START_MS - (performance.now() - mountedAt))
    const timer = window.setTimeout(() => setRun(true), wait)
    return () => window.clearTimeout(timer)
  }, [inView, mountedAt])
  const digits = [...text]
  return (
    <span ref={ref} data-kinetic-odometer="" data-settled={settled >= digits.length ? '' : undefined}>
      <span className="sr-only">{text}</span>
      {digits.map((d, i) => (
        <DigitColumn key={i} digit={Number(d)} order={i} run={run} onDone={() => setSettled((n) => n + 1)} />
      ))}
    </span>
  )
}

/** `R.Number value` вокруг одного элемента с цифрами: цифры заменяются колонками одометра. */
function NumberRoll({ children, value }: RoleProps) {
  const { reduced } = useMotionRuntime()
  const text = value === undefined ? '' : String(value)
  if (reduced || !/^\d+$/.test(text) || !isValidElement<WithChildren>(children)) return <>{children}</>
  return cloneElement(children, undefined, <Odometer text={text} />)
}

/* ── Фон: полоса выделения под акцентом ─────────────────────────────────────────────────────────── */

const ACCENT = 'Headline Accent'
// Старт — когда встала вторая строка заголовка (каскад 270 мс + 520 мс). Полоса проходит оба куска фразы
// за duration.slow: «под» в конце первой строки — ровно, «контролем» в начале второй — с замедлением.
const ACCENT_START = 0.8
const ACCENT_FIRST = 0.24
const ACCENT_PIECES = [
  { delay: ACCENT_START, duration: ACCENT_FIRST, ease: 'linear' as const },
  { delay: ACCENT_START + ACCENT_FIRST, duration: sec(tokens.duration.slow) - ACCENT_FIRST, ease: tokens.ease.enter },
]

/** Роль ambient различает места по имени слоя: у «Кинетики» фон есть только у акцента заголовка. */
function Ambient({ children, element, index }: RoleProps) {
  const { reduced } = useMotionRuntime()
  if (element !== ACCENT || !isValidElement<WithChildren>(children)) return <>{children}</>
  const piece = ACCENT_PIECES[Math.min(index ?? 0, ACCENT_PIECES.length - 1)]
  return cloneElement(
    children as ReactElement<AnyProps>,
    { 'data-kinetic-accent': '' },
    <>
      {children.props.children}
      <motion.span
        aria-hidden
        data-kinetic-mark=""
        style={{ originX: 0 }}
        initial={reduced ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={piece}
      />
    </>,
  )
}

/* ── Переход между экранами: строка перелистывается ─────────────────────────────────────────────── */

// Своё значение, не токен: уход короче входа (screen-enter 520 мс), как требует правило выхода.
const LEAVE_MS = 220
const LEAVE = { y: -32, opacity: 0, transition: { duration: sec(LEAVE_MS), ease: tokens.ease.exit } }

/**
 * Уходящий экран целиком уезжает вверх и гаснет; новый монтируется после и входит своим screen-enter.
 * Без `initial={false}`: AnimatePresence передал бы его через контекст всем motion-компонентам первого
 * экрана, и появление при загрузке страницы (и любое появление внутри экрана позже) не играло бы.
 */
function ScreenTransition({ children, value }: RoleProps) {
  const { reduced } = useMotionRuntime()
  return (
    <AnimatePresence mode="wait">
      <motion.div key={String(value)} exit={reduced ? undefined : LEAVE}>
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

/* ── Поле: линия фокуса ─────────────────────────────────────────────────────────────────────────── */

/**
 * Обёртка поля с линией под ним (у `<input>` нет ::after). Линия рисуется при фокусе, при ошибке — красная
 * (style.css). Обёртка — блочный div: поле внутри растягивается как раньше.
 */
function Input({ children, className, state }: RoleProps) {
  return (
    <div data-kinetic-input="" data-state={state ?? 'idle'} className={className}>
      {children}
      <span aria-hidden data-kinetic-input-line="" />
    </div>
  )
}

/* ── Код: одометр ───────────────────────────────────────────────────────────────────────────────── */

// Свои значения, не токены (по образцу interior-otp-input: появление 220 мс, тряска 320 мс).
// Появление цифры (260 мс) и уход вверх при успехе — в style.css.
const OTP_SHAKE_MS = 320
const OTP_SHAKE: Keyframe[] = ['0px', '-6px', '6px', '-3px', '0px'].map((x) => ({ transform: `translateX(${x})` }))
// Ошибка: цифра ныряет на пол-ячейки (span растянут на высоту ячейки), внизу краснеет и возвращается.
const OTP_DROP: Keyframe[] = [
  { transform: 'translateY(0)', color: 'var(--foreground)', easing: cssEase(tokens.ease.exit) },
  { transform: 'translateY(50%)', color: 'var(--foreground)', offset: 0.42 },
  { transform: 'translateY(50%)', color: 'var(--destructive)', offset: 0.46, easing: cssEase(tokens.ease.enter) },
  { transform: 'translateY(0)', color: 'var(--destructive)' },
]

function isEl(node: Node, slot: string): node is HTMLElement {
  return node instanceof HTMLElement && node.dataset.slot === slot
}

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/**
 * `R.Otp state` вокруг своего div с InputOTP. Метки на div — для style.css: появление цифры (символ кита
 * перемонтируется по key, см. input-otp.tsx), цвета ошибки и успеха, «Готово» поверх строки.
 * JS — то, чего CSS не может: копия стёртой цифры уезжает вниз, на ошибку — нырок и встряска.
 */
function Otp({ children, state }: RoleProps) {
  const { reduced } = useMotionRuntime()
  const ref = useRef<HTMLElement>(null)
  const last = useRef(state)

  // Стирание и замена: React уже убрал символ — его копия уезжает вниз (стёрли) или вверх (новая цифра снизу).
  useEffect(() => {
    const root = ref.current
    if (!root || reduced) return
    const observer = new MutationObserver((records) => {
      for (const { target: slot, removedNodes } of records) {
        if (!isEl(slot, 'input-otp-slot')) continue
        for (const node of removedNodes) {
          if (!isEl(node, 'input-otp-char')) continue
          const replaced = [...slot.children].some((c) => isEl(c, 'input-otp-char'))
          const ghost = node.cloneNode(true) as HTMLElement
          ghost.removeAttribute('data-slot')
          ghost.setAttribute('data-kinetic-otp-ghost', '')
          slot.append(ghost)
          // ease.move, а не ease.exit: на сильном ease-out цифра уходит под маску за первые ~15 мс,
          // и стирания не видно. Отступление записано в паспорте.
          const run = ghost.animate(
            [{ transform: 'translateY(0)' }, { transform: `translateY(${replaced ? -100 : 100}%)` }],
            { duration: tokens.duration.fast, easing: cssEase(tokens.ease.move), fill: 'forwards' },
          )
          run.onfinish = () => ghost.remove()
          run.oncancel = () => ghost.remove()
        }
      }
    })
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [reduced])

  // Ошибка — только на переходе в неё: все цифры ныряют разом, строка встряхивается один раз.
  useEffect(() => {
    const root = ref.current
    const was = last.current
    last.current = state
    if (!root || reduced || state !== 'error' || was === 'error') return
    const timing = { duration: OTP_SHAKE_MS, easing: 'linear' }
    const runs = [
      root.animate(OTP_SHAKE, { duration: OTP_SHAKE_MS, easing: cssEase(tokens.ease.enter) }),
      ...[...root.querySelectorAll('[data-slot="input-otp-char"]')].map((c) => c.animate(OTP_DROP, timing)),
    ]
    return () => runs.forEach((r) => r.cancel())
  }, [state, reduced])

  if (!isValidElement<WithChildren>(children)) return <>{children}</>
  const done =
    state === 'success' ? (
      <span data-kinetic-otp-done="" role="status">
        <span>
          <CheckMark />
          Готово
        </span>
      </span>
    ) : null
  return cloneElement(
    children as ReactElement<AnyProps>,
    { ref, 'data-kinetic-otp': '', 'data-otp-state': state ?? 'idle' },
    children.props.children,
    done,
  )
}

const style: MotionStyle = {
  id: 'kinetic',
  name: 'Кинетика',
  tagline: 'Типографика ведёт: строки выезжают из-под масок, цифры прокручиваются',
  tokens,
  restingChanges: [
    'Фраза «под контролем» в заголовке выделена светлой полосой',
    'Неверный код: цифры в ячейках красные (в рамке «Login / error» красные только рамка ячеек и текст ошибки)',
  ],
  references: [
    {
      title: 'Screenrove · motion-primitives-sliding-number (Motion-Primitives, MIT)',
      url: 'https://screenrove.com/motion/motion-primitives-sliding-number',
      kind: 'screenrove-motion',
    },
    {
      title: 'Screenrove · motion-primitives-sliding-number — демо',
      url: 'https://screenrove.com/motion/demos/motion-primitives-sliding-number.html',
      kind: 'screenrove-motion',
    },
    {
      title: 'Screenrove · interior-poll-results (interior.dev, MIT)',
      url: 'https://screenrove.com/motion/interior-poll-results',
      kind: 'screenrove-motion',
    },
    {
      title: 'Screenrove · interior-poll-results — демо',
      url: 'https://screenrove.com/motion/demos/interior-poll-results.html',
      kind: 'screenrove-motion',
    },
    {
      title: 'Screenrove · interior-otp-input (interior.dev, MIT)',
      url: 'https://screenrove.com/motion/interior-otp-input',
      kind: 'screenrove-motion',
    },
    {
      title: 'Screenrove · interior-otp-input — демо',
      url: 'https://screenrove.com/motion/demos/interior-otp-input.html',
      kind: 'screenrove-motion',
    },
  ],
  roles: {
    'screen-enter': ScreenEnter,
    'screen-transition': ScreenTransition,
    button: Button,
    'nav-link': NavLink,
    card: Card,
    input: Input,
    otp: Otp,
    number: NumberRoll,
    ambient: Ambient,
  },
}

export default style
