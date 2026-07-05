/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 프로젝트 사이트 경로 (https://<user>.github.io/splendor/)
  base: '/splendor/',
  plugins: [react()],
  worker: {
    format: 'es',
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/engine/**'],
      // M3부터 활성 게이트 (docs/ROADMAP.md): engine/ 한정 라인 95% / 브랜치 90%
      thresholds: {
        lines: 95,
        branches: 90,
      },
    },
  },
})
