// Проверка папки стиля: passport.md, tokens.json, style.tsx (наличие), style.css (селекторы).
// Использование: node design/motion/scripts/lint-style.mjs <папка стиля>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLE_IDS = JSON.parse(
  fs.readFileSync(path.resolve(HERE, '../template/src/motion/role-ids.json'), 'utf8'),
);

const NO_ANIMATION = 'без анимации';
const SECTIONS = [
  'Характер',
  'Когда подходит',
  'Референсы',
  'Изменения вида в покое',
  'Роли',
  'Источники и установка',
  'Reduced motion',
];

// Разбивает паспорт на заголовок и разделы «## ...» с телом.
export function parsePassport(text) {
  const lines = text.split(/\r?\n/);
  const sections = new Map();
  let current = null;
  let fence = null; // открытый блок кода: маркер ``` или ~~~
  const headings = [];
  for (const line of lines) {
    const f = /^\s*(```|~~~)/.exec(line);
    if (f) {
      if (fence === null) fence = f[1];
      else if (fence === f[1]) fence = null;
    } else if (fence === null) {
      const m = /^## (.+?)\s*$/.exec(line);
      if (m) {
        current = m[1];
        sections.set(current, []);
        continue;
      }
      if (/^# /.test(line)) {
        headings.push(line);
        continue;
      }
    }
    if (current !== null) sections.get(current).push(line);
  }
  return { title: headings.find((l) => /^# \S/.test(l)), sections };
}

// Делит строку таблицы по неэкранированным «|» вне обратных кавычек; «\|» превращает в «|».
export function splitRow(line) {
  const cells = [];
  let cur = '';
  let code = false;
  const body = line.trim().replace(/^\|/, '');
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && body[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (ch === '`') {
      code = !code;
      cur += ch;
    } else if (ch === '|' && !code) {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim() !== '') cells.push(cur.trim());
  return cells;
}

// Роль или её вариант «<роль>/<вариант>» (вариант: строчные буквы, цифры, дефисы).
function isKnownRole(id) {
  const m = /^([^/]+)\/([a-z0-9-]+)$/.exec(id);
  return ROLE_IDS.includes(m ? m[1] : id);
}

function lintRolesTable(bodyLines, problems) {
  const rows = bodyLines
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'))
    .map(splitRow);
  const data = rows.slice(2); // шапка и разделитель
  const seen = new Set();
  for (const cells of data) {
    const id = cells[0].replace(/^`|`$/g, '');
    if (!isKnownRole(id)) {
      problems.push(`passport.md: в таблице «Роли» неизвестная роль "${id}"`);
      continue;
    }
    if (seen.has(id)) problems.push(`passport.md: в таблице «Роли» роль "${id}" повторяется`);
    seen.add(id);
    const behavior = (cells[1] ?? '').toLowerCase();
    const license = cells[4] ?? '';
    if (behavior !== NO_ANIMATION && license === '') {
      problems.push(`passport.md: у роли "${id}" не указана лицензия`);
    }
  }
  for (const id of ROLE_IDS) {
    if (!seen.has(id)) {
      problems.push(`passport.md: в таблице «Роли» нет роли "${id}"`);
    }
  }
}

function lintPassport(text, problems) {
  const { title, sections } = parsePassport(text);
  if (!title) problems.push('passport.md: нет заголовка "# <Название>"');
  for (const name of SECTIONS) {
    const body = sections.get(name);
    if (!body) {
      problems.push(`passport.md: нет раздела "## ${name}"`);
      continue;
    }
    const joined = body.join('\n');
    if (joined.trim() === '') {
      problems.push(`passport.md: раздел "## ${name}" пустой`);
      continue;
    }
    if (name === 'Референсы' && !/\[[^\]]+\]\([^)\s]+\)/.test(joined)) {
      problems.push('passport.md: в разделе "## Референсы" нет ни одной ссылки');
    }
    if (name === 'Роли') lintRolesTable(body, problems);
  }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isCurve = (v) => Array.isArray(v) && v.length === 4 && v.every(isNum);

// Эталон полей MotionTokens: путь -> проверка и подпись ожидаемого.
const TOKEN_SPEC = {
  duration: { fast: ['число, мс', isNum], base: ['число, мс', isNum], slow: ['число, мс', isNum] },
  ease: {
    enter: ['массив из 4 чисел', isCurve],
    exit: ['массив из 4 чисел', isCurve],
    move: ['массив из 4 чисел', isCurve],
  },
  spring: {
    snappy: { stiffness: ['число', isNum], damping: ['число', isNum], mass: ['число', isNum] },
    soft: { stiffness: ['число', isNum], damping: ['число', isNum], mass: ['число', isNum] },
  },
  stagger: ['число, мс', isNum],
  distance: ['число, px', isNum],
  blur: ['число, px', isNum],
};

const isLeaf = (spec) => Array.isArray(spec);
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function checkTokens(value, spec, prefix, problems) {
  for (const key of Object.keys(spec)) {
    const p = prefix ? `${prefix}.${key}` : key;
    const sub = spec[key];
    const v = isPlainObject(value) ? value[key] : undefined;
    if (isLeaf(sub)) {
      if (!sub[1](v)) problems.push(`tokens.json: нет поля ${p} (${sub[0]})`);
    } else if (!isPlainObject(v)) {
      problems.push(`tokens.json: нет поля ${p} (объект)`);
    } else {
      checkTokens(v, sub, p, problems);
    }
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (!(key in spec)) problems.push(`tokens.json: лишнее поле ${prefix ? `${prefix}.${key}` : key}`);
    }
  }
}

// Проверка готового объекта токенов: те же сообщения, что у tokens.json в lintStyle.
export function validateTokens(value) {
  if (!isPlainObject(value)) return ['tokens.json: ожидается объект'];
  const problems = [];
  checkTokens(value, TOKEN_SPEC, '', problems);
  return problems;
}

function lintTokens(text, problems) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    problems.push(`tokens.json: не разбирается как JSON (${e.message})`);
    return;
  }
  if (!isPlainObject(data)) {
    problems.push('tokens.json: ожидается объект');
    return;
  }
  checkTokens(data, TOKEN_SPEC, '', problems);
}

// Находит позицию закрывающей скобки для открывающей в start.
function matchBrace(css, start) {
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return i;
  }
  return css.length - 1;
}

// Делит список селекторов по запятым верхнего уровня.
function splitSelectors(prelude) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of prelude) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function checkCssBlock(css, prefix, problems) {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    const semi = css.indexOf(';', i);
    if (open === -1 && semi === -1) break;
    if (semi !== -1 && (open === -1 || semi < open)) {
      i = semi + 1; // @import и подобные без блока
      continue;
    }
    const prelude = css.slice(i, open).trim();
    const close = matchBrace(css, open);
    if (prelude.startsWith('@')) {
      const name = /^@([\w-]+)/.exec(prelude)?.[1] ?? '';
      if (['media', 'supports', 'layer', 'container'].includes(name)) {
        checkCssBlock(css.slice(open + 1, close), prefix, problems);
      } // @keyframes, @font-face и прочее — без селекторов, пропускаем
    } else {
      for (const sel of splitSelectors(prelude)) {
        if (!sel.startsWith(prefix)) {
          problems.push(`style.css: селектор "${sel}" не начинается с ${prefix}`);
        }
      }
    }
    i = close + 1;
  }
}

function lintCss(text, id, problems) {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
  checkCssBlock(css, `[data-motion-style="${id}"]`, problems);
}

export function lintStyle(dir) {
  const root = path.resolve(dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return [`нет папки стиля ${root}`];
  }
  const problems = [];
  const read = (name, required) => {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) {
      if (required) problems.push(`нет файла ${name}`);
      return null;
    }
    return fs.readFileSync(file, 'utf8');
  };
  const passport = read('passport.md', true);
  const tokens = read('tokens.json', true);
  read('style.tsx', true);
  const css = read('style.css', false);
  if (passport !== null) lintPassport(passport, problems);
  if (tokens !== null) lintTokens(tokens, problems);
  if (css !== null) lintCss(css, path.basename(root), problems);
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Использование: node lint-style.mjs <папка стиля>');
    process.exit(2);
  }
  const problems = lintStyle(path.resolve(dir));
  if (problems.length === 0) console.log('Проблем нет');
  else {
    console.log(problems.join('\n'));
    process.exitCode = 1;
  }
}
