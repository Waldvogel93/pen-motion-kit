# Установка pen-motion

pen-motion — скилл Claude Code, который оживляет макеты pen.dev: подбирает стиль движения по референсам и собирает живой макет на React и Motion. Как им пользоваться — [USAGE.md](USAGE.md).

Коротко:
1. Поставьте сами программы из раздела 1 и склонируйте репозиторий.
2. Откройте папку репозитория в VS Code и дайте Claude Code промт из раздела 2.
3. Когда Claude попросит, выполните шаги со входом из раздела 3.

## 1. Что поставить самому

| Что | Зачем | Откуда |
|---|---|---|
| Git | клонировать репозиторий | https://git-scm.com/downloads |
| Node.js 24 LTS (у автора 24.19.0) | скрипты, живой макет, тесты | https://nodejs.org/en/download |
| VS Code | редактор; в нём работают pen.dev и Claude Code | https://code.visualstudio.com/ |
| Claude Code: расширение для VS Code и CLI `claude` | агент; CLI нужен для команд `claude plugin` и `claude mcp` | https://code.claude.com/docs/en/installation |
| pen.dev: расширение для VS Code (в Extensions искать **pen.dev**) и аккаунт pen.dev | макеты `.pen` и Pencil MCP | https://docs.pencil.dev/getting-started/installation |

Приложение pen.dev для рабочего стола (https://www.pen.dev/downloads) не обязательно: всё работает через расширение VS Code. Python нужен, только если понадобится скилл `webapp-testing`.

Склонируйте репозиторий в любую папку и откройте её в VS Code (**File → Open Folder**). Корень репозитория должен быть корнем рабочей области: так pen.dev находит киты в `design/libraries/`, а Claude Code — скиллы и настройки в `.claude/`.

```bash
git clone https://github.com/Waldvogel93/pen-motion-kit.git
```

## 2. Промт для Claude

Откройте Claude Code в VS Code и вставьте:

> Прочитай INSTALL.md, установи всё по шагам раздела 4, проверь работоспособность по разделу 5 и отчитайся по-русски: что поставлено, какие проверки прошли, что осталось сделать мне. Шаги, где нужен мой вход, не делай сам: скажи, что сделать, и подожди.

## 3. Что требует вашего входа

Claude этого не сделает: нужен человек.

- **GitHub**: репозиторий публичный, для клонирования вход не нужен. Чтобы пушить свои изменения, примите приглашение в соавторы (если его прислали) и войдите: окно Git Credential Manager при первом `git push` или `gh auth login`.
- **pen.dev**: войти в аккаунт, когда расширение попросит (код из письма).
- **Pencil MCP**: открыть любой `.pen`, например `design/nimbra-demo.pen`, затем в pen.dev **Settings (⚙️) → MCP** включить **Claude Code CLI**. pen.dev сам зарегистрирует MCP-сервер `pencil` для Claude Code. После этого перезапустить Claude Code.
- **Claude Code при первом запуске в папке**: доверить папку.
- **Screenrove** работает без аккаунта и ключа.
- **Подключить кит в pen.dev** нужно уже в работе, не при установке. Об этом в [USAGE.md](USAGE.md).

## 4. Что Claude ставит сам

Всё ставится внутрь репозитория, глобально — ничего. Команды выполнять из корня репозитория, если не сказано иное.

### 4.1. Локальные пути

Создать `.claude/settings.local.json` (в git не попадает). `<КОРЕНЬ>` — абсолютный путь к корню репозитория с прямыми слешами, например `C:/Users/me/pen-motion`. Узнать его: `node -p "process.cwd()"`. Если файл уже есть, добавить ключи в его `env`, не затирая остальное.

```json
{
  "env": {
    "npm_config_cache": "<КОРЕНЬ>/.scratch/npm-cache",
    "PLAYWRIGHT_BROWSERS_PATH": "<КОРЕНЬ>/.scratch/ms-playwright"
  }
}
```

Эти переменные Claude Code подхватит после перезапуска. В текущей сессии задавай их прямо в командах `npm` и `npx`:
- bash: `PLAYWRIGHT_BROWSERS_PATH=<КОРЕНЬ>/.scratch/ms-playwright npm_config_cache=<КОРЕНЬ>/.scratch/npm-cache npm …`
- PowerShell: `$env:PLAYWRIGHT_BROWSERS_PATH='<КОРЕНЬ>/.scratch/ms-playwright'; $env:npm_config_cache='<КОРЕНЬ>/.scratch/npm-cache'; npm …`

### 4.2. Плагины

`superpowers` обязателен: скилл опирается на его процессные скиллы, например `superpowers:test-driven-development`. `context7` нужен для процедуры «Новый кит» (свежая документация библиотек). Оба уже перечислены в `.claude/settings.json`, но их нужно установить:

```bash
claude plugin install superpowers@claude-plugins-official --scope project
claude plugin install context7@claude-plugins-official --scope project
```

Если CLI не знает маркетплейс, сначала выполнить `claude plugin marketplace add anthropics/claude-plugins-official`. Проверка: `claude plugin list` показывает оба плагина со `Scope: project`. Новые плагины видны после перезапуска Claude Code.

### 4.3. MCP-серверы

- `screenrove` — референсы экранов и анимаций, без ключа:
  ```bash
  claude mcp add --transport http screenrove https://screenrove.com/mcp --scope local
  ```
- `pencil` регистрирует сам pen.dev (раздел 3). Если его нет в `claude mcp list`, подключить вручную в область проекта:
  ```bash
  claude mcp add pencil --scope local -- "<путь к mcp-server pen.dev>" --app visual_studio_code --agent claudeCodeCLI
  ```
  У автора на Windows путь такой: `%USERPROFILE%\.pencil\mcp\visual_studio_code\out\mcp-server-windows-x64.exe`.

Проверка: `claude mcp list` — у `screenrove` и `pencil` статус `Connected`. `pencil` отвечает, только пока в VS Code открыт какой-нибудь `.pen`.

Записи `--scope local` привязаны к написанию пути папки. На Windows VS Code может открыть папку как `d:\…`, а терминал — как `D:\…`. Если в сессии Claude Code в VS Code сервера не видно (`/mcp`), повторить `claude mcp add` из этой сессии.

### 4.4. Пакеты npm и браузер

С переменными из 4.1:

```bash
cd design/motion && npm install && npx playwright install chromium
cd nimbra-demo/mockup && npm install
```

Обе команды `cd` — от корня репозитория. В скриптах и в макете одна и та же версия Playwright (1.64.1), поэтому одного Chromium в `.scratch/ms-playwright` хватает обоим.

Шаблон макета `design/motion/template` нужен, только если дорабатывать сам движок. Тогда отдельно: `cd design/motion/template && npm install && npm test`. Новые продукты создаются из шаблона без его `node_modules` и ставят зависимости сами.

## 5. Проверки

Все пункты должны пройти. Claude Code отчитывается по каждому.

1. **Тесты скриптов**: `cd design/motion && npm test` — все тесты зелёные (на момент передачи — 168 тестов в 5 файлах).
2. **Съёмка движения** на локальной фикстуре, из корня:
   ```bash
   node design/motion/scripts/capture-motion.mjs "$(node -p "require('node:url').pathToFileURL('design/motion/scripts/__tests__/fixtures/motion-site/index.html').href")" --out .scratch/check
   ```
   Печатает `Снято записей: …`, а `.scratch/check/record.md` читается: в нём таблицы приёмов.
3. **Линтер стиля**: `node design/motion/scripts/lint-style.mjs design/motion/styles/kinetic` печатает `Проблем нет`.
4. **Живой макет примера**, из `nimbra-demo/mockup`:
   - `npm test` — тесты зелёные;
   - `npm run build` — появляется `dist/index.html`, он открывается двойным кликом;
   - `npm run e2e` — e2e зелёные (сервер на порту 5199 Playwright поднимает и гасит сам);
   - `npm run dev` — по ссылке из консоли открываются экраны «Главная» и «Вход» с панелью стиля движения. Остановить только этот процесс (Ctrl+C или по его PID).
5. **Screenrove MCP**: вызов `mcp__screenrove__list_products` с `limit: 3` возвращает продукты.
6. **Pencil MCP**: открыть `code -r design/nimbra-demo.pen` и вызвать `mcp__pencil__execute` с этим `filePath` и кодом
   ```js
   Print(Get((n,c)=>{c.skipChildren();return n.type==="frame"&&!n.id.includes(":")?n.name:undefined}))
   ```
   В ответе — рамки экранов макета (`Home`, `Login` и состояния входа).

## 6. Правила проекта

Полный текст — [.claude/rules/project.md](.claude/rules/project.md), Claude Code читает его сам. Главное:

- всё лежит внутри папки репозитория, временное — в `.scratch/`;
- глобально ничего не ставится: npm без `-g`, плагины `--scope project`, MCP — `.mcp.json` или `--scope local`;
- процессы не убивать по имени образа (`taskkill /IM node.exe`, `pkill node`): это убьёт и MCP-серверы. Останавливать только свой процесс.
