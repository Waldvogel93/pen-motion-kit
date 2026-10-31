// Только в шаблоне: проверяет сверку compareScreen. В продукты не копируется.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'
import { compareScreen, screenshotScreen } from '../scripts/compare.mjs'

const root = path.resolve(import.meta.dirname, '..')
const distHtml = path.join(root, 'dist', 'index.html')
const outDir = path.join(root, 'test-results', 'compare')

test('сверка экрана: сам с собой даёт 0, с закрашенным блоком больше 0', async () => {
  test.setTimeout(300_000)
  execSync('npm run build', { cwd: root, stdio: 'inherit', timeout: 240_000 })
  fs.mkdirSync(outDir, { recursive: true })
  const penPng = path.join(outDir, 'pen.png')
  await screenshotScreen({ distHtml, screen: 'Example', outPath: penPng, size: { width: 800, height: 600 } })

  const same = await compareScreen({ distHtml, screen: 'Example', penPng, outDir: path.join(outDir, 'same') })
  expect(same.mismatch).toBe(0)
  expect(fs.existsSync(same.diffPath)).toBe(true)
  expect(fs.existsSync(path.join(outDir, 'same', 'Example.mockup.png'))).toBe(true)

  const broken = PNG.sync.read(fs.readFileSync(penPng))
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      const i = (y * broken.width + x) * 4
      broken.data[i] = 255
      broken.data[i + 1] = 0
      broken.data[i + 2] = 255
      broken.data[i + 3] = 255
    }
  }
  const brokenPng = path.join(outDir, 'pen-broken.png')
  fs.writeFileSync(brokenPng, PNG.sync.write(broken))
  const diff = await compareScreen({ distHtml, screen: 'Example', penPng: brokenPng, outDir: path.join(outDir, 'broken') })
  expect(diff.mismatch).toBeGreaterThan(0)

  await expect(
    compareScreen({ distHtml, screen: 'Нет такого', penPng, outDir: path.join(outDir, 'unknown') }),
  ).rejects.toThrow(/Нет такого/)
})
