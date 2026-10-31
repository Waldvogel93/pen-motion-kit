import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// По умолчанию — только src/**; tests/build.test.ts запускается через npm run test:build
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      dir: 'src',
      include: ['**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  }),
)
