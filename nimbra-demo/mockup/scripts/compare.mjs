// Сверка экрана макета с рамкой pen.dev.
// Использование: npm run compare -- <Экран> <pen.png> [styleId]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { chromium } from '@playwright/test'

const fileName = (screen) => screen.replace(/\s*\/\s*/g, '--')

function readPng(file) {
  try {
    return PNG.sync.read(fs.readFileSync(file))
  } catch (e) {
    throw new Error(`Не удалось прочитать PNG «${file}»: ${e.message}`)
  }
}

// Снимок экрана макета в окне заданного размера (панель стилей скрыта).
export async function screenshotScreen({ distHtml, screen, outPath, size, style }) {
  if (!fs.existsSync(distHtml)) throw new Error(`Нет сборки макета «${distHtml}». Сначала выполните vite build.`)
  const url =
    pathToFileURL(distHtml).href + (style ? `?style=${encodeURIComponent(style)}` : '') + `#/${encodeURIComponent(screen)}`
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: size, reducedMotion: 'reduce', deviceScaleFactor: 1 })
    const page = await context.newPage()
    await page.goto(url)
    await page.waitForFunction(() => window.__MOTION__ !== undefined)
    const screens = await page.evaluate(() => window.__MOTION__.screens)
    if (!screens.includes(screen)) {
      throw new Error(`В макете нет экрана «${screen}». Есть: ${screens.join(', ') || 'ни одного'}.`)
    }
    await page.addStyleTag({ content: '[data-motion-panel]{display:none !important}' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(2500)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    await page.screenshot({ path: outPath })
  } finally {
    await browser.close()
  }
}

export async function compareScreen({ distHtml, screen, penPng, outDir, style }) {
  const pen = readPng(penPng)
  const base = fileName(screen)
  const mockupPath = path.join(outDir, `${base}.mockup.png`)
  const diffPath = path.join(outDir, `${base}.diff.png`)
  await screenshotScreen({ distHtml, screen, outPath: mockupPath, size: { width: pen.width, height: pen.height }, style })
  const mockup = readPng(mockupPath)
  if (mockup.width !== pen.width || mockup.height !== pen.height) {
    throw new Error(`Размеры не совпали: рамка ${pen.width}×${pen.height}, макет ${mockup.width}×${mockup.height}.`)
  }
  const diff = new PNG({ width: pen.width, height: pen.height })
  const count = pixelmatch(pen.data, mockup.data, diff.data, pen.width, pen.height, { threshold: 0.1 })
  fs.writeFileSync(diffPath, PNG.sync.write(diff))
  const mismatch = Math.round((count / (pen.width * pen.height)) * 10000) / 100
  return { mismatch, diffPath, mockupPath }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [screen, pen, style] = process.argv.slice(2)
  if (!screen || !pen) {
    console.error('Использование: npm run compare -- <Экран> <pen.png> [styleId]')
    process.exit(1)
  }
  const root = path.resolve(import.meta.dirname, '..')
  try {
    const r = await compareScreen({
      distHtml: path.join(root, 'dist', 'index.html'),
      screen,
      penPng: path.resolve(root, pen),
      outDir: path.join(root, 'compare', 'diff'),
      style,
    })
    console.log(`Расхождение: ${r.mismatch}% — ${r.diffPath}`)
    console.log(`Снимок макета: ${r.mockupPath}`)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
