import { defineConfig, devices } from '@playwright/test'

// 빌드 산출물을 vite preview(base '/splendor/')로 서빙하고 스모크 1본을 돌린다.
// M8 회귀망: 빌드 + Web Worker(base 경로) + 전원 AI 자동 완주 (docs/ROADMAP.md M8).
// `npm run test:e2e`가 build를 선행하므로 항상 최신 dist/를 검증한다(stale 산출물 방지).
const PORT = 4173
const BASE_URL = `http://localhost:${PORT}/splendor/`

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000, // AI 자동 완주(체감 지연 제거해도 수십 수) 여유
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
