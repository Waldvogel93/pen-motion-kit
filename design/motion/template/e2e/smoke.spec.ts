// Общая проверка: копируется в продукты. Не знает про конкретные стили и экраны — читает window.__MOTION__.
import { execSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

type Motion = { screens: string[]; candidates: string[] }

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return errors
}

async function readMotion(page: Page): Promise<Motion> {
  await page.waitForFunction(() => (window as unknown as { __MOTION__?: unknown }).__MOTION__ !== undefined)
  return page.evaluate(() => (window as unknown as { __MOTION__: Motion }).__MOTION__)
}

test('every screen × every candidate', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  const motion = await readMotion(page)
  const screens = motion.screens.filter((id) => !id.startsWith('_'))
  expect(screens.length, 'в макете нет ни одного экрана').toBeGreaterThan(0)
  // Кандидатов нет, когда стиль уже выбран: тогда проверяем выбранный (без ?style=).
  const styles: (string | null)[] = motion.candidates.length > 0 ? motion.candidates : [null]
  for (const style of styles) {
    for (const screen of screens) {
      const query = style === null ? '' : `?style=${encodeURIComponent(style)}`
      await page.goto(`/${query}#/${encodeURIComponent(screen)}`)
      await expect(page.locator('body [data-motion-style]')).toBeVisible()
      await page.waitForTimeout(300)
      const problems = page.getByTestId('motion-problems')
      const text = (await problems.count()) === 0 ? '' : ((await problems.textContent()) ?? '').trim()
      expect(text, `проблемы: ${style ?? 'без стиля'} × ${screen}`).toBe('')
    }
  }
  expect(errors).toEqual([])
})

test('offline single file', async ({ page }) => {
  test.setTimeout(240_000)
  execSync('npm run build', { cwd: path.resolve(import.meta.dirname, '..'), stdio: 'pipe' })
  const file = path.resolve(import.meta.dirname, '..', 'dist', 'index.html')
  const errors = collectErrors(page)
  const blocked: string[] = []
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('file:') || url.startsWith('data:')) return route.continue()
    blocked.push(url)
    return route.abort()
  })
  await page.goto(pathToFileURL(file).href)
  const motion = await readMotion(page)
  expect(motion.screens.length, 'в сборке нет ни одного экрана').toBeGreaterThan(0)
  await expect(page.locator('body [data-motion-style]')).toBeVisible()
  expect(((await page.locator('body').innerText()) ?? '').trim().length).toBeGreaterThan(0)
  await page.waitForTimeout(500)
  // Итог загрузки проверяется до контроля: контрольный запрос сам пишет ошибку в консоль.
  expect(blocked).toEqual([])
  expect(errors).toEqual([])
  // Контроль: перехват действительно срабатывает на запросы страницы, иначе пустой blocked ничего не доказывает.
  await page.evaluate(() => fetch('https://example.invalid/control').catch(() => {}))
  expect(blocked).toEqual(['https://example.invalid/control'])
})
