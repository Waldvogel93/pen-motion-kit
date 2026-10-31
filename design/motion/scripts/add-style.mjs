// Копирует стиль из коллекции в продукт и добавляет в кандидаты.
// Использование: node design/motion/scripts/add-style.mjs <product> <styleId>
import fs from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, collectionDir, exists, readDecisions, runCli, stylesDir, writeDecisions } from './lib.mjs';

export async function addStyle({ root, product, styleId }) {
  const src = path.join(collectionDir(root), styleId);
  if (!(await exists(src))) throw new Error(`Стиль "${styleId}" не найден в коллекции design/motion/styles`);
  const data = await readDecisions(root, product);
  await fs.cp(src, path.join(stylesDir(root, product), styleId), { recursive: true });
  if (!data.candidates.includes(styleId)) data.candidates.push(styleId);
  await writeDecisions(root, product, data);
}

runCli(import.meta.url, async ([product, styleId]) => {
  if (!product || !styleId) throw new Error('Использование: node add-style.mjs <product> <styleId>');
  await addStyle({ root: REPO_ROOT, product, styleId });
  console.log(`Стиль "${styleId}" добавлен в кандидаты продукта "${product}"`);
});
