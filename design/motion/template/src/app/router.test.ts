import { describe, expect, test } from 'vitest'
import { parseHash } from './router'

describe('parseHash', () => {
  test('экран по id, иначе первый', () => {
    expect(parseHash('#/Login', ['Home', 'Login'])).toBe('Login')
    expect(parseHash('#/Nope', ['Home', 'Login'])).toBe('Home')
    expect(parseHash('', ['Home', 'Login'])).toBe('Home')
    expect(parseHash('#/Login%20%2F%20error', ['Home', 'Login / error'])).toBe('Login / error')
  })

  test('пустой список экранов даёт пустую строку', () => {
    expect(parseHash('#/Login', [])).toBe('')
    expect(parseHash('', [])).toBe('')
  })

  test('битая кодировка не падает, берётся первый экран', () => {
    expect(parseHash('#/%E0%A4%A', ['Home'])).toBe('Home')
  })
})
