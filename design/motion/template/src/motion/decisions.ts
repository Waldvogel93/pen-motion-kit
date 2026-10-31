import { ROLE_IDS_FROM_TYPES } from './types'
import type { MotionDecisions, MotionStyle, Override, RoleId, RoleImpl } from './types'

/** motion.json не той формы. Текст — для человека, на русском. */
export class DecisionsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DecisionsError'
  }
}

function fail(what: string): never {
  throw new DecisionsError(`motion.json: ${what}`)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(`поле ${path} — ожидается строка`)
  return v
}

function isRoleId(v: string): v is RoleId {
  return (ROLE_IDS_FROM_TYPES as readonly string[]).includes(v)
}

/** Только собственные ключи: `a:constructor` или `?style=toString` не должны найти что-то в прототипе. */
function own<T>(rec: { readonly [key: string]: T | undefined } | undefined, key: string): T | undefined {
  return rec && Object.hasOwn(rec, key) ? rec[key] : undefined
}

export function parseDecisions(raw: unknown): MotionDecisions {
  if (!isObject(raw)) fail('ожидается объект { kit, style, candidates, overrides }')
  const kit = str(raw.kit, 'kit')
  const style = raw.style === null || typeof raw.style === 'string' ? raw.style : fail('поле style — ожидается строка или null')
  if (!Array.isArray(raw.candidates)) fail('поле candidates — ожидается массив id стилей')
  const candidates = raw.candidates.map((c, i) => str(c, `candidates[${i}]`))
  if (!Array.isArray(raw.overrides)) fail('поле overrides — ожидается массив')
  const overrides = raw.overrides.map((o: unknown, i): Override => {
    const at = `overrides[${i}]`
    if (!isObject(o)) fail(`${at} — ожидается объект { screen, element, role, use }`)
    const role = str(o.role, `${at}.role`)
    if (!isRoleId(role)) fail(`поле ${at}.role — неизвестная роль "${role}"`)
    const override: Override = { screen: str(o.screen, `${at}.screen`), element: str(o.element, `${at}.element`), role, use: str(o.use, `${at}.use`) }
    if (o.note !== undefined) override.note = str(o.note, `${at}.note`)
    return override
  })
  return { kit, style, candidates, overrides }
}

export interface UseRef { styleId: string; roleId: string; variant?: string }

const USE_PATTERN = /^([\w-]+):([\w-]+)(?:\/([\w-]+))?$/

/** Разбор ссылки `стиль:роль` или `стиль:роль/вариант` из overrides[].use. */
export function parseUse(use: string): UseRef | null {
  const m = USE_PATTERN.exec(use)
  if (!m) return null
  return m[3] === undefined ? { styleId: m[1], roleId: m[2] } : { styleId: m[1], roleId: m[2], variant: m[3] }
}

/** Найденная реализация и откуда она: стиль и роль (или "роль/вариант") — для сообщений о сбоях. */
export interface RoleSource { impl: RoleImpl; styleId: string; roleKey: string }

type Lookup = RoleSource | { problem: (at: string) => string }

function lookupUse(styles: Record<string, MotionStyle>, use: string): Lookup {
  const ref = parseUse(use)
  if (!ref) return { problem: (at) => `Неверная ссылка "${use}" в ${at}: ожидается "стиль:роль" или "стиль:роль/вариант"` }
  const { styleId } = ref
  const style = own(styles, styleId)
  if (!style) return { problem: (at) => `Неизвестный стиль "${styleId}" в ${at}` }
  if (ref.variant === undefined) {
    const impl = own(style.roles, ref.roleId)
    return impl ? { impl, styleId, roleKey: ref.roleId } : { problem: (at) => `Нет роли "${ref.roleId}" у стиля "${styleId}" (${at})` }
  }
  const key = `${ref.roleId}/${ref.variant}`
  const impl = own(style.variants, key)
  return impl ? { impl, styleId, roleKey: key } : { problem: (at) => `Нет варианта "${key}" у стиля "${styleId}" (${at})` }
}

/** Реализация роли по ссылке `use`; null, если ссылка битая. */
export function resolveUse(styles: Record<string, MotionStyle>, use: string): RoleImpl | null {
  const found = lookupUse(styles, use)
  return 'impl' in found ? found.impl : null
}

/** То же, что resolveUse, но вместе с источником (стиль и роль) — для защиты роли и сообщений о сбоях. */
export function resolveUseSource(styles: Record<string, MotionStyle>, use: string): RoleSource | null {
  const found = lookupUse(styles, use)
  return 'impl' in found ? found : null
}

export function validateDecisions(d: MotionDecisions, styles: Record<string, MotionStyle>): string[] {
  const problems: string[] = []
  if (d.style === null && d.candidates.length === 0) problems.push('Нет ни одного стиля: candidates пуст, а style не задан')
  if (d.style !== null && !own(styles, d.style)) problems.push(`Неизвестный стиль "${d.style}" в style`)
  for (const id of d.candidates) if (!own(styles, id)) problems.push(`Неизвестный стиль "${id}" в candidates`)
  d.overrides.forEach((o, i) => {
    const found = lookupUse(styles, o.use)
    if ('problem' in found) problems.push(found.problem(`overrides[${i}]`))
  })
  return problems
}

/**
 * Реализация роли для элемента: точечная правка из overrides, иначе роль активного стиля, иначе null
 * (тогда роль рендерит детей как есть). Битая правка не ломает экран — о ней сообщает validateDecisions.
 */
export function resolveRole(
  d: MotionDecisions,
  styles: Record<string, MotionStyle>,
  activeId: string,
  screen: string,
  element: string | undefined,
  role: RoleId,
): RoleImpl | null {
  return resolveRoleSource(d, styles, activeId, screen, element, role)?.impl ?? null
}

/** То же, что resolveRole, но вместе с источником реализации. */
export function resolveRoleSource(
  d: MotionDecisions,
  styles: Record<string, MotionStyle>,
  activeId: string,
  screen: string,
  element: string | undefined,
  role: RoleId,
): RoleSource | null {
  if (element !== undefined) {
    const o = d.overrides.find((o) => o.screen === screen && o.element === element && o.role === role)
    const found = o && lookupUse(styles, o.use)
    if (found && 'impl' in found) return found
  }
  const impl = own(own(styles, activeId)?.roles, role)
  return impl ? { impl, styleId: activeId, roleKey: role } : null
}

export function unknownOverrideElements(overrides: Override[], screen: string, rendered: Set<string>): string[] {
  return overrides.flatMap((o, i) =>
    o.screen === screen && !rendered.has(o.element)
      ? [`Элемент "${o.element}" из overrides[${i}] не найден на экране "${screen}" — переименован в pen.dev?`]
      : [],
  )
}

/** `?style=<id>` берётся, только если id есть в candidates; иначе style, иначе первый кандидат, иначе ''. */
export function initialStyle(d: MotionDecisions, search: string): string {
  const wanted = new URLSearchParams(search).get('style')
  if (wanted !== null && d.candidates.includes(wanted)) return wanted
  return d.style ?? d.candidates[0] ?? ''
}
