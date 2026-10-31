import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lintStyle } from '../lint-style.mjs';
import { ADAPTERS } from '../adapters.mjs';
import { newProduct } from '../new-product.mjs';
import { addStyle } from '../add-style.mjs';
import { fixStyle } from '../fix-style.mjs';
import { buildMotionSpec } from '../motion-spec.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOTION = path.resolve(HERE, '../..');
const GOOD = path.join(HERE, 'fixtures/styles/good');
const TMP = path.resolve(MOTION, '../../.scratch/test-tmp');
const EXCLUDED = ['node_modules', 'dist', 'test-results', 'playwright-report', 'compare'];

const BASE = path.join(TMP, `product-${process.pid}`);
const root = path.join(BASE, 'repo');
const p = (...parts) => path.join(root, ...parts);
const read = (rel) => fs.readFileSync(p(rel), 'utf8');
const exists = (rel) => fs.existsSync(p(rel));

// Копия стиля good под новым id: имя, id в style.tsx и префикс селекторов в style.css.
function cloneStyle(dest, id, edit = {}) {
  fs.cpSync(GOOD, dest, { recursive: true });
  const rewrite = (file, fn) => {
    const f = path.join(dest, file);
    fs.writeFileSync(f, fn(fs.readFileSync(f, 'utf8')));
  };
  rewrite('style.css', (t) => t.replaceAll('"good"', `"${id}"`));
  rewrite('style.tsx', (t) => t.replace("id: 'good'", `id: '${id}'`));
  rewrite('passport.md', (t) => t.replace('# Хороший — растворение', `# Стиль ${id} — тест`));
  for (const [file, fn] of Object.entries(edit)) rewrite(file, fn);
}

beforeAll(() => {
  fs.mkdirSync(path.join(root, 'design/motion'), { recursive: true });
  fs.cpSync(path.join(MOTION, 'template'), path.join(root, 'design/motion/template'), {
    recursive: true,
    filter: (src) => !EXCLUDED.includes(path.basename(src)),
  });
  fs.cpSync(GOOD, path.join(root, 'design/motion/styles/good'), { recursive: true });
});

afterAll(() => fs.rmSync(BASE, { recursive: true, force: true }));

describe('ADAPTERS', () => {
  it('shadcn не требует установки', async () => {
    await expect(ADAPTERS.shadcn.install(p('x'))).resolves.toBeUndefined();
    expect(Object.keys(ADAPTERS)).toEqual(['shadcn']);
  });
});

describe('newProduct / addStyle', () => {
  it('создаёт продукт из шаблона', async () => {
    await newProduct({ root, product: 'p', kit: 'shadcn' });
    expect(JSON.parse(read('p/motion.json'))).toEqual({ kit: 'shadcn', style: null, candidates: [], overrides: [] });
    expect(exists('p/docs')).toBe(true);
    expect(exists('p/mockup/package.json')).toBe(true);
    expect(exists('p/mockup/node_modules')).toBe(false);
    expect(exists('p/mockup/dist')).toBe(false);
    expect(exists('p/mockup/src/motion/styles/fixture-a')).toBe(false);
    expect(exists('p/mockup/e2e/runtime.spec.ts')).toBe(false);
    expect(exists('p/mockup/e2e/smoke.spec.ts')).toBe(true);
    expect(exists('p/mockup/e2e/compare.spec.ts')).toBe(false);
    expect(exists('p/mockup/scripts/compare.mjs')).toBe(true);
    expect(exists('p/mockup/src/screens/Example.tsx')).toBe(false);
    expect(exists('p/mockup/src/screens/types.ts')).toBe(true);
    expect(read('p/mockup/src/screens/index.ts').replace(/\r/g, '')).toBe(
      "import type { ScreenDef } from './types'\n\nexport type { ScreenDef }\n\nexport const screens: ScreenDef[] = []\n",
    );
    const brief = read('p/brief.md');
    expect(brief.startsWith('# p\n')).toBe(true);
    for (const h of ['Продукт', 'Аудитория', 'Сценарии', 'Настроение', 'Референсы']) expect(brief).toContain(`## ${h}`);
  });

  it('ошибки: продукт есть, кита нет, имя некорректно', async () => {
    await expect(newProduct({ root, product: 'p', kit: 'shadcn' })).rejects.toThrow('Продукт "p" уже существует');
    await expect(newProduct({ root, product: 'q', kit: 'chakra' })).rejects.toThrow('Адаптера для кита "chakra" ещё нет');
    expect(exists('q')).toBe(false);
    await expect(newProduct({ root, product: '../evil', kit: 'shadcn' })).rejects.toThrow('Недопустимое имя продукта');
  });

  it('при сбое установки убирает недостроенный продукт и даёт повторить', async () => {
    const boom = { x: { install: async () => { throw new Error('сеть недоступна'); } } };
    await expect(newProduct({ root, product: 'w', kit: 'x', adapters: boom })).rejects.toThrow('сеть недоступна');
    expect(exists('w')).toBe(false);
    await newProduct({ root, product: 'w', kit: 'shadcn' });
    expect(exists('w/motion.json')).toBe(true);
  });

  it('addStyle копирует стиль и не дублирует кандидата', async () => {
    await addStyle({ root, product: 'p', styleId: 'good' });
    await addStyle({ root, product: 'p', styleId: 'good' });
    expect(JSON.parse(read('p/motion.json')).candidates).toEqual(['good']);
    expect(exists('p/mockup/src/motion/styles/good/passport.md')).toBe(true);
    await expect(addStyle({ root, product: 'p', styleId: 'nope' })).rejects.toThrow(
      'Стиль "nope" не найден в коллекции design/motion/styles',
    );
  });
});

describe('fixStyle / buildMotionSpec', () => {
  const stylesDir = 'r/mockup/src/motion/styles';
  const writeJson = (rel, data) => fs.writeFileSync(p(rel), JSON.stringify(data, null, 2));

  beforeAll(async () => {
    await newProduct({ root, product: 'r', kit: 'shadcn' });
    for (const id of ['a', 'b', 'c']) {
      const edit = {};
      if (id === 'b') edit['tokens.json'] = (t) => t; // duration.fast = 150 из good
      if (id === 'c') {
        edit['passport.md'] = (t) =>
          t
            .replace('| `otp` | Без анимации | | | |', '| `otp` | Луч по полям ввода | `duration.base` | Своя реализация | MIT |')
            .replace('| `otp` |', '| `otp/beam` | Бегущий луч | `duration.slow` | Своя реализация | MIT |\n| `otp` |')
            .replace('Только пакет `motion`: `npm install motion`.', 'Только пакет `motion` и `beam-kit`: `npm install motion beam-kit`.');
      }
      cloneStyle(p(stylesDir, id), id, edit);
    }
    fs.mkdirSync(p('r/mockup/src/motion/styles/_keep'), { recursive: true });
    writeJson('r/motion.json', {
      kit: 'shadcn',
      style: 'b',
      candidates: ['a', 'b', 'c'],
      overrides: [
        { screen: 'Login', element: 'OTP', role: 'otp', use: 'c:otp' },
        { screen: 'Login', element: 'Code', role: 'otp', use: 'c:otp/beam', note: 'Луч вместо вспышки' },
      ],
    });
  });

  it('b проходит lint, так что его можно переносить', () => {
    expect(lintStyle(p(stylesDir, 'b'))).toEqual([]);
    expect(lintStyle(p(stylesDir, 'c'))).toEqual([]);
  });

  it('удаляет лишние кандидаты и переносит стиль в коллекцию', async () => {
    await expect(fixStyle({ root, product: 'p' })).rejects.toThrow('Стиль не выбран: в motion.json style = null');
    const r = await fixStyle({ root, product: 'r' });
    expect(r.removed).toEqual(['a']);
    expect(r.promoted).toBe(true);
    expect(exists('design/motion/styles/b/passport.md')).toBe(true);
    expect(exists('design/motion/styles/c')).toBe(false);
    expect(exists(`${stylesDir}/c`)).toBe(true);
    expect(exists(`${stylesDir}/_keep`)).toBe(true);
    expect(JSON.parse(read('r/motion.json')).candidates).toEqual(['b']);
    const again = await fixStyle({ root, product: 'r' });
    expect(again).toEqual({ removed: [], promoted: false });
  });

  it('опечатка в style: ничего не удаляется', async () => {
    await newProduct({ root, product: 't', kit: 'shadcn' });
    cloneStyle(p('t/mockup/src/motion/styles/a'), 'a');
    cloneStyle(p('t/mockup/src/motion/styles/b'), 'b');
    writeJson('t/motion.json', { kit: 'shadcn', style: 'bb', candidates: ['a', 'b'], overrides: [] });
    const before = read('t/motion.json');
    await expect(fixStyle({ root, product: 't' })).rejects.toThrow('Стиль "bb" из motion.json не найден');
    expect(exists('t/mockup/src/motion/styles/a')).toBe(true);
    expect(exists('t/mockup/src/motion/styles/b')).toBe(true);
    expect(read('t/motion.json')).toBe(before);
  });

  it('не переносит стиль, не прошедший lint', async () => {
    await newProduct({ root, product: 's', kit: 'shadcn' });
    cloneStyle(p('s/mockup/src/motion/styles/bad'), 'bad', { 'tokens.json': () => '{ nope' });
    writeJson('s/motion.json', { kit: 'shadcn', style: 'bad', candidates: ['bad'], overrides: [] });
    const r = await fixStyle({ root, product: 's' });
    expect(r).toEqual({ removed: [], promoted: false });
    expect(exists('design/motion/styles/bad')).toBe(false);
  });

  it('строит motion-spec.md', async () => {
    const spec = await buildMotionSpec({ root, product: 'r' });
    expect(read('r/docs/motion-spec.md')).toBe(spec);
    for (const h of [
      '# Спецификация движения — r', '## Стиль', '## Токены', '## Изменения вида в покое', '## Роли',
      '## Точечные правки', '## Источники и установка', '## Reduced motion', '## Где смотреть в коде',
    ]) expect(spec).toContain(h);
    expect(spec).toContain('| duration.fast | 150 мс |');
    expect(spec).toContain('| distance | 8 px |');
    expect(spec).toContain('| ease.enter | cubic-bezier(0.23, 1, 0.32, 1) |');
    expect(spec).toContain('| spring.snappy | stiffness 700, damping 48, mass 1 |');
    expect(spec).toContain('| Экран | Элемент | Реализация | Комментарий |');
    expect(spec).toContain('| Login | OTP | c:otp | — |');
    expect(spec).toContain('| Login | Code | c:otp/beam | Луч вместо вспышки |');
    expect(spec).toContain('| `otp` | Луч по полям ввода |');
    expect(spec).toContain('| `otp/beam` | Бегущий луч |');
    expect(spec).toContain('### Из стиля c (точечные правки)');
    expect(spec).toContain('beam-kit');
    expect(spec).toContain('mockup/src/motion/styles/b/style.tsx');
    expect(spec).toContain('mockup/src/screens/');
  });

  it('без правок пишет «Нет»', async () => {
    writeJson('r/motion.json', { kit: 'shadcn', style: 'b', candidates: ['b'], overrides: [] });
    const spec = await buildMotionSpec({ root, product: 'r' });
    expect(spec).toMatch(/## Точечные правки\s+Нет\s+## Источники/);
    expect(spec).not.toContain('### Из стиля');
  });
});
