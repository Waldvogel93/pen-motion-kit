// Проверки движка на стилях-фикстурах шаблона. В продукты не копируется.
import { expect, test, type Page } from '@playwright/test'

/** Нажать кнопки стилей подряд, без пауз между кликами: всё укладывается в считанные миллисекунды. */
async function switchRapidly(page: Page, ids: string[]) {
  await page.evaluate((order) => {
    for (const id of order) document.querySelector<HTMLElement>(`[data-testid="style-option-${id}"]`)!.click()
  }, ids)
}

const itemOpacities = (page: Page) =>
  page.$$eval('[data-motion-item]', (els) => els.map((el) => getComputedStyle(el).opacity))

test.describe('rapid switching', () => {
  for (const order of [
    ['fixture-a', 'fixture-b', 'fixture-a', 'fixture-b', 'fixture-a'],
    ['fixture-b', 'fixture-a', 'fixture-b', 'fixture-a', 'fixture-b'],
  ]) {
    test(`ничего не застревает невидимым: ${order.map((i) => i.slice(-1)).join(',')}`, async ({ page }) => {
      await page.goto('/#/Example')
      await expect(page.getByTestId('style-option-fixture-a')).toBeVisible()
      const started = Date.now()
      await switchRapidly(page, order)
      expect(Date.now() - started).toBeLessThan(300)
      await page.waitForTimeout(2500)
      const opacities = await itemOpacities(page)
      expect(opacities.length).toBeGreaterThan(0)
      expect(opacities.every((o) => o === '1')).toBe(true)
      await expect(page.locator('body [data-motion-style]')).toHaveAttribute('data-motion-style', order.at(-1)!)
    })
  }

  test('настоящие клики мышью подряд', async ({ page }) => {
    await page.goto('/#/Example')
    for (const id of ['fixture-b', 'fixture-a', 'fixture-b', 'fixture-a', 'fixture-b']) {
      await page.click(`[data-testid="style-option-${id}"]`, { noWaitAfter: true })
    }
    await page.waitForTimeout(2500)
    const opacities = await itemOpacities(page)
    expect(opacities.length).toBeGreaterThan(0)
    expect(opacities.every((o) => o === '1')).toBe(true)
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('контент виден сразу, без сдвигов и масштаба', async ({ page }) => {
    await page.goto('/?style=fixture-b#/Example')
    await page.waitForTimeout(150)
    const states = await page.$$eval('[data-motion-item]', (els) =>
      els.map((el) => ({ opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform })),
    )
    expect(states.length).toBeGreaterThan(0)
    for (const s of states) {
      expect(s.opacity).toBe('1')
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(s.transform)
    }
  })
})
