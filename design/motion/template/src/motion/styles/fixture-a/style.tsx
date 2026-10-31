// Стиль-фикстура шаблона: ни одна роль не задана — экран выглядит и ведёт себя ровно как макет.
// В продукты не копируется.
import type { MotionStyle, MotionTokens } from '../../types'
import tokens from './tokens.json'

const style: MotionStyle = {
  id: 'fixture-a',
  name: 'Фикстура A — без анимации',
  tagline: 'Чистый макет: ни одна роль не анимирована',
  tokens: tokens as MotionTokens,
  restingChanges: [],
  references: [],
  roles: {},
}

export default style
