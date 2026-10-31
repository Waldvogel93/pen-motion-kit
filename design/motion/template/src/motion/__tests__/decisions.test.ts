import { describe, expect, test } from 'vitest'
import {
  DecisionsError,
  initialStyle,
  parseDecisions,
  parseUse,
  resolveRole,
  resolveRoleSource,
  resolveUse,
  unknownOverrideElements,
  validateDecisions,
} from '../decisions'
import { a, b, d, empty, styleWithoutOtp, withOverride } from './fixtures'

describe('parseDecisions', () => {
  test('неверная форма — DecisionsError с понятным сообщением', () => {
    expect(() => parseDecisions({ style: 5 })).toThrow(DecisionsError)
    expect(() => parseDecisions(null)).toThrow(DecisionsError)
    expect(() => parseDecisions({ kit: 'shadcn', style: 5, candidates: [], overrides: [] })).toThrow(/style/)
    expect(() =>
      parseDecisions({
        kit: 'shadcn', style: null, candidates: [],
        overrides: [{ screen: 'Login', element: 'OTP', role: 'nope', use: 'a:otp' }],
      }),
    ).toThrow(/overrides\[0\]\.role/)
  })

  test('верная форма проходит без изменений', () => {
    const raw = {
      kit: 'shadcn', style: null, candidates: ['a', 'b'],
      overrides: [{ screen: 'Login', element: 'OTP', role: 'otp', use: 'b:otp', note: 'луч' }],
    }
    expect(parseDecisions(raw)).toEqual(raw)
  })
})

describe('validateDecisions', () => {
  test('неизвестные стили в candidates и style', () => {
    expect(validateDecisions({ kit: 'shadcn', style: null, candidates: ['a', 'ghost'], overrides: [] }, { a }))
      .toEqual(['Неизвестный стиль "ghost" в candidates'])
    expect(validateDecisions(d({ style: 'ghost' }), { a })).toEqual(['Неизвестный стиль "ghost" в style'])
    expect(validateDecisions(d(), { a })).toEqual([])
  })

  test('пустые candidates без style — нет ни одного стиля', () => {
    expect(validateDecisions(d({ candidates: [] }), { a }))
      .toEqual(['Нет ни одного стиля: candidates пуст, а style не задан'])
    expect(validateDecisions(d({ style: 'a', candidates: [] }), { a })).toEqual([])
  })

  test('ссылки в overrides', () => {
    expect(validateDecisions(d({ overrides: [{ screen: 'Login', element: 'OTP', role: 'otp', use: 'a-otp' }] }), { a }))
      .toEqual(['Неверная ссылка "a-otp" в overrides[0]: ожидается "стиль:роль" или "стиль:роль/вариант"'])
    expect(validateDecisions(d({ overrides: [{ screen: 'Login', element: 'OTP', role: 'otp', use: 'a:otp' }] }), { a: styleWithoutOtp }))
      .toEqual(['Нет роли "otp" у стиля "a" (overrides[0])'])
    expect(validateDecisions(d({ overrides: [{ screen: 'Login', element: 'OTP', role: 'otp', use: 'ghost:otp' }] }), { a }))
      .toEqual(['Неизвестный стиль "ghost" в overrides[0]'])
    expect(validateDecisions(withOverride('b:otp/glow'), { a, b }))
      .toEqual(['Нет варианта "otp/glow" у стиля "b" (overrides[0])'])
    expect(validateDecisions(withOverride('b:otp/beam'), { a, b })).toEqual([])
  })
})

describe('parseUse и resolveUse', () => {
  test('разбор ссылки', () => {
    expect(parseUse('b:otp')).toEqual({ styleId: 'b', roleId: 'otp' })
    expect(parseUse('b:otp/beam')).toEqual({ styleId: 'b', roleId: 'otp', variant: 'beam' })
    expect(parseUse('a-otp')).toBeNull()
    expect(parseUse('a:otp/')).toBeNull()
  })

  test('реализация по ссылке', () => {
    expect(resolveUse({ a, b }, 'b:otp')).toBe(b.roles.otp)
    expect(resolveUse({ a, b }, 'b:otp/beam')).toBe(b.variants!['otp/beam'])
    expect(resolveUse({ a, b }, 'ghost:otp')).toBeNull()
    expect(resolveUse({ a, b }, 'a:constructor')).toBeNull()
  })
})

describe('resolveRole', () => {
  test('точечная правка, роль активного стиля, отсутствие реализации', () => {
    expect(resolveRole(withOverride('b:otp'), { a, b }, 'a', 'Login', 'OTP', 'otp')).toBe(b.roles.otp)
    expect(resolveRole(withOverride('b:otp'), { a, b }, 'a', 'Login', 'Other', 'otp')).toBe(a.roles.otp)
    expect(resolveRole(withOverride('b:otp/beam'), { a, b }, 'a', 'Login', 'OTP', 'otp')).toBe(b.variants!['otp/beam'])
    expect(resolveRole(empty, { a: styleWithoutOtp }, 'a', 'Login', undefined, 'otp')).toBeNull()
  })

  test('источник реализации — для сообщений о сбоях', () => {
    expect(resolveRoleSource(withOverride('b:otp/beam'), { a, b }, 'a', 'Login', 'OTP', 'otp'))
      .toEqual({ impl: b.variants!['otp/beam'], styleId: 'b', roleKey: 'otp/beam' })
    expect(resolveRoleSource(withOverride('b:otp'), { a, b }, 'a', 'Login', 'Other', 'otp'))
      .toEqual({ impl: a.roles.otp, styleId: 'a', roleKey: 'otp' })
    expect(resolveRoleSource(empty, { a: styleWithoutOtp }, 'a', 'Login', undefined, 'otp')).toBeNull()
  })

  test('битая правка и неизвестный активный стиль не ломают экран', () => {
    expect(resolveRole(withOverride('ghost:otp'), { a, b }, 'a', 'Login', 'OTP', 'otp')).toBe(a.roles.otp)
    expect(resolveRole(empty, { a }, 'ghost', 'Login', undefined, 'otp')).toBeNull()
  })
})

test('unknownOverrideElements', () => {
  expect(unknownOverrideElements([{ screen: 'Login', element: 'OTP', role: 'otp', use: 'a:otp' }], 'Login', new Set(['Email'])))
    .toEqual(['Элемент "OTP" из overrides[0] не найден на экране "Login" — переименован в pen.dev?'])
  expect(unknownOverrideElements([{ screen: 'Login', element: 'OTP', role: 'otp', use: 'a:otp' }], 'Home', new Set())).toEqual([])
})

test('initialStyle', () => {
  expect(initialStyle(d({ style: null, candidates: ['a', 'b'] }), '?style=b')).toBe('b')
  expect(initialStyle(d({ style: null, candidates: ['a', 'b'] }), '?style=zzz')).toBe('a')
  expect(initialStyle(d({ style: 'b', candidates: ['b'] }), '?style=a')).toBe('b')
  expect(initialStyle(d({ style: null, candidates: [] }), '')).toBe('')
})
