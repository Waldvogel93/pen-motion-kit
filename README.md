# pen-motion

Скилл Claude Code, который оживляет макеты pen.dev: подбирает стиль движения по референсам (Screenrove и движение, снятое с живых сайтов), собирает живой макет на React и Motion с переключателем стилей и сдаёт один HTML и спецификацию движения.

- [INSTALL.md](INSTALL.md) — установка и проверка.
- [USAGE.md](USAGE.md) — как пользоваться.

## Что где лежит

| Путь | Что |
|---|---|
| `.claude/skills/pen-motion/` | скилл: `SKILL.md` и справочные файлы `references/` |
| `.claude/skills/webapp-testing/` | вспомогательный скилл для проверок в браузере (Anthropic, Apache 2.0) |
| `design/motion/` | механика: скрипты, шаблон макета, коллекция стилей, снятые референсы |
| `design/libraries/shadcn-obra/` | кит pen.dev, источник и лицензия — [CREDITS.md](design/libraries/CREDITS.md) |
| `design/nimbra-demo.pen`, `nimbra-demo/` | пример продукта |
| `.claude/settings.json`, `.mcp.json`, `.claude/rules/` | настройки проекта для Claude Code |
