# Движок макета: роли, стили, решения

Код движка лежит в `<продукт>/mockup/src/motion/` (в шаблоне — `design/motion/template/src/motion/`). Здесь собрано то, что нужно знать, чтобы писать экраны и стили. Если что-то расходится с кодом, прав код: `types.ts`, `roles.tsx`, `decisions.ts`, `runtime.tsx`.

## Содержание
- Как это работает
- Роли и обёртки `R.*`
- Экран
- Соглашения по компонентам кита: таблица ролей, оверлеи, переключатели, OTP
- Стиль: `MotionStyle`
- Появление экрана: `EnterProvider` и `R.Item`
- Переход между экранами
- Reduced motion
- Токены
- `motion.json`
- Формат `use` и варианты
- Доска вариантов `VariantsBoard`
- Панель и проблемы

## Как это работает

- Экраны строятся из **ролевых обёрток** `R.*`. Анимация в компоненты не зашита.
- `MotionRoot` в `App.tsx` знает активный стиль.
- Обёртка ищет реализацию в таком порядке:
  1. точечная правка из `overrides`, если совпали экран, `element` и роль;
  2. роль активного стиля;
  3. ничего — тогда дети рендерятся как есть.
- Поэтому стиль переключается на лету, без перезагрузки. При смене стиля и по «Проиграть появление» экран пересоздаётся, и появление играет заново.
- Корневой `div` получает:
  - `data-motion-style="<активный id>"`;
  - `data-motion-reduced` — пока включено уменьшение движения;
  - CSS-переменные токенов `--m-*`.
- Те же атрибуты и переменные `MotionRoot` дублирует на `<html>`, если активный стиль известен. Поэтому селекторы `style.css` и переменные доходят и до порталов в `body`: модальных окон, меню, выпадающих списков.
- В своих e2e-проверках корень макета ищи как `body [data-motion-style]`: атрибут есть и на `<html>`.

## Роли и обёртки `R.*`

Импорт: `import { R } from '@/motion/roles'`.

| Роль (`RoleId`) | Обёртка | Где движение |
|---|---|---|
| `screen-enter` | `R.Screen` + `R.Item` | появление экрана и секций каскадом |
| `screen-transition` | `ScreenTransition` — уже стоит в `App.tsx` | переход между экранами |
| `button` | `R.Button` | наведение, нажатие, загрузка |
| `nav-link` | `R.NavLink` | меню и ссылки: наведение, активный пункт |
| `card` | `R.Card` | карточки: наведение |
| `input` | `R.Input` | поле: фокус, ошибка, успех |
| `otp` | `R.Otp` | ввод кода |
| `toggle` | `R.Toggle` | переключатели, чекбоксы, табы |
| `overlay` | `R.Overlay` | модальные окна, выпадающие меню, шторки |
| `toast` | `R.Toast` | уведомления |
| `number` | `R.Number` | числа и счётчики |
| `list` | `R.List` | списки: добавление и удаление |
| `loading` | `R.Loading` | загрузка и скелетоны |
| `ambient` | `R.Ambient` | фон и атмосфера — только там, где это уместно по паспорту |

Список можно расширять, когда в макете встречается место, которое не подходит ни под одну роль. Это правка движка: `types.ts`, `ROLE_IDS_FROM_TYPES` и `role-ids.json` (его читает `lint-style`), `R` в `roles.tsx`, заготовка паспорта. Делается в шаблоне с тестом.

Свойства обёртки (`RoleProps`) передаются реализации роли как есть:

| Свойство | Зачем |
|---|---|
| `children` | Обычно один элемент, который отдаёт `ref` своему DOM-узлу |
| `element` | Имя слоя из pen.dev. По нему находятся точечные правки |
| `className` | Класс для обёртки |
| `state` | `'idle' \| 'loading' \| 'success' \| 'error'` — для кнопки, поля, OTP |
| `value` | Число или строка, например значение счётчика |
| `index` | Номер в списке |
| `active` | Активный пункт, включённый переключатель |

**Как обёртка ложится на DOM.** Реализации пользуются `MotionSlot` из `slot.tsx`:
- **ребёнок — один React-элемент**: Motion-свойства ложатся прямо на него, без лишнего узла в DOM;
- **текст, несколько детей или фрагмент**: появляется обёртка `motion.div`, и она может сломать flex или grid родителя. Поэтому оборачивай один элемент;
- **ребёнок не передаёт `ref` своему DOM-узлу**: жесты (`whileTap`, `whileHover`) молча теряются. Оборачивай DOM-теги или компоненты кита, которые передают `ref`. Компоненты shadcn передают: в React 19 `ref` идёт обычным свойством и попадает в DOM через `...props`.

**Упавшая реализация** не роняет экран: вместо неё рендерятся дети как есть, а в панели появляется `Роль "<роль>" стиля "<id>" упала: <причина> — показан элемент без анимации`.

## Экран

```tsx
// src/screens/Home.tsx
import { Button } from '@/components/ui/button'
import { R } from '@/motion/roles'

export default function Home() {
  return (
    <R.Screen>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
        <R.Item>
          <h1 className="text-3xl font-semibold">Деньги команды под контролем</h1>
        </R.Item>
        <R.Item>
          <R.Button element="Войти">
            <Button asChild><a href="#/Login">Войти</a></Button>
          </R.Button>
        </R.Item>
      </main>
    </R.Screen>
  )
}
```

```ts
// src/screens/index.ts
import Home from './Home'
import type { ScreenDef } from './types'

export type { ScreenDef }

export const screens: ScreenDef[] = [{ id: 'Home', title: 'Главная', component: Home }]
```

- `id` экрана = имя рамки верхнего уровня в pen.dev. Маршрут — `#/<id>`. Неизвестный или пустой хэш открывает первый экран.
- `element` = имя слоя в pen.dev, буква в букву.
- Экраны с `_` в начале id (`_variants/otp`, черновики) в итоговой сборке с выбранным стилем не показываются, и `smoke` их не обходит.
- Живой пример — `design/motion/template/src/screens/Example.tsx`.

## Соглашения по компонентам кита

Чтобы роли одинаково работали на любом экране, компоненты кита оборачиваются одинаково. Компоненты в таблице — shadcn, для других китов — их аналоги.

| Компонент кита | Роль | Обёртка |
|---|---|---|
| Button | `button` | `R.Button` (`state="loading"` на время загрузки) |
| ссылка меню, пункт навигации | `nav-link` | `R.NavLink active={…}` |
| Card | `card` | `R.Card` |
| Input, Textarea, триггер Select | `input` | `R.Input state={…}` |
| InputOTP | `otp` | `R.Otp state={…}` вокруг своего `div` (ниже) |
| Switch, Checkbox, Radio, TabsTrigger | `toggle` | `R.Toggle active={…}` |
| Dialog, AlertDialog, Sheet, Popover, DropdownMenu, содержимое Select | `overlay` | `R.Overlay active={open}` вокруг Content |
| Toast, Sonner | `toast` | `R.Toast` |
| числа, счётчики | `number` | `R.Number value={…}` |
| списки с добавлением и удалением | `list` | `R.List` |
| Skeleton, Spinner | `loading` | `R.Loading` |

Label, Separator, TabsContent и прочая статика роли не получают. Их оборачивают только в `R.Item` ради каскада появления.

**`R.*` чужие свойства не пробрасывает.** Обёртка передаёт реализации только `RoleProps`, а без реализации рендерит одних детей. Поэтому `R.*` ставится **снаружи** `…Trigger asChild`: `<R.Button><DialogTrigger asChild><Button/></DialogTrigger></R.Button>`. Если поставить внутрь, `onClick`, `aria-*` и `ref` от Radix потеряются.

### Оверлеи

```tsx
const [open, setOpen] = useState(false)

<Dialog open={open} onOpenChange={setOpen}>
  <R.Button element="Удалить">
    <DialogTrigger asChild><Button variant="destructive">Удалить</Button></DialogTrigger>
  </R.Button>
  <R.Overlay element="Подтверждение" active={open}>
    <DialogContent>…</DialogContent>
  </R.Overlay>
</Dialog>
```

- Состояние открытия контролируемое (`useState`). `R.Overlay` получает его в `active` и оборачивает элемент Content. Сам Content рендерится в портале.
- Чтобы выход успел отыграть, у Content (Radix) нужен `forceMount`. Реализация роли в стиле держит детей в `AnimatePresence` по `active`:
  ```tsx
  function Overlay({ children, active }: RoleProps) {
    return (
      <AnimatePresence>
        {active && (
          <MotionSlot key="overlay" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: sec(tokens.duration.base), ease: tokens.ease.enter }}>
            {children}
          </MotionSlot>
        )}
      </AnimatePresence>
    )
  }
  ```
- `forceMount` и классы анимации кита зависят от активного стиля. Это решается в файле компонента (`src/components/ui/dialog.tsx` и т. п.):
  - **стиль задаёт `overlay`**: `forceMount`, классы `data-open:animate-in …` и `data-closed:animate-out …` сняты;
  - **не задаёт**: всё как было, двигается анимация кита. Без реализации `R.Overlay` отдаёт детей как есть, и Content с `forceMount` остался бы на экране закрытым.

  Условие и его снятие после фиксации — в [pen-to-react.md](pen-to-react.md), «Адаптер shadcn». У Radix `forceMount` типизирован как `true`, поэтому писать `forceMount={styled || undefined}`.
- Если выход всё равно обрывается, скорее всего портал Radix сам убирает детей при закрытии. Тогда `forceMount` нужен и `…Portal` внутри компонента.
- Селекторы `style.css` и `--m-*` до портала доходят через `<html>`.
- **Соглашение ещё не проверено на настоящем оверлее.** Первая проверка — при адаптере HeroUI. Что не сработало, поправить здесь.

### Переключатели

Состояние контролируемое (`useState`), `R.Toggle` оборачивает **один** элемент:

```tsx
const [on, setOn] = useState(false)
<R.Toggle element="Уведомления" active={on}>
  <Switch checked={on} onCheckedChange={setOn} />
</R.Toggle>

const [tab, setTab] = useState('general')
<Tabs value={tab} onValueChange={setTab}>
  <TabsList>
    <R.Toggle element="Общие" active={tab === 'general'}><TabsTrigger value="general">Общие</TabsTrigger></R.Toggle>
    <R.Toggle element="Безопасность" active={tab === 'security'}><TabsTrigger value="security">Безопасность</TabsTrigger></R.Toggle>
  </TabsList>
</Tabs>
```

То же для каждого `Checkbox` и `RadioGroupItem`.

### OTP

- **Роль оборачивает весь `InputOTP`, но через свой `div`.** У `InputOTP` `ref`, `className` и `style` уходят во внутренний невидимый `<input>` библиотеки `input-otp`. Motion прямо на `InputOTP` двигал бы невидимое поле.
  ```tsx
  const [code, setCode] = useState('')
  const state = code.length < 6 ? 'idle' : code === '204815' ? 'success' : 'error' // логика демо
  <R.Otp element="OTP" state={state}>
    <div>
      <InputOTP maxLength={6} value={code} onChange={setCode}>
        <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
      </InputOTP>
    </div>
  </R.Otp>
  ```
- **Ячейки** анимируются через `style.css` по data-атрибутам компонента кита. После `npx shadcn@latest add input-otp` посмотреть атрибуты в `src/components/ui/input-otp.tsx`. В shadcn 4.23 (`radix-nova`):
  - ячейка — `data-slot="input-otp-slot"`, активная ячейка — ещё и `data-active="true"`;
  - группа — `data-slot="input-otp-group"`;
  - курсор мигает анимацией кита `animate-caret-blink`.

  Пример селектора: `[data-motion-style="<id>"] [data-slot="input-otp-slot"][data-active="true"] { … }`.
- **Состояния** (тряска при ошибке, отметка успеха) — через Motion по `state`. Например, тряска строки: `animate={state === 'error' ? { x: [0, -5, 4, -3, 0] } : { x: 0 }}` за 320 мс (запись Screenrove `interior-otp-input`, MIT). Под reduced тряски нет: остаётся смена цвета рамки.
- **На доске** состояния показывают кнопки `states={['idle', 'error', 'success']}` (раздел «Доска вариантов»).
- **Поиск в Screenrove**: `search_motion` с `q: "otp"` и `category: "input,feedback"` (`feedback` — успех и ошибка).

## Стиль: `MotionStyle`

```ts
interface MotionStyle {
  id: string                 // = имя папки
  name: string               // в панели
  tagline: string            // характер одной строкой, в панели
  tokens: MotionTokens       // из tokens.json
  restingChanges: string[]   // изменения вида в покое, как в паспорте; [] — вид не меняется
  references: StyleReference[] // { title, url, kind } — ссылки в панели
  roles: Partial<Record<RoleId, RoleImpl>>
  variants?: Record<string, RoleImpl> // ключ "<роль>/<вариант>", например "otp/beam"
}
```

Параметры роли берутся из записи референса стиля (`record.md` снятого сайта или `get_motion` записи Screenrove), а не придумываются; роль без референса — [styles.md](styles.md), шаг 3.

Реализация роли — React-компонент, который получает `RoleProps`. Импорты внутри `styles/<id>/style.tsx`:

```tsx
import { stagger, type Variants } from 'motion/react'
import { EnterProvider } from '../../enter'
import { useMotionRuntime } from '../../runtime'
import { MotionSlot } from '../../slot'
import { sec, spring } from '../../tokens'
import type { MotionStyle, MotionTokens, RoleProps } from '../../types'
import tokensJson from './tokens.json'
import './style.css'

const tokens = tokensJson as MotionTokens

function Button({ children, className }: RoleProps) {
  const { reduced } = useMotionRuntime()
  return (
    <MotionSlot
      className={className}
      whileTap={reduced ? { opacity: 0.85 } : { scale: 0.97 }}
      transition={{ duration: sec(tokens.duration.fast), ease: tokens.ease.enter }}
    >
      {children}
    </MotionSlot>
  )
}
```

Полный рабочий пример с `screen-enter` и `button` — `design/motion/template/src/motion/styles/fixture-b/style.tsx` и рядом его `style.css`.

**Анимации кита и Motion.** У кнопки shadcn есть `transition-all` и `active:…:translate-y-px`. Если стиль двигает `transform` или `opacity` через Motion, переход кита не должен тянуть эти свойства, а сдвиг при нажатии не должен складываться с масштабом. Это решает `style.css` стиля (так сделано в `fixture-b`):

```css
[data-motion-style="<id>"] [data-slot="button"] {
  transition-property: color, background-color, border-color, outline-color, box-shadow;
}
[data-motion-style="<id>"] [data-slot="button"]:active { translate: none; }
```

Компоненты shadcn помечены `data-slot`, на него удобно вешать селекторы. Оверлеи рендерятся в портале в `body`, но селекторы с префиксом стиля до них доходят: атрибут `data-motion-style` стоит и на `<html>`.

**Рамка карточки shadcn.** Её рисует ring (box-shadow), поэтому правило `box-shadow: …` на `[data-slot="card"]` сотрёт рамку. Менять цвет рамки через `--tw-ring-color` (или `border-color`), тень задавать через `--tw-shadow`.

**Reduced в CSS**: `[data-motion-style="<id>"][data-motion-reduced] …` и `[data-motion-style="<id>"]:not([data-motion-reduced]) …`. Оба селектора начинаются с префикса стиля, `lint-style` их принимает.

**Ловушка.** `[data-motion-style="<id>"]` совпадает и с `<html>`. Правило на один этот атрибут, без селектора потомка, действует на всю страницу. Свойства ставить на потомков: `[data-motion-style="<id>"] [data-slot="card"] { … }`.

**Роль `ambient` и имена слоёв.** У стиля одна реализация на роль, а мест у фона может быть несколько (hero, карточка компании, акцент заголовка). Реализация `ambient` вправе ветвиться по `element` (имя слоя), чтобы оформить декоративные слои конкретного продукта. Тогда стиль привязан к этому продукту: так и пишется в «Когда подходит» паспорта. Стиль для переиспользования строят на общем поведении (один фон без привязки к именам слоёв), а ветки по `element` оставляют в `overrides` или в коде продукта.

**Перспектива и 3D.** `transformPerspective` в вариантах оставляет `perspective(…)` в transform после анимации, и слой остаётся 3D. Снимай его через `transitionEnd: { transformPerspective: 0 }`. Если используется `transformTemplate`, Motion передаёт ему пустую строку, а не `'none'`, когда поворотов нет: проверяй `''`, иначе в покое останется `matrix3d`.

**Маски `clip-path`.** Если край `clip-path` совпадает с краем элемента, сглаживание рисует волосяную линию. Её видно у элементов, которые ждут очереди в каскаде. Помогает `opacity` 0 → 1 скачком в момент старта элемента, а после анимации `transitionEnd: { clipPath: 'none' }`.

## Появление экрана: `EnterProvider` и `R.Item`

- Реализация `screen-enter` оборачивает детей `R.Screen` в motion-компонент с `initial`/`animate` и кладёт варианты элементов в `EnterProvider`:

  ```tsx
  const screenVariants: Variants = { hidden: {}, visible: { transition: { delayChildren: stagger(sec(tokens.stagger)) } } }
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: tokens.distance },
    visible: { opacity: 1, y: 0, transition: { duration: sec(tokens.duration.base), ease: tokens.ease.enter } },
  }
  function ScreenEnter({ children, className }: RoleProps) {
    return (
      <EnterProvider itemVariants={itemVariants}>
        <MotionSlot className={className} variants={screenVariants} initial="hidden" animate="visible">{children}</MotionSlot>
      </EnterProvider>
    )
  }
  ```
- `R.Item` — элемент каскада. Свойства у него только `children` и `className`, `element` нет. Он **всегда** добавляет свой `div` (`data-motion-item`): с вариантами это `motion.div`, без них — обычный `div`. В сетке и flex дай ему нужный класс раскладки (в `Example.tsx` карточки в сетке обёрнуты `<R.Item className="grid">`).
- Каскад держи в пределах правил: 30–50 мс на элемент, вся последовательность не дольше примерно 400 мс, только видимое. Это правило для микровзаимодействий интерфейса. Вводное движение лендинга или первого экрана может быть смелее и длиннее (например, 90 мс у первых элементов и больше суммарно), отступление записывается в паспорт ([styles.md](styles.md), «Правила набора»).
- **Декоративный слой внутри `R.Item`** играет вместе с ним так: `useEnterItemVariants()` (из `../../enter`) показывает, есть ли каскад. Motion-элемент с `variants` без `initial` и `animate` наследует метку и задержку `R.Item`. Без каскада (reduced) нужны `initial={false} animate="visible"`.
- **Ловушка задержки.** `transition.delay` в варианте ребёнка **заменяет** унаследованную задержку каскада (в `animateTarget` Motion: `{ delay, ...transition }`). Дополнительную задержку задавай через `delayChildren` у родителя.

## Переход между экранами

`ScreenTransition` уже стоит в `App.tsx` вокруг текущего экрана. Реализация роли `screen-transition` получает id экрана в `value`, а экран — в `children`. Чтобы старый экран успевал уйти, внутри реализации используют `AnimatePresence` с ключом по `value`. Навигация — обычные ссылки `href="#/<id>"`.

## Reduced motion

- `reduced` в `useMotionRuntime()` — это системная настройка `prefers-reduced-motion` **или** флажок «Уменьшить движение» в панели.
- При `reduced` движок сам:
  - пропускает реализацию `screen-enter` (и на экране, и на доске вариантов): контент виден сразу, `R.Item` становится обычным `div`;
  - ставит `MotionConfig reducedMotion="always"`. По документации Motion это отключает анимации transform и layout, а opacity и цвет продолжают анимироваться.
- **Остальные роли обязаны учитывать `reduced` сами**: смысл сохраняется, движение убирается. Остаётся растворение или мгновенная смена, без `y`, масштаба, тряски и размытия. Циклы и декор (`ambient`, лучи, конфетти) выключаются. Само изменение состояния всё равно происходит.
- В CSS reduced виден атрибутом `data-motion-reduced` на корне и на `<html>`. Он стоит и при системной настройке, и при флажке панели. Поэтому свои CSS-анимации в `style.css` гасить так: `[data-motion-style="<id>"][data-motion-reduced] … { animation: none; }`. Одного `@media (prefers-reduced-motion: reduce)` мало: флажок панели он не видит.
- Что делает каждая роль при reduced, записывается в раздел паспорта «Reduced motion».

## Токены

`tokens.json` (тип `MotionTokens`):

```json
{
  "duration": { "fast": 150, "base": 240, "slow": 400 },
  "ease": { "enter": [0.23, 1, 0.32, 1], "exit": [0.23, 1, 0.32, 1], "move": [0.77, 0, 0.175, 1] },
  "spring": { "snappy": { "stiffness": 700, "damping": 48, "mass": 1 }, "soft": { "stiffness": 300, "damping": 31, "mass": 1 } },
  "stagger": 40,
  "distance": 8,
  "blur": 0
}
```

- **Единицы**: `duration.*` и `stagger` — миллисекунды, `distance` и `blur` — пиксели. Кривые — четыре числа `cubic-bezier`.
- Motion ждёт секунды: `sec(ms)` из `tokens.ts`. Пружина: `spring(tokens.spring.snappy)` → `{ type: 'spring', stiffness, damping, mass }`.
- `cssVars(tokens)` даёт CSS-переменные на корне `[data-motion-style]`: `--m-fast`, `--m-base`, `--m-slow`, `--m-ease-enter`, `--m-ease-exit`, `--m-ease-move`, `--m-stagger`, `--m-distance`, `--m-blur`. Они доступны в `style.css`.
- Все поля обязательны, лишних быть не должно.

## `motion.json`

Лежит в `<продукт>/motion.json`. Макет читает его через псевдоним `@decisions` в `vite.config.ts`: файл `../motion.json`, а если его нет — фикстура шаблона.

```json
{
  "kit": "shadcn",
  "style": null,
  "candidates": ["calm", "spring", "glow"],
  "overrides": [
    { "screen": "Login", "element": "OTP", "role": "otp", "use": "glow:otp", "note": "луч вокруг активной ячейки" }
  ]
}
```

| Поле | Смысл |
|---|---|
| `kit` | Кит продукта, ключ из `ADAPTERS` |
| `style` | Выбранный стиль или `null`, пока идёт выбор |
| `candidates` | Кандидаты для переключателя. После фиксации — `[style]` |
| `overrides[]` | Точечные правки: экран (имя рамки), элемент (имя слоя), роль, реализация `use`, комментарий `note` |

- Какой стиль открывается: `?style=<id>` в адресе — только если id есть в `candidates`; иначе `style`; иначе первый кандидат; иначе ни один.
- Пока `style` равен `null`, в панели есть переключатель. В итоговой сборке с заданным `style` панели нет.
- Файл не той формы (нет поля, роль не из списка) — вместо макета видна красная надпись «Решения о движении не прочитаны, макет не запущен. …».
- Решения переживают пересборку экранов из pen.dev: экраны меняются, `motion.json` нет.

## Формат `use` и варианты

- `use` — `стиль:роль` или `стиль:роль/вариант`, например `glow:otp`, `calm:otp/beam`. Части — латиница, цифры, `_`, `-`.
- `стиль:роль` берёт `roles[роль]` стиля, `стиль:роль/вариант` — `variants['роль/вариант']`.
- Вариант — та же реализация роли, только в словаре `variants`:
  ```ts
  const style: MotionStyle = { /* … */ roles: { otp: OtpCalm }, variants: { 'otp/beam': OtpBeam, 'otp/wave': OtpWave } }
  ```
  Имя варианта — строчная латиница, цифры и дефис (так его принимает `lint-style` в строке паспорта `` `otp/beam` ``).
- Правка применяется, только если у обёртки на экране совпали `screen`, `element` и `role`.

## Доска вариантов `VariantsBoard`

Отдельный экран с id `_variants/<место>`. На нём один и тот же элемент показан в каждой реализации из `use`, рядом. У каждой ячейки — название, `note` и своя кнопка «Повторить». Это тот же формат, что в набросках `design/motion/sketches/*.html`; наброски — только образец формата.

```tsx
// src/screens/VariantsOtp.tsx
import { VariantsBoard } from '@/motion/panel/VariantsBoard'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

export default function VariantsOtp() {
  return (
    <VariantsBoard
      title="Ввод кода"
      role="otp"
      element="OTP"
      states={['idle', 'error', 'success']}
      options={[
        { label: 'A · Сдержанный', use: 'calm:otp', note: 'появление 220 мс из размытия 6 px; тряска 320 мс · Screenrove interior-otp-input, MIT' },
        { label: 'B · Пружинный', use: 'spring:otp', note: 'пружина stiffness 700, damping 30; волна 70 мс' },
        { label: 'C · Луч', use: 'calm:otp/beam', note: 'луч вокруг активной ячейки · Magic UI Border Beam, MIT' },
      ]}
    >
      <div>
        <InputOTP maxLength={6}>
          <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
        </InputOTP>
      </div>
    </VariantsBoard>
  )
}
```

Регистрация: `{ id: '_variants/otp', title: 'Варианты OTP', component: VariantsOtp }` в `src/screens/index.ts`. Ссылка: `http://localhost:5173/#/_variants/otp`.

- **`states?: RoleState[]`** — кнопки состояний в каждой ячейке: «Обычное», «Загрузка», «Успех», «Ошибка» (`idle`, `loading`, `success`, `error`).
  - Выбранное состояние уходит реализации как `state`. Сначала выбрано первое из списка.
  - «Повторить» пересоздаёт ячейку и выбранное состояние сохраняет.
  - Без `states` доска передаёт реализации только `element` и `children`.
- Детей доски оформлять так же, как на экране. Для OTP это свой `div` вокруг `InputOTP` (раздел «OTP»).
- `options[].label` должны быть разными: это ключ ячейки. `note` — характер, точные параметры и источник.
- Ячейка рендерит реализацию из `use` под той же защитой, что `R.*`: упавший вариант не роняет доску, сбой уходит в панель. При reduced правила те же.
- Доска нужна вместе с настоящим экраном, где стоит этот элемент: smoke не обходит экраны с `_` и требует хотя бы один обычный.
- После фиксации стиля экраны `_variants/*` в итоговую сборку не попадают.

## Панель и проблемы

`MotionPanel` (справа внизу, `data-motion-panel`) показывает:
- переключатель кандидатов — только пока `style` равен `null`;
- имя, характер, изменения вида и ссылки активного стиля — из `style.tsx`;
- «Проиграть появление» и «Уменьшить движение»;
- список проблем (`data-testid="motion-problems"`).

Проблемы, которые она показывает:

| Сообщение | Что значит |
|---|---|
| `Нет ни одного стиля: candidates пуст, а style не задан` | Новый продукт, кандидатов ещё нет |
| `Неизвестный стиль "<id>" в style` / `в candidates` | Опечатка или папки стиля нет в `mockup/src/motion/styles/` |
| `Неверная ссылка "<use>" в overrides[i]: ожидается "стиль:роль" или "стиль:роль/вариант"` | Битый `use` |
| `Неизвестный стиль "<id>" в overrides[i]` | Стиль-источник правки удалён или не скопирован |
| `Нет роли "<роль>" у стиля "<id>" (overrides[i])` | У стиля нет этой роли |
| `Нет варианта "<роль/вариант>" у стиля "<id>" (overrides[i])` | Нет такого ключа в `variants` |
| `Элемент "<имя>" из overrides[i] не найден на экране "<экран>" — переименован в pen.dev?` | Нет обёртки с таким `element` на этом экране |
| `Роль "<роль>" стиля "<id>" упала: …` | Реализация бросила ошибку, показан элемент без анимации |

`smoke.spec.ts` требует, чтобы на каждом экране в каждом кандидате список был пуст.
