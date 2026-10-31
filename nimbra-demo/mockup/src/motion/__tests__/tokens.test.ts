import { expect, test } from 'vitest'
import roleIds from '../role-ids.json'
import { cssVars, sec, spring } from '../tokens'
import { ROLE_IDS_FROM_TYPES, type RoleId } from '../types'
import { fixtureTokens } from './fixtures'

test('sec и cssVars', () => {
  expect(sec(240)).toBe(0.24)
  expect(cssVars(fixtureTokens)).toEqual({
    '--m-fast': '150ms', '--m-base': '240ms', '--m-slow': '400ms',
    '--m-ease-enter': 'cubic-bezier(0.23, 1, 0.32, 1)', '--m-ease-exit': 'cubic-bezier(0.3, 0, 1, 1)',
    '--m-ease-move': 'cubic-bezier(0.77, 0, 0.175, 1)', '--m-stagger': '40ms', '--m-distance': '8px', '--m-blur': '0px',
  })
})

test('spring — переход Motion из токена пружины', () => {
  expect(spring(fixtureTokens.spring.snappy)).toEqual({ type: 'spring', stiffness: 500, damping: 32, mass: 1 })
})

test('role-ids.json совпадает с RoleId', () => {
  expect(roleIds).toEqual(ROLE_IDS_FROM_TYPES)
  // Проверка при сборке (tsc -b): в массиве есть каждая роль из объединения RoleId.
  const complete: Exclude<RoleId, (typeof ROLE_IDS_FROM_TYPES)[number]> extends never ? true : false = true
  expect(complete).toBe(true)
})
