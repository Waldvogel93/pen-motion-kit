# Правила проекта

- Всё, что создаётся по работе, лежит внутри папки репозитория. Временное — черновики, скачанные страницы, пробные скрипты — в `.scratch/`, в git оно не попадает.
- Кэш npm и браузеры Playwright тоже в `.scratch/` (`.scratch/npm-cache`, `.scratch/ms-playwright`). Пути задаёт `env` в `.claude/settings.local.json` — см. `INSTALL.md`.
- Глобально ничего не ставить:
  - npm-пакеты — без `-g`, разовые CLI — через `npx`;
  - плагины — `claude plugin install <имя> --scope project`;
  - MCP — в `.mcp.json` или `claude mcp add <имя> --scope local`;
  - скиллы — в `.claude/skills/`.
- Процессы не убивать по имени образа: `taskkill /IM node.exe` или `pkill node` убьют все node, в том числе MCP-серверы. Останавливать только процесс, который запустил сам, по PID.
- `.pen` — только через Pencil MCP, никогда через Read или Grep: файлы зашифрованы.
- Git: в `git add` — только свои пути, без `-A` и без `.`.
