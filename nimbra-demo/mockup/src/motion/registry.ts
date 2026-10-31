import type { MotionStyle } from './types'

/** Стили по id из модулей вида `…/styles/<папка>/style.tsx`; папка должна совпадать с id. */
export function loadStyles(mods: Record<string, { default: MotionStyle }>): Record<string, MotionStyle> {
  const styles: Record<string, MotionStyle> = {}
  for (const [file, mod] of Object.entries(mods)) {
    const style = mod.default
    if (!style) throw new Error(`Стиль ${file}: нет экспорта по умолчанию с объектом стиля`)
    if (Object.hasOwn(styles, style.id)) throw new Error(`Стиль ${file}: повторяется id стиля "${style.id}"`)
    const folder = file.split('/').at(-2)
    if (folder !== style.id) throw new Error(`Стиль ${file}: папка "${folder}", а id "${style.id}" — они должны совпадать`)
    styles[style.id] = style
  }
  return styles
}

export const styles = loadStyles(import.meta.glob<{ default: MotionStyle }>('./styles/*/style.tsx', { eager: true }))
