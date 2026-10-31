import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Изоляция: размонтировать деревья и сбросить то, что MotionRoot ставит на <html>.
afterEach(() => {
  cleanup()
  const html = document.documentElement
  html.removeAttribute('data-motion-style')
  html.removeAttribute('data-motion-reduced')
  html.removeAttribute('style')
})
