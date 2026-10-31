// Тестовый стиль «good»: появление экрана каскадом, кнопка сжимается при нажатии.
import { stagger, type Variants } from 'motion/react'
import { EnterProvider } from '../../enter'
import { useMotionRuntime } from '../../runtime'
import { MotionSlot } from '../../slot'
import { sec } from '../../tokens'
import type { MotionStyle, MotionTokens, RoleProps } from '../../types'
import tokensJson from './tokens.json'
import './style.css'

const tokens = tokensJson as MotionTokens

const screenVariants: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: stagger(sec(tokens.stagger)) } },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: tokens.distance },
  visible: { opacity: 1, y: 0, transition: { duration: sec(tokens.duration.base), ease: tokens.ease.enter } },
}

function ScreenEnter({ children, className }: RoleProps) {
  return (
    <EnterProvider itemVariants={itemVariants}>
      <MotionSlot className={className} variants={screenVariants} initial="hidden" animate="visible">
        {children}
      </MotionSlot>
    </EnterProvider>
  )
}

function Button({ children, className }: RoleProps) {
  const { reduced } = useMotionRuntime()
  return (
    <MotionSlot
      className={className}
      whileTap={reduced ? { opacity: 0.85 } : { scale: 0.97 }}
      transition={{ duration: sec(tokens.duration.fast), ease: tokens.ease.enter }}
    >
      {children}
    </MotionSlot>
  )
}

const style: MotionStyle = {
  id: 'good',
  name: 'Хороший — растворение',
  tagline: 'Экран проявляется каскадом, кнопка отзывается на нажатие',
  tokens,
  restingChanges: [],
  references: [],
  roles: { 'screen-enter': ScreenEnter, button: Button },
}

export default style
