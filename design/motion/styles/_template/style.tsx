// Заготовка стиля. Копируйте папку как <id>/ и меняйте. Файл компилируется только в копии внутри
// mockup/src/motion/styles/<id>/ — путь '../../types' ведёт в движок продукта, поэтому здесь
// (в design/motion/styles/_template) он не собирается. Поле id должно совпадать с именем папки.
import type { MotionStyle, MotionTokens } from '../../types'
import tokensJson from './tokens.json'
import './style.css'

const tokens = tokensJson as MotionTokens

const style: MotionStyle = {
  id: '_template',
  name: 'Название стиля',
  tagline: 'Одна строка о характере движения',
  tokens,
  restingChanges: [],
  references: [],
  roles: {},
}

export default style
