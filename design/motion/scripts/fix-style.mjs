// Фиксирует выбранный стиль: удаляет лишних кандидатов, переносит стиль в коллекцию.
// Использование: node design/motion/scripts/fix-style.mjs <product>
import fs from 'node:fs/promises';
import path from 'node:path';
import { lintStyle } from './lint-style.mjs';
import { REPO_ROOT, collectionDir, exists, parseUse, readDecisions, runCli, stylesDir, writeDecisions } from './lib.mjs';

// log(строка) получает замечания lint, если перенос в коллекцию не состоялся.
export async function fixStyle({ root, product, log = () => {} }) {
  const data = await readDecisions(root, product);
  if (data.style === null || data.style === undefined) throw new Error('Стиль не выбран: в motion.json style = null');

  const dir = stylesDir(root, product);
  if (!(await exists(path.join(dir, data.style)))) {
    throw new Error(
      `Стиль "${data.style}" из motion.json не найден в ${product}/mockup/src/motion/styles (кандидаты лежат там; копия в коллекции mockup не подхватывается) — ничего не удалено`,
    );
  }
  const keep = new Set([data.style, ...data.overrides.map((o) => parseUse(o.use).style)]);
  const removed = [];
  if (await exists(dir)) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || keep.has(entry.name)) continue;
      await fs.rm(path.join(dir, entry.name), { recursive: true, force: true });
      removed.push(entry.name);
    }
  }
  removed.sort();

  let promoted = false;
  const target = path.join(collectionDir(root), data.style);
  if (!(await exists(target))) {
    const problems = lintStyle(path.join(dir, data.style));
    if (problems.length === 0) {
      await fs.cp(path.join(dir, data.style), target, { recursive: true });
      promoted = true;
    } else {
      log(`Стиль "${data.style}" не перенесён в коллекцию, lint нашёл проблемы:\n${problems.join('\n')}`);
    }
  }

  data.candidates = [data.style];
  await writeDecisions(root, product, data);
  return { removed, promoted };
}

runCli(import.meta.url, async ([product]) => {
  if (!product) throw new Error('Использование: node fix-style.mjs <product>');
  const { removed, promoted } = await fixStyle({ root: REPO_ROOT, product, log: console.error });
  console.log(`Удалено кандидатов: ${removed.length ? removed.join(', ') : 'нет'}`);
  console.log(promoted ? 'Стиль перенесён в design/motion/styles' : 'Стиль в коллекцию не переносился');
});
