import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('сборка — один самодостаточный index.html', () => {
  expect(readdirSync('dist')).toEqual(['index.html'])
  const html = readFileSync('dist/index.html', 'utf8')
  expect(html).not.toMatch(/<script[^>]+src=/)
  expect(html).not.toMatch(/<link[^>]+rel="stylesheet"[^>]+href=/)
})
