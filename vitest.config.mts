import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { coverageConfigDefaults, defineConfig } from 'vitest/config'

const r = (p: string): string => resolve(import.meta.dirname, p)

const define = {
  __BUILD_SHA__: JSON.stringify(process.env.BUILD_SHA ?? 'dev'),
  __BUILD_RUN__: JSON.stringify(process.env.BUILD_RUN ?? ''),
  __BUILD_BRANCH__: JSON.stringify(process.env.BUILD_BRANCH ?? '')
}

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      exclude: [
        ...coverageConfigDefaults.exclude,
        'native/**',
        '**/*.d.ts',
        '**/*.md'
      ]
    },
    projects: [
      {
        plugins: [react()],
        define,
        resolve: {
          alias: {
            '@pkg': r('package.json'),
            '@settings': r('src/renderer/src/components/pages/settings'),
            '@renderer': r('src/renderer/src'),
            '@store': r('src/renderer/src/store'),
            '@utils': r('src/renderer/src/utils'),
            '@shared': r('src/main/shared'),
            '@main': r('src/main')
          }
        },
        test: {
          name: 'renderer',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          testTimeout: 15000,
          // @mui ships ESM with directory imports Node cannot resolve when externalized
          server: { deps: { inline: [/@mui\//] } }
        }
      },
      {
        define,
        resolve: {
          alias: {
            '@main': r('src/main'),
            '@shared': r('src/main/shared')
          }
        },
        test: {
          name: 'main',
          globals: true,
          environment: 'node',
          setupFiles: ['./vitest.main.setup.ts'],
          include: ['src/main/**/*.test.ts', 'src/preload/**/*.test.ts']
        }
      }
    ]
  }
})
