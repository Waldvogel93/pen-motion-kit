import { expect, test } from 'vitest'
import { loadStyles } from '../registry'
import type { MotionStyle } from '../types'
import { a, styleWithoutOtp } from './fixtures'

test('стили собираются по id', () => {
  expect(loadStyles({ './styles/a/style.tsx': { default: a } })).toEqual({ a })
})

test('повтор id — ошибка', () => {
  expect(() =>
    loadStyles({ './styles/a/style.tsx': { default: a }, './styles/b/style.tsx': { default: styleWithoutOtp } }),
  ).toThrow(/повторяется id стиля "a"/)
})

test('папка не совпадает с id — ошибка', () => {
  expect(() => loadStyles({ './styles/x/style.tsx': { default: { ...a, id: 'y' } } })).toThrow(/папка "x", а id "y"/)
})

test('нет экспорта по умолчанию — понятная ошибка', () => {
  expect(() => loadStyles({ './styles/a/style.tsx': {} as { default: MotionStyle } })).toThrow(/нет экспорта по умолчанию/)
})
