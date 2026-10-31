# design/motion — живой макет

Общая часть для «живых макетов»: React-макеты экранов pen.dev с переключаемыми стилями анимации. Процесс ведёт скилл [pen-motion](../../.claude/skills/pen-motion/SKILL.md).

## Структура

- `styles/<id>/` — коллекция стилей анимации, `_template` — заготовка нового стиля
- `template/` — шаблон макета: движок, панель стилей, e2e, сверка с pen.dev
- `scripts/` — Node-скрипты (`new-product`, `add-style`, `fix-style`, `motion-spec`, `lint-style`, `capture-motion`), адаптеры китов — `adapters.mjs`; тесты: `scripts/**/*.test.mjs`, запуск `npm test`
- `captures/<slug>/` — движение, снятое с сайтов-референсов (`record.md`, `capture.json`; `media/` в git не попадает)
- `sketches/` — наброски форматов (самостоятельные HTML-страницы)
- `docs/` — документация

Установка — [INSTALL.md](../../INSTALL.md), как пользоваться — [USAGE.md](../../USAGE.md).
