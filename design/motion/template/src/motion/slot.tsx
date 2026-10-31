import { motion, type HTMLMotionProps } from 'motion/react'
import { Slot } from 'radix-ui'
import { Fragment, isValidElement, type ReactNode } from 'react'

const SlotMotion = motion.create(Slot.Root)

type MotionSlotProps = Omit<HTMLMotionProps<'div'>, 'children' | 'ref'> & { children?: ReactNode }

/**
 * Motion-свойства роли без лишнего узла в DOM: ложатся прямо на единственный элемент-ребёнок
 * (DOM-тег или компонент, который передаёт ref своему DOM-узлу, как кнопки shadcn).
 * Текст, несколько детей или фрагмент Radix Slot не принимает — тогда обёртка motion.div с теми же свойствами.
 */
export function MotionSlot({ children, ...props }: MotionSlotProps) {
  if (isValidElement(children) && children.type !== Fragment) return <SlotMotion {...props}>{children}</SlotMotion>
  return <motion.div {...props}>{children}</motion.div>
}
