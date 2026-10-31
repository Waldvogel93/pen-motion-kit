import type { Variants } from 'motion/react'
import { createContext, useContext, type ReactNode } from 'react'

const EnterContext = createContext<Variants | null>(null)

/**
 * Реализация роли `screen-enter` кладёт сюда варианты для R.Item; родитель — motion-компонент
 * с initial/animate, каскад задаётся его `transition.delayChildren`.
 */
export function EnterProvider({ itemVariants, children }: { itemVariants: Variants; children: ReactNode }) {
  return <EnterContext value={itemVariants}>{children}</EnterContext>
}

export function useEnterItemVariants(): Variants | null {
  return useContext(EnterContext)
}
