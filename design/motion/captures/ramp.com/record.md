# Движение: Spend Management, Corporate Cards & Accounts Payable Solutions | Ramp

https://ramp.com/ · снято 31.10.2026 · окно 1440×900

## Сигнатурные приёмы

- блок 1440×900: проявление (Наведение), 300 мс, easeInOutSine — `div.pointer-events-none.fixed:nth-of-type(1)`
- блок «Card & Expense Corporate Card…»: маска clip-path и проявление (Наведение), маска clip-path — 300 мс, easeInOutSine; проявление — 240 мс, easeInOutSine — `… > div.relative > div.relative.w-full`
- блок «Card & Expense Corporate Card…»: сдвиг на 8 px и проявление (Наведение), сдвиг на 8 px — 500 мс, Material standard; проявление — 250 мс, Material standard — `#radix…`
- блок «Card & Expense Corporate Card…»: размер (height) (Наведение (уход курсора)), 300 мс, easeInOutSine — `… > div.relative > div.relative.w-full`
- блок «We build software for»: затухание (Фокус), 500 мс, Material decelerate — `div.bf7S1a_borderTracer.w-full::before`

## По фазам

### Загрузка

| Элемент | Что движется | Откуда → куда | Длительность | Кривая / пружина | Задержка | Основа |
|---|---|---|---|---|---|---|
| блок 96×16 `div.flex:nth-of-type(1) > div.h-4:nth-of-type(1)` × 8 | opacity | opacity: 1 → 0.5 → 1 | 2000 мс, бесконечно | своя cubic-bezier(0.4, 0, 0.6, 1) | 0 мс | точно (CSS) |
| блок 768×165 `div.bf7S1a_borderTracer.w-full::before` | CSS-переменная --personalization-trace-angle | CSS-переменная --personalization-trace-angle: — → 360deg | 3400 мс, бесконечно | linear cubic-bezier(0, 0, 1, 1) | 0 мс | точно (CSS) |

- Фоновые петли (повторяются сами, не реакция; в токены не входят): CSS-переменная --_number-flow-d: 9 элементов, 900 мс, своя cubic-bezier(0.2, 0.2, 0.05, 1.1), повторов до 16; transform: 1 элемент, 6447 мс, linear, сдвиг на 127 px, идёт без конца (замер); CSS-переменная --_number-flow-dx, CSS-переменная --_number-flow-d-width: 1 элемент, 900 мс, своя cubic-bezier(0.2, 0.2, 0.05, 1.1), повторов до 117

ещё 144 не показано (не сохранено: потолок записей на фазу и фоновые повторы)

### Прокрутка

| Элемент | Что движется | Откуда → куда | Длительность | Кривая / пружина | Задержка | Основа |
|---|---|---|---|---|---|---|
| картинка 351×237 `g.png:nth-of-type(20)` | transform | transform: matrix(0, 0, 0, 0, 28.35, 476.3) → matrix(0.5, 0, 0, 0.5, -12.49, 472.34) | 331 мс | своя cubic-bezier(0.9, -0.1, 0.05, 1.1) | 0 мс | замер |
| картинка 369×88 `g.png:nth-of-type(24)` | transform | transform: matrix(0, 0, 0, 0, 889.48, 708.25) → matrix(0.6, 0, 0, 0.6, 651.39, 673.92) | 345 мс | своя cubic-bezier(0.7, 0.05, 0.2, 1) | 0 мс | замер |
| картинка 177×68 `g.png:nth-of-type(36)` | transform | transform: matrix(0, 0, 0, 0, 918.13, 494) → matrix(0.66, 0, 0, 0.66, 803.9, 468.27) | 250 мс | своя cubic-bezier(0.2, 0.2, 0, 1) | 0 мс | замер |
| картинка 142×45 `g.png:nth-of-type(35)` | transform | transform: matrix(0, 0, 0, 0, 1303.21, 130.19) → matrix(0.6, 0, 0, 0.6, 1210.8, 112.57) | 281 мс | своя cubic-bezier(0.8, 0.1, 0, 1.1) | 0 мс | замер |

- Фоновые петли (повторяются сами, не реакция; в токены не входят): CSS-переменная --_number-flow-d: 8 элементов, 900 мс, своя cubic-bezier(0.2, 0.2, 0.05, 1.1), повторов до 21; CSS-переменная --_number-flow-dx, CSS-переменная --_number-flow-d-width: 1 элемент, 900 мс, своя cubic-bezier(0.2, 0.2, 0.05, 1.1), повторов до 117

ещё 133 не показано (не сохранено: потолок записей на фазу и фоновые повторы)

### Наведение

| Элемент | Что движется | Откуда → куда | Длительность | Кривая / пружина | Задержка | Основа |
|---|---|---|---|---|---|---|
| блок 1440×900 `div.pointer-events-none.fixed:nth-of-type(1)` | opacity | opacity: 0 → 1 | 300 мс | easeInOutSine cubic-bezier(0.45, 0.05, 0.55, 0.95) | 0 мс | точно (CSS) |
| блок 1440×900 `div.pointer-events-none.fixed:nth-of-type(1)` | opacity (уход курсора) | opacity: 1 → 0 | 300 мс | easeInOutSine cubic-bezier(0.45, 0.05, 0.55, 0.95) | 0 мс | точно (CSS) |
| блок «Card & Expense Corporate Card…» `… > div.relative > div.relative.w-full` | clip-path | clip-path: inset(0px -80px calc(100% + 320px)) → inset(0px -80px -320px) | 300 мс | easeInOutSine cubic-bezier(0.45, 0.05, 0.55, 0.95) | 0 мс | точно (CSS) |
| блок «Card & Expense Corporate Card…» `… > div.relative > div.relative.w-full` | clip-path (уход курсора) | clip-path: inset(0px -80px -320px) → inset(0px -80px calc(100% + 320px)) | 300 мс | easeInOutSine cubic-bezier(0.45, 0.05, 0.55, 0.95) | 0 мс | точно (CSS) |
| блок «Card & Expense Corporate Card…» `#radix…` | opacity | opacity: 0 → 1 | 250 мс | Material standard cubic-bezier(0.4, 0, 0.2, 1) | 0 мс | точно (CSS) |
| блок «Card & Expense Corporate Card…» `… > div.relative > div.relative.w-full` | opacity | opacity: 0 → 1 | 240 мс | easeInOutSine cubic-bezier(0.45, 0.05, 0.55, 0.95) | 0 мс | точно (CSS) |
| блок «Card & Expense Corporate Card…» `… > div.relative > div.relative.w-full` | opacity (уход курсора) | opacity: 1 → 0 | 240 мс | easeInOutSine cubic-bezier(0.45, 0.05, 0.55, 0.95) | 0 мс | точно (CSS) |
| блок «Card & Expense Corporate Card…» `… > div.relative > div.relative.w-full` | height (уход курсора) | height: 658px → 0px | 300 мс | easeInOutSine cubic-bezier(0.45, 0.05, 0.55, 0.95) | 0 мс | точно (CSS) |
| блок «Card & Expense Corporate Card…» `#radix…` | transform | transform: translateY(8px) → translateY(0px) | 500 мс | Material standard cubic-bezier(0.4, 0, 0.2, 1) | 0 мс | точно (CSS) |
| картинка 16×16 `… > svg.box-content.block` | rotate | rotate: none → 180deg | 250 мс | своя cubic-bezier(0.6, 0, 0.2, 0.5) | 0 мс | точно (CSS) |
| картинка 16×16 `… > svg.box-content.block` | rotate (уход курсора) | rotate: 180deg → none | 250 мс | своя cubic-bezier(0.6, 0, 0.2, 0.5) | 0 мс | точно (CSS) |
| блок 16×16 `… > a.text-hushed.flex > div` | transform, opacity | transform: translate(0px) → translate(8px) → translate(-8px) → translate(0px); opacity: 1 → 0 → 1 | 500 мс | ease-in-out cubic-bezier(0.42, 0, 0.58, 1) | 0 мс | точно (CSS) |
| блок «arrow_forward» `… > span.pointer-events-none.absolute > i.box-content.block` | rotate (уход курсора) | rotate: -45deg → none | 300 мс | Material decelerate cubic-bezier(0, 0, 0.2, 1) | 0 мс | точно (CSS) |
| блок «arrow_forward» `… > span.pointer-events-none.absolute > i.box-content.block` | rotate | rotate: none → -45deg | 300 мс | Material decelerate cubic-bezier(0, 0, 0.2, 1) | 0 мс | точно (CSS) |

- Смена цвета (color, background-color): 10 элементов, 240 мс, easeInOutSine cubic-bezier(0.45, 0.05, 0.55, 0.95); реже — 300 мс, Material standard cubic-bezier(0.4, 0, 0.2, 1); 300 мс, Material decelerate cubic-bezier(0, 0, 0.2, 1)

ещё 342 не показано (не сохранено: потолок записей на фазу и фоновые повторы)

### Фокус

| Элемент | Что движется | Откуда → куда | Длительность | Кривая / пружина | Задержка | Основа |
|---|---|---|---|---|---|---|
| блок «We build software for» `div.bf7S1a_borderTracer.w-full::before` | opacity | opacity: 1 → 0 | 500 мс | Material decelerate cubic-bezier(0, 0, 0.2, 1) | 0 мс | точно (CSS) |
| блок «We build software for account…» `div.bf7S1a_borderTracer.w-full::before` | opacity (потеря фокуса) | opacity: 0 → 1 | 500 мс | Material decelerate cubic-bezier(0, 0, 0.2, 1) | 0 мс | точно (CSS) |

- Смена цвета (border-top-color, outline-color, border-bottom-color, border-left-color, …): 2 элемента, 150 мс, Material standard cubic-bezier(0.4, 0, 0.2, 1); реже — 200 мс, Material standard cubic-bezier(0.4, 0, 0.2, 1)

ещё 44 не показано (не сохранено: потолок записей на фазу и фоновые повторы)

## Черновик токенов

```json
{
  "duration": {
    "fast": 250,
    "base": 300,
    "slow": 500
  },
  "ease": {
    "enter": [0.45, 0.05, 0.55, 0.95],
    "exit": [0.45, 0.05, 0.55, 0.95],
    "move": [0.45, 0.05, 0.55, 0.95]
  },
  "spring": {
    "snappy": {
      "stiffness": 700,
      "damping": 48,
      "mass": 1
    },
    "soft": {
      "stiffness": 300,
      "damping": 31,
      "mass": 1
    }
  },
  "stagger": 40,
  "distance": 8,
  "blur": 0
}
```

## Пропущено

- `canvas.block.h-full` — canvas 1440×1013 (WebGL, Lottie, Rive) — движение внутри не снимается, только на кадрах и видео съёмки
- `video.hidden.w-full:nth-of-type(2)` — видео 1310×584 — его движение не снимается, только на кадрах и видео съёмки
- `… > canvas.pointer-events-none` — canvas 642×481 (WebGL, Lottie, Rive) — движение внутри не снимается, только на кадрах и видео съёмки
- `… > div.justify-self-start.opacity-100 > canvas` — canvas 642×482 (WebGL, Lottie, Rive) — движение внутри не снимается, только на кадрах и видео съёмки
- `… > div.self-start.justify-self-start > canvas` — canvas 642×482 (WebGL, Lottie, Rive) — движение внутри не снимается, только на кадрах и видео съёмки
- `*` — скачки без анимации (замер: меньше 4 значений или короче 50 мс; CSS и WAAPI длительностью 0 мс) не показаны: прокрутка 1, наведение 6, фокус 9
- `*` — движение по замеру, что вернулось к началу (туда и обратно в одном замере), не показано: прокрутка 2
- `span.number` — фоновая анимация: ещё 236 одинаковых повторов не показано
- `… > span.section:nth-of-type(1) > span.digit:nth-of-type(9)` — фоновая анимация: ещё 82 одинаковых повторов не показано
- `… > span.section:nth-of-type(1) > span.digit:nth-of-type(5)` — фоновая анимация: ещё 59 одинаковых повторов не показано
- `… > span.section:nth-of-type(1) > span.digit:nth-of-type(8)` — фоновая анимация: ещё 59 одинаковых повторов не показано
- `… > span.section:nth-of-type(1) > span.digit:nth-of-type(7)` — фоновая анимация: ещё 57 одинаковых повторов не показано

## Кадры и видео

- media/frames/load-0010.png
- media/frames/load-0192.png
- media/frames/load-0466.png
- media/frames/load-0606.png
- media/frames/load-1000.png
- media/frames/load-1608.png
- media/frames/load-2500.png
- media/frames/scroll-0760.png
- media/frames/scroll-1579.png
- media/frames/scroll-2374.png
- media/frames/scroll-3183.png
- media/frames/scroll-4010.png
- media/frames/scroll-4812.png
- media/frames/scroll-5633.png
- media/frames/scroll-6495.png
- media/frames/scroll-7283.png
- media/frames/scroll-8082.png
- media/frames/scroll-8882.png
- media/frames/scroll-9745.png

Видео: media/video.webm

## Ограничения

Не снимаются: canvas и WebGL (в том числе Lottie в режиме canvas), видео, морфинг SVG-путей (атрибут `d`) и анимации, где JS меняет CSS-переменную на предке, а движется потомок. Такие эффекты видны только на кадрах и видео — повторять по ним «на глаз» с пометкой «основа: видео». Движение, привязанное к прокрутке (параллакс, scrub), записано без длительности и кривой — «привязано к прокрутке: N px за M px прокрутки»; анимации на scroll-timeline — только на видео. Движение по клику (вкладки, аккордеоны, модальные окна) не снимается: съёмка не кликает.

## Лицензия

Движение снято с ramp.com как образец. Код, тексты и картинки сайта не копируются; в паспорт стиля — «своя реализация (образец: ramp.com)».
