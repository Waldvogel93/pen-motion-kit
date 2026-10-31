# Движение: Online Business Banking For Startups, Small Businesses & Scaling Companies

https://mercury.com/ · снято 31.10.2026 · окно 1440×900

## Сигнатурные приёмы

- блок 1440×900: сдвиг на 552 px (Прокрутка), 600 мс, easeInOutQuart — `div.w-full > div.relative.h-full:nth-of-type(3)`
- блок 3415×56: сдвиг на 1736 px (Прокрутка), 45000 мс, бесконечно, linear — `div.w-max`
- блок «Banking’s been a headache. No…»: сдвиг на 50 px и проявление (Прокрутка), сдвиг на 50 px — 670 мс, своя cubic-bezier(0.28, 1.1, 0.74, 1), позже на 150 мс; проявление — 670 мс, своя cubic-bezier(0.59, 0.41, 0.68, 0.49) — `section:nth-of-type(5) > div.animate-container.bg-inherit` × 11 элементов
- блок «Ecommerce Building an ecommer…»: размытие 4 px, затухание (Загрузка), 500 мс, easeOutQuad — `#radix…` × 4 элемента
- картинка 1440×900: затухание (Прокрутка), 200 мс, Material decelerate — `div.relative:nth-of-type(3) > picture.pointer-events-none` × 3 элемента

## По фазам

### Загрузка

| Элемент | Что движется | Откуда → куда | Длительность | Кривая / пружина | Задержка | Основа |
|---|---|---|---|---|---|---|
| блок «Ecommerce Building an ecommer…» `#radix…` × 4 | filter, opacity | filter: blur(0px) → blur(4px); opacity: 1 → 0 | 500 мс | easeOutQuad cubic-bezier(0.25, 0.46, 0.45, 0.94) | -600–0 мс | точно (CSS) |
| блок «SaaS Unlike most financial in…» `… > div.pointer-events-none.col-start-1:nth-of-type(2)` | visibility, translate, opacity | visibility: hidden → visible; translate: 0px 5px → 0px; opacity: 0 → 1 | 300 мс | ease-in-out cubic-bezier(0.42, 0, 0.58, 1) | -600 мс | точно (CSS) |
| блок «Ecommerce Building an ecommer…» `… > div.pointer-events-none.col-start-1:nth-of-type(2)` × 2 | visibility, translate, opacity | visibility: visible → hidden; translate: 0px → 0px -5px; opacity: 1 → 0 | 300 мс | ease-in-out cubic-bezier(0.42, 0, 0.58, 1) | -600 мс | точно (CSS) |
| блок 496×84 `div.absolute.z-10:nth-of-type(2)` | clip-path | clip-path: inset(0px 100% 0px 0% round 4px) → inset(0px 67% 0px 0% round 4px) | 300 мс | Material standard cubic-bezier(0.4, 0, 0.2, 1) | 0 мс | точно (CSS) |
| блок `div.absolute:nth-of-type(4) > div.relative` | transform, opacity | transform: rotateX(0deg) scale(1) → rotateX(-10deg) scale(0.9); opacity: 1 → 0 | 250 мс | своя cubic-bezier(0.4, 1, 0.2, 1) | 0 мс | точно (CSS) |

### Прокрутка

| Элемент | Что движется | Откуда → куда | Длительность | Кривая / пружина | Задержка | Основа |
|---|---|---|---|---|---|---|
| блок 1440×900 `div.w-full > div.relative.h-full:nth-of-type(3)` | transform | transform: translate(0px) → translate(551px, -1px) | 600 мс | easeInOutQuart cubic-bezier(0.76, 0, 0.24, 1) | 0 мс | точно (CSS) |
| блок 3415×56 `div.w-max` | translate | translate: none → calc(-50% - 28px) | 45000 мс, бесконечно | linear cubic-bezier(0, 0, 1, 1) | 0 мс | точно (CSS) |
| блок «Banking’s been a headache. No…» `section:nth-of-type(5) > div.animate-container.bg-inherit` × 11 | opacity | opacity: 0 → 1 | 670 мс | своя cubic-bezier(0.59, 0.41, 0.68, 0.49) | 0 мс | точно (CSS) |
| блок «Banking’s been a headache. No…» `section:nth-of-type(5) > div.animate-container.bg-inherit` × 11 | translate | translate: 0px 50px → 0px | 670 мс | своя cubic-bezier(0.28, 1.1, 0.74, 1) | 150 мс | точно (CSS) |
| картинка 1440×900 `div.relative:nth-of-type(3) > picture.pointer-events-none` | opacity | opacity: 1 → 0 | 200 мс | Material decelerate cubic-bezier(0, 0, 0.2, 1) | 300 мс | точно (CSS) |
| блок «Radically different banking A…» `section.relative:nth-of-type(1) > div.dark-neutral-theme` | opacity | opacity: 1 → 0 | 150 мс | Material standard cubic-bezier(0.4, 0, 0.2, 1) | 0 мс | точно (CSS) |
| блок «Radically different banking A…» `section.relative:nth-of-type(1) > div.dark-neutral-theme` | opacity | opacity: 0 → 1 | 150 мс | Material standard cubic-bezier(0.4, 0, 0.2, 1) | 0 мс | точно (CSS) |
| блок 1128×648 `div.pointer-events-none:nth-of-type(2)` × 2 | opacity | opacity: 0 → 1 | 200 мс | Material decelerate cubic-bezier(0, 0, 0.2, 1) | 0–300 мс | точно (CSS) |
| блок 1128×648 `div.pointer-events-none:nth-of-type(2)` | opacity | opacity: 0.68 → 0 | 137 мс | Material decelerate cubic-bezier(0, 0, 0.2, 1) | 0 мс | точно (CSS) |

- Смена цвета (background-color, outline-color, color): 30 элементов, 300 мс, Material decelerate cubic-bezier(0, 0, 0.2, 1); реже — 500 мс, своя cubic-bezier(0, 0, 0.6, 1); 150 мс, Material standard cubic-bezier(0.4, 0, 0.2, 1)

ещё 197 не показано (не сохранено: потолок записей на фазу и фоновые повторы)

### Наведение

| Элемент | Что движется | Откуда → куда | Длительность | Кривая / пружина | Задержка | Основа |
|---|---|---|---|---|---|---|
| блок 1128×648 `div.pointer-events-none:nth-of-type(2)` | opacity | opacity: 0 → 1 | 200 мс | Material decelerate cubic-bezier(0, 0, 0.2, 1) | 0 мс | точно (CSS) |
| блок 1128×648 `div.pointer-events-none:nth-of-type(2)` | opacity (уход курсора) | opacity: 1 → 0 | 200 мс | Material decelerate cubic-bezier(0, 0, 0.2, 1) | 0 мс | точно (CSS) |
| блок 145×40 `span.pointer-events-none.overflow-hidden` 2 раза | opacity (уход курсора) | opacity: 0.6 → 0 | 500 мс | ease-out cubic-bezier(0, 0, 0.58, 1) | 0 мс | точно (CSS) |

- Смена цвета (fill, color, background-color): 10 элементов, 300 мс, Material decelerate cubic-bezier(0, 0, 0.2, 1); реже — 500 мс, своя cubic-bezier(0, 0, 0.6, 1)

### Фокус

| Элемент | Что движется | Откуда → куда | Длительность | Кривая / пружина | Задержка | Основа |
|---|---|---|---|---|---|---|
| карточка «Mercury will occasionally sen…» `div.group.absolute > div.flex.flex-col` | opacity | opacity: 0 → 1 | 150 мс | Material standard cubic-bezier(0.4, 0, 0.2, 1) | 0 мс | точно (CSS) |
| карточка «Mercury will occasionally sen…» `div.group.absolute > div.flex.flex-col` | opacity (потеря фокуса) | opacity: 1 → 0 | 150 мс | Material standard cubic-bezier(0.4, 0, 0.2, 1) | 0 мс | точно (CSS) |
| карточка «Mercury will occasionally sen…» `div.group.absolute > div.flex.flex-col` | translate | translate: 0px 2px → 0px | 150 мс | Material standard cubic-bezier(0.4, 0, 0.2, 1) | 0 мс | точно (CSS) |
| карточка «Mercury will occasionally sen…» `div.group.absolute > div.flex.flex-col` | translate (потеря фокуса) | translate: 0px → 0px 2px | 150 мс | Material standard cubic-bezier(0.4, 0, 0.2, 1) | 0 мс | точно (CSS) |

- Смена цвета (background-color): 1 элемент, 300 мс, Material decelerate cubic-bezier(0, 0, 0.2, 1)

## Черновик токенов

```json
{
  "duration": {
    "fast": 150,
    "base": 300,
    "slow": 670
  },
  "ease": {
    "enter": [0.28, 1.1, 0.74, 1],
    "exit": [0, 0, 0.58, 1],
    "move": [0.4, 0, 0.2, 1]
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
  "distance": 50,
  "blur": 4
}
```

## Пропущено

- `… > div.col-start-1.col-end-auto > video.h-full.w-full` — видео 1440×900 — его движение не снимается, только на кадрах и видео съёмки
- `*` — скачки без анимации (замер: меньше 4 значений или короче 50 мс; CSS и WAAPI длительностью 0 мс) не показаны: загрузка 1, наведение 2

## Кадры и видео

- media/frames/load-0034.png
- media/frames/load-0361.png
- media/frames/load-0612.png
- media/frames/load-0860.png
- media/frames/load-1067.png
- media/frames/load-1602.png
- media/frames/load-2502.png
- media/frames/scroll-0715.png
- media/frames/scroll-1564.png
- media/frames/scroll-3512.png
- media/frames/scroll-4266.png
- media/frames/scroll-5083.png
- media/frames/scroll-5908.png
- media/frames/scroll-6695.png
- media/frames/scroll-7466.png
- media/frames/scroll-8235.png
- media/frames/scroll-9051.png
- media/frames/scroll-9803.png
- media/frames/scroll-10602.png

Видео: media/video.webm

## Ограничения

Не снимаются: canvas и WebGL (в том числе Lottie в режиме canvas), видео, морфинг SVG-путей (атрибут `d`) и анимации, где JS меняет CSS-переменную на предке, а движется потомок. Такие эффекты видны только на кадрах и видео — повторять по ним «на глаз» с пометкой «основа: видео». Движение, привязанное к прокрутке (параллакс, scrub), записано без длительности и кривой — «привязано к прокрутке: N px за M px прокрутки»; анимации на scroll-timeline — только на видео. Движение по клику (вкладки, аккордеоны, модальные окна) не снимается: съёмка не кликает.

## Лицензия

Движение снято с mercury.com как образец. Код, тексты и картинки сайта не копируются; в паспорт стиля — «своя реализация (образец: mercury.com)».
