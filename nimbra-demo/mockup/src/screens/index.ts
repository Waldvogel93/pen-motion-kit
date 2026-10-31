import Home from './Home'
import Login, { LoginCode, LoginError } from './Login'
import type { ScreenDef } from './types'

export type { ScreenDef }

export const screens: ScreenDef[] = [
  { id: 'Home', title: 'Главная', component: Home },
  { id: 'Login', title: 'Вход', component: Login },
  // Нарисованные состояния — для сверки с рамками pen.dev
  { id: 'Login / code', title: 'Вход — ввод кода', component: LoginCode },
  { id: 'Login / error', title: 'Вход — неверный код', component: LoginError },
]
