// Общие помощники скриптов продукта.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
// Корень репозитория для CLI: design/motion/scripts -> ../../..
export const REPO_ROOT = path.resolve(SCRIPTS_DIR, '../../..');

export const collectionDir = (root) => path.join(root, 'design/motion/styles');
export const productDir = (root, product) => path.join(root, product);
export const stylesDir = (root, product) => path.join(root, product, 'mockup/src/motion/styles');

export async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readDecisions(root, product) {
  const file = path.join(productDir(root, product), 'motion.json');
  if (!(await exists(file))) throw new Error(`Продукт "${product}" не найден (нет ${product}/motion.json)`);
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function writeDecisions(root, product, data) {
  const file = path.join(productDir(root, product), 'motion.json');
  await fs.writeFile(file, JSON.stringify(data) + '\n');
}

// "c:otp/beam" -> { style: 'c', role: 'otp/beam' }
export function parseUse(use) {
  const i = use.indexOf(':');
  return i === -1 ? { style: use, role: '' } : { style: use.slice(0, i), role: use.slice(i + 1) };
}

// Запускает main(argv) только при прямом вызове файла; печатает ошибки по-русски, код выхода 1.
export function runCli(metaUrl, main) {
  if (!process.argv[1] || pathToFileURL(path.resolve(process.argv[1])).href !== metaUrl) return;
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
