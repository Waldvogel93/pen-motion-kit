// Создаёт продукт: brief.md, motion.json, docs/ и mockup/ из шаблона.
// Использование: node design/motion/scripts/new-product.mjs <product> [--kit shadcn]
import fs from 'node:fs/promises';
import path from 'node:path';
import { ADAPTERS } from './adapters.mjs';
import { REPO_ROOT, exists, productDir, runCli } from './lib.mjs';

const EXCLUDED_ANYWHERE = new Set(['node_modules', 'dist', 'test-results', 'playwright-report', 'compare']);

// rel — путь внутри шаблона через «/».
function isExcluded(rel) {
  if (rel === '') return false;
  const parts = rel.split('/');
  return (
    parts.some((s) => EXCLUDED_ANYWHERE.has(s)) ||
    rel === 'fixtures' ||
    rel.startsWith('fixtures/') ||
    rel === 'e2e/runtime.spec.ts' ||
    rel === 'e2e/compare.spec.ts' ||
    rel === 'src/screens/Example.tsx' ||
    rel.startsWith('src/motion/styles/fixture-')
  );
}

const SCREENS_INDEX = `import type { ScreenDef } from './types'

export type { ScreenDef }

export const screens: ScreenDef[] = []
`;

const briefText = (product) => `# ${product}

## Продукт
Что это за продукт и какую задачу решает — одной-двумя фразами.

## Аудитория
Кто пользуется и в какой обстановке.

## Сценарии
Главные пути пользователя, по которым будет смотреться движение.

## Настроение
Какое ощущение должно оставаться от интерфейса.

## Референсы
Ссылки на продукты и экраны, на которые хочется равняться.
`;

export async function newProduct({ root, product, kit, adapters = ADAPTERS }) {
  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(product)) {
    throw new Error(`Недопустимое имя продукта "${product}": только буквы, цифры, «-» и «_», без путей`);
  }
  const adapter = adapters[kit];
  if (!adapter) {
    throw new Error(
      `Адаптера для кита "${kit}" ещё нет — сначала доработай адаптер (см. .claude/skills/pen-motion/references/pen-to-react.md, раздел «Новый кит»)`,
    );
  }
  const dir = productDir(root, product);
  if (await exists(dir)) throw new Error(`Продукт "${product}" уже существует`);

  const template = path.join(root, 'design/motion/template');
  const mockup = path.join(dir, 'mockup');
  try {
    await fs.mkdir(path.join(dir, 'docs'), { recursive: true });
    await fs.writeFile(path.join(dir, 'brief.md'), briefText(product));
    await fs.writeFile(
      path.join(dir, 'motion.json'),
      JSON.stringify({ kit, style: null, candidates: [], overrides: [] }) + '\n',
    );
    await fs.cp(template, mockup, {
      recursive: true,
      filter: (src) => !isExcluded(path.relative(template, src).split(path.sep).join('/')),
    });
    await fs.writeFile(path.join(mockup, 'src/screens/index.ts'), SCREENS_INDEX);
    await adapter.install(mockup);
  } catch (e) {
    // Убираем только то, что создали сами: папки продукта до вызова не было.
    await fs.rm(dir, { recursive: true, force: true });
    throw e;
  }
}

runCli(import.meta.url, async (args) => {
  const kitAt = args.indexOf('--kit');
  const kit = kitAt === -1 ? 'shadcn' : args[kitAt + 1];
  const product = args.find((a, i) => !a.startsWith('--') && (kitAt === -1 || i !== kitAt + 1));
  if (!product) throw new Error('Использование: node new-product.mjs <product> [--kit shadcn]');
  await newProduct({ root: REPO_ROOT, product, kit });
  console.log(`Продукт "${product}" создан: ${product}/brief.md, ${product}/motion.json, ${product}/mockup/`);
});
