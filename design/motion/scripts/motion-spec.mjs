// Собирает <product>/docs/motion-spec.md из паспорта выбранного стиля и решений motion.json.
// Использование: node design/motion/scripts/motion-spec.mjs <product>
import fs from 'node:fs/promises';
import path from 'node:path';
import { parsePassport, splitRow } from './lint-style.mjs';
import { REPO_ROOT, collectionDir, exists, parseUse, productDir, readDecisions, runCli, stylesDir } from './lib.mjs';

async function loadStyle(root, product, id) {
  for (const dir of [path.join(stylesDir(root, product), id), path.join(collectionDir(root), id)]) {
    if (await exists(path.join(dir, 'passport.md'))) {
      const passport = parsePassport(await fs.readFile(path.join(dir, 'passport.md'), 'utf8'));
      const tokens = JSON.parse(await fs.readFile(path.join(dir, 'tokens.json'), 'utf8'));
      return { passport, tokens };
    }
  }
  throw new Error(`Стиль "${id}" не найден ни в продукте, ни в коллекции design/motion/styles`);
}

const section = (passport, name) => (passport.sections.get(name) ?? []).join('\n').trim();
const curve = (c) => `cubic-bezier(${c.join(', ')})`;
const spring = (s) => `stiffness ${s.stiffness}, damping ${s.damping}, mass ${s.mass}`;

function tokensTable(t) {
  const rows = [
    ...['fast', 'base', 'slow'].map((k) => [`duration.${k}`, `${t.duration[k]} мс`]),
    ...['enter', 'exit', 'move'].map((k) => [`ease.${k}`, curve(t.ease[k])]),
    ...['snappy', 'soft'].map((k) => [`spring.${k}`, spring(t.spring[k])]),
    ['stagger', `${t.stagger} мс`],
    ['distance', `${t.distance} px`],
    ['blur', `${t.blur} px`],
  ];
  return ['| Токен | Значение |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join('\n');
}

// Шапка таблицы «Роли» и строка нужной роли из паспорта стиля-источника.
function roleRow(passport, role) {
  const lines = (passport.sections.get('Роли') ?? []).map((l) => l.trim()).filter((l) => l.startsWith('|'));
  const row = lines.slice(2).find((l) => splitRow(l)[0]?.replace(/^`|`$/g, '') === role);
  return row ? [...lines.slice(0, 2), row].join('\n') : null;
}

const cell = (s) => String(s ?? '').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');

export async function buildMotionSpec({ root, product }) {
  const data = await readDecisions(root, product);
  if (!data.style) throw new Error('Стиль не выбран: в motion.json style = null');
  const main = await loadStyle(root, product, data.style);
  const cache = new Map([[data.style, main]]);
  const get = async (id) => {
    if (!cache.has(id)) cache.set(id, await loadStyle(root, product, id));
    return cache.get(id);
  };

  const title = (main.passport.title ?? `# ${data.style}`).replace(/^# /, '');
  let overrides = 'Нет';
  const others = [];
  if (data.overrides.length > 0) {
    const rows = data.overrides.map(
      (o) => `| ${cell(o.screen)} | ${cell(o.element)} | ${cell(o.use)} | ${cell(o.note) || '—'} |`,
    );
    const parts = ['| Экран | Элемент | Реализация | Комментарий |', '|---|---|---|---|', ...rows];
    for (const o of data.overrides) {
      const { style, role } = parseUse(o.use);
      if (style !== data.style && !others.includes(style)) others.push(style);
      const src = await get(style);
      const found = roleRow(src.passport, role);
      parts.push('', `**${o.screen} / ${o.element}** — строка роли \`${role}\` из паспорта стиля ${style}:`, '');
      parts.push(found ?? `В паспорте стиля ${style} нет строки роли \`${role}\`.`);
    }
    overrides = parts.join('\n');
  }

  let install = section(main.passport, 'Источники и установка');
  for (const id of others) {
    install += `\n\n### Из стиля ${id} (точечные правки)\n\n${section((await get(id)).passport, 'Источники и установка')}`;
  }

  const spec = `# Спецификация движения — ${product}

## Стиль

**${title}** (\`${data.style}\`)

${section(main.passport, 'Характер')}

## Токены

${tokensTable(main.tokens)}

## Изменения вида в покое

${section(main.passport, 'Изменения вида в покое')}

## Роли

${section(main.passport, 'Роли')}

## Точечные правки

${overrides}

## Источники и установка

${install}

## Reduced motion

${section(main.passport, 'Reduced motion')}

## Где смотреть в коде

- \`mockup/src/motion/styles/${data.style}/style.tsx\` — реализация стиля
- \`mockup/src/screens/\` — экраны
`;
  await fs.mkdir(path.join(productDir(root, product), 'docs'), { recursive: true });
  await fs.writeFile(path.join(productDir(root, product), 'docs/motion-spec.md'), spec);
  return spec;
}

runCli(import.meta.url, async ([product]) => {
  if (!product) throw new Error('Использование: node motion-spec.mjs <product>');
  await buildMotionSpec({ root: REPO_ROOT, product });
  console.log(`Записано ${product}/docs/motion-spec.md`);
});
